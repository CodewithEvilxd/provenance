import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeGraphClient, query } from "@provenance/graph/client";
import { reviewGraph } from "../src/reviewer.js";
import { HISTORICAL_EVALUATION_DATASET } from "../src/eval-dataset.js";

const TEST_GRAPH = "eval-temporal-leakage-test";

describe("Temporal data leakage prevention", () => {
  beforeAll(async () => {
    await query(TEST_GRAPH, "MATCH (n) DETACH DELETE n").catch(() => {});
    await query(
      TEST_GRAPH,
      `CREATE (:Function {
        id: "fn:packages/vite/src/node/config.ts#resolveConfig",
        name: "resolveConfig",
        file: "packages/vite/src/node/config.ts"
      })`,
    );
  });

  afterAll(async () => {
    await query(TEST_GRAPH, "MATCH (n) DETACH DELETE n").catch(() => {});
    await closeGraphClient();
  });

  it("excludes future incidents and decisions after merge-time cutoff", async () => {
    const fnId = "fn:packages/vite/src/node/config.ts#resolveConfig";
    const cutoff = "2026-03-01T12:00:00Z";
    const cutoffMs = Date.parse(cutoff);

    // Add prior incident and prior decision before cutoff
    await query(
      TEST_GRAPH,
      `MATCH (fn:Function {id: $fnId})
       CREATE (c1:Commit {id: "c:prior", sha: "c-prior-sha"})
       CREATE (c1)-[:MODIFIED]->(fn)
       CREATE (inc1:Incident {
         id: "inc:101",
         title: "Prior regression in dev server",
         kind: "regression",
         detected_at: "2026-02-01T00:00:00Z"
       })
       CREATE (inc1)-[:RESOLVED_BY]->(c1)
       CREATE (source1:Comment {id: "comm:source-1"})
       CREATE (dec1:Decision {
         id: "dec:201",
         status: "active",
         summary: "Preserve plugin order",
         reason: "Order is load-bearing",
         confidence: 0.95,
         decided_at: "2026-02-10T00:00:00Z"
       })
       CREATE (dec1)-[:CONSTRAINS {strength: "hard"}]->(fn)
       CREATE (dec1)-[:DERIVED_FROM]->(source1)`,
      { fnId },
    );

    const testFiles = [
      {
        sha: "sha-test-01",
        filename: "packages/vite/src/node/config.ts",
        status: "modified" as const,
        additions: 10,
        deletions: 2,
        changes: 12,
        blob_url: "https://github.com/vitejs/vite/blob/test",
        raw_url: "https://github.com/vitejs/vite/raw/test",
        contents_url: "https://api.github.com/repos/vitejs/vite/contents/test",
      },
    ];

    const reviewBeforeLeakage = await reviewGraph(
      TEST_GRAPH,
      [fnId],
      testFiles,
      "patak-dev",
      cutoffMs,
    );

    expect(reviewBeforeLeakage.history).toHaveLength(1);
    expect(reviewBeforeLeakage.history[0]?.incident).toBe("inc:101");
    expect(reviewBeforeLeakage.decisions).toHaveLength(1);
    expect(reviewBeforeLeakage.decisions[0]?.id).toBe("dec:201");

    // INJECT POST-CUTOFF DATA (Future incident and future decision)
    await query(
      TEST_GRAPH,
      `MATCH (fn:Function {id: $fnId})
       CREATE (cFuture:Commit {id: "c:future", sha: "c-future-sha"})
       CREATE (cFuture)-[:MODIFIED]->(fn)
       CREATE (incFuture:Incident {
         id: "inc:999-future",
         title: "Future post-merge outage",
         kind: "outage",
         detected_at: "2026-03-20T00:00:00Z"
       })
       CREATE (incFuture)-[:RESOLVED_BY]->(cFuture)
       CREATE (sourceFuture:Comment {id: "comm:source-future"})
       CREATE (decFuture:Decision {
         id: "dec:888-future",
         status: "active",
         summary: "Future policy adopted next month",
         reason: "Future reason",
         confidence: 0.90,
         decided_at: "2026-03-25T00:00:00Z"
       })
       CREATE (decFuture)-[:CONSTRAINS {strength: "hard"}]->(fn)
       CREATE (decFuture)-[:DERIVED_FROM]->(sourceFuture)`,
      { fnId },
    );

    // RERUN WITH SAME CUTOFF: must be completely unaffected by future data
    const reviewAfterLeakage = await reviewGraph(
      TEST_GRAPH,
      [fnId],
      testFiles,
      "patak-dev",
      cutoffMs,
    );

    expect(reviewAfterLeakage.history).toEqual(reviewBeforeLeakage.history);
    expect(reviewAfterLeakage.decisions).toEqual(reviewBeforeLeakage.decisions);
    expect(
      reviewAfterLeakage.history.some(
        ({ incident }) => incident === "inc:999-future",
      ),
    ).toBe(false);
    expect(
      reviewAfterLeakage.decisions.some(({ id }) => id === "dec:888-future"),
    ).toBe(false);

    // When cutoff is moved into the future, post-cutoff items become visible
    const futureCutoffMs = Date.parse("2026-04-01T00:00:00Z");
    const reviewInFuture = await reviewGraph(
      TEST_GRAPH,
      [fnId],
      testFiles,
      "patak-dev",
      futureCutoffMs,
    );
    expect(
      reviewInFuture.history.some(
        ({ incident }) => incident === "inc:999-future",
      ),
    ).toBe(true);
    expect(
      reviewInFuture.decisions.some(({ id }) => id === "dec:888-future"),
    ).toBe(true);
  });

  it("ensures ground-truth labels remain isolated from risk scoring inputs", () => {
    for (const item of HISTORICAL_EVALUATION_DATASET) {
      expect(item.repo).toBe("vitejs/vite");
      expect(typeof item.pr).toBe("number");
      expect(typeof item.is_risky).toBe("boolean");
      expect(typeof item.merged_at).toBe("string");
      expect(Date.parse(item.merged_at)).toBeGreaterThan(0);
    }
  });
});
