import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import { reviewResultSchema } from "../../agents/src/reviewer.js";
import { ProviderFailure, type LlmRouter } from "../../llm/src/types.js";
import { closeGraphClient, query } from "../src/client.js";
import {
  graphCounts,
  verifyPathEdges,
  verifyPathNodes,
} from "../src/queries.js";
import { createReviewHandler } from "../../../apps/web/app/api/review/handler.js";
import { POST as productionPost } from "../../../apps/web/app/api/review/route.js";

const modelVerdict = { violates: false, calls: 0 };

const graph = "repo:vitejs/vite";
const emptyGraph = "repo:phase3-review-missing-evidence";
let cacheRoot: string;
const previousGraph = process.env.PROVENANCE_GRAPH;
const previousCache = process.env.PROVENANCE_DECISION_CACHE_DIR;

beforeEach(async () => {
  cacheRoot = await mkdtemp(join(tmpdir(), "provenance-review-"));
  process.env.PROVENANCE_GRAPH = graph;
  process.env.PROVENANCE_DECISION_CACHE_DIR = cacheRoot;
  modelVerdict.violates = false;
  modelVerdict.calls = 0;
});

afterEach(async () => {
  await rm(cacheRoot, { recursive: true, force: true });
  if (previousGraph === undefined) delete process.env.PROVENANCE_GRAPH;
  else process.env.PROVENANCE_GRAPH = previousGraph;
  if (previousCache === undefined)
    delete process.env.PROVENANCE_DECISION_CACHE_DIR;
  else process.env.PROVENANCE_DECISION_CACHE_DIR = previousCache;
});

function request(repo: string, pr: number) {
  return new Request("http://localhost/api/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, pr }),
  });
}

function handler() {
  return createReviewHandler(
    () =>
      ({
        primaryProvider: "openrouter",
        primaryModel: "offline-test-model",
        routeFor: () => ({
          provider: "openrouter",
          model: "offline-test-model",
        }),
        reviewEnabled: false,
        routeEvents: [],
        complete: async () => {
          modelVerdict.calls++;
          return JSON.stringify({
            violated: modelVerdict.violates,
            evidence: modelVerdict.violates
              ? "The diff breaks the documented behavior."
              : "The diff preserves the documented behavior.",
          });
        },
      }) satisfies LlmRouter,
  );
}

it("returns a schema-valid medium review through the real route and real graph", async () => {
  const before = await graphCounts(graph);
  const response = await handler()(request("vitejs/vite", 22832));
  const body: unknown = await response.json();
  const result = reviewResultSchema.parse(body);

  expect(response.status).toBe(200);
  expect(result.evidence_status).toBe("complete");
  expect(result.risk.band).toBe("medium");
  expect(result.changed_functions).toContain(
    "fn:packages/vite/src/node/config.ts#resolveConfig",
  );
  expect(modelVerdict.calls).toBeGreaterThan(0);
  expect(result.paths.some(({ kind }) => kind === "decision")).toBe(true);
  expect(result.paths.some(({ kind }) => kind === "incident")).toBe(true);
  expect(
    result.paths.flatMap(({ nodes }) => nodes).map(({ id }) => id),
  ).toContain("incident:regression:issue:23197");
  await verifyRealPaths(result.paths);
  expect(await graphCounts(graph)).toEqual(before);
});

it("returns insufficient evidence for a graph with no indexed functions", async () => {
  process.env.PROVENANCE_GRAPH = emptyGraph;
  const before = await graphCounts(emptyGraph);
  const response = await handler()(request("vitejs/vite", 22832));
  const result = reviewResultSchema.parse(await response.json());

  expect(response.status).toBe(200);
  expect(result.evidence_status).toBe("insufficient_evidence");
  expect(result.missing_evidence).toEqual([
    "changed_functions",
    "decisions",
    "incidents",
  ]);
  expect(modelVerdict.calls).toBe(0);
  expect(await graphCounts(emptyGraph)).toEqual(before);
});

it("continues after one malformed completion and marks its verdict unavailable", async () => {
  let calls = 0;
  const router: LlmRouter = {
    primaryProvider: "openrouter",
    primaryModel: "offline-test-model",
    routeFor: () => ({
      provider: "openrouter",
      model: "offline-test-model",
    }),
    reviewEnabled: false,
    routeEvents: [],
    complete: async () => {
      calls++;
      if (calls === 1)
        throw new ProviderFailure(
          "openrouter",
          "malformed",
          "completion text is missing",
          undefined,
          undefined,
          { elapsedMs: 37 },
        );
      return JSON.stringify({
        violated: false,
        evidence: "The relevant behavior is preserved.",
      });
    },
  };
  const response = await createReviewHandler(() => router)(
    request("vitejs/vite", 22832),
  );
  const result = reviewResultSchema.parse(await response.json());

  expect(response.status).toBe(200);
  expect(calls).toBeGreaterThan(1);
  expect(result.evidence_status).toBe("insufficient_evidence");
  expect(result.missing_evidence).toContain("decision_verdicts");
  expect(result.decisions.some(({ available }) => !available)).toBe(true);
  expect(result.decisions.some(({ violated }) => violated === null)).toBe(true);
  expect(
    result.decisions
      .filter(({ model_id }) => model_id !== null)
      .every(({ model_id }) => model_id === "offline-test-model"),
  ).toBe(true);
});

it("returns safe provider diagnostics in the route error body", async () => {
  const secret = "offline-secret-value";
  const routeEvents = [
    {
      event: "failed" as const,
      provider: "openrouter" as const,
      purpose: "decision_check" as const,
      kind: "invalid_key" as const,
      causeName: "AuthError",
      causeCode: "EACCES",
      upstreamProvider: "Example upstream",
      upstreamRaw: "temporary upstream timeout",
      elapsedMs: 123,
    },
  ];
  const router: LlmRouter = {
    primaryProvider: "openrouter",
    primaryModel: "offline-test-model",
    routeFor: () => ({
      provider: "openrouter",
      model: "offline-test-model",
    }),
    reviewEnabled: false,
    routeEvents,
    complete: async () => {
      throw new ProviderFailure(
        "openrouter",
        "invalid_key",
        "invalid key",
        401,
        new Error(secret),
        {
          causeName: "AuthError",
          causeCode: "EACCES",
          upstreamProvider: "Example upstream",
          upstreamRaw: "temporary upstream timeout",
          elapsedMs: 123,
        },
      );
    },
  };
  const response = await createReviewHandler(() => router)(
    request("vitejs/vite", 22832),
  );
  const body = (await response.json()) as {
    causeName?: string;
    causeCode?: string;
    upstream_provider?: string;
    upstream_raw?: string;
    elapsed_ms?: number;
    route_events?: unknown[];
  };

  expect(response.status).toBe(401);
  expect(body).toMatchObject({
    causeName: "AuthError",
    causeCode: "EACCES",
    upstream_provider: "Example upstream",
    upstream_raw: "temporary upstream timeout",
    elapsed_ms: 123,
  });
  expect(body.route_events).toHaveLength(1);
  expect(JSON.stringify(body)).not.toContain(secret);
});

it.each([
  ["invalid_key", 401],
  ["quota", 402],
] as const)("stops the review for provider %s errors", async (kind, status) => {
  const router: LlmRouter = {
    primaryProvider: "openrouter",
    primaryModel: "offline-test-model",
    routeFor: () => ({
      provider: "openrouter",
      model: "offline-test-model",
    }),
    reviewEnabled: false,
    routeEvents: [],
    complete: async () => {
      throw new ProviderFailure("openrouter", kind, "provider rejected access");
    },
  };
  const response = await createReviewHandler(() => router)(
    request("vitejs/vite", 22832),
  );
  expect(response.status).toBe(status);
});

it("replays the live high-risk response from saved model verdicts and disk cache", async () => {
  const reportPath = resolve("docs/phase3-review-23333.json");
  if (!existsSync(reportPath))
    throw new Error(
      "Live review evidence is missing. Run `pnpm review:live -- vitejs/vite 23333 --provider gemini --model gemini-3.8-flash --max-tokens 400` first; this test requires real model verdicts and their disk cache.",
    );
  const saved = reviewResultSchema.parse(
    JSON.parse(readFileSync(reportPath, "utf8")),
  );
  expect(
    saved.evidence_status,
    "The saved PR #23333 review has unavailable evidence. Rerun the live command after Gemini network access is restored.",
  ).toBe("complete");
  expect(saved.risk.band).toBe("high");
  delete process.env.PROVENANCE_DECISION_CACHE_DIR;
  const before = await graphCounts(graph);
  const cacheOnlyRouter: LlmRouter = {
    primaryProvider: "openrouter",
    primaryModel: "offline-test-model",
    routeFor: () => ({
      provider: "openrouter",
      model: "offline-test-model",
    }),
    reviewEnabled: false,
    routeEvents: [],
    complete: async () => {
      throw new Error(
        "Live review verdict cache is incomplete. Run `pnpm review:live -- vitejs/vite 23333 --provider gemini --model gemini-3.8-flash --max-tokens 400` again.",
      );
    },
  };
  const response = await createReviewHandler(() => cacheOnlyRouter)(
    request("vitejs/vite", saved.pr),
  );
  expect(
    response.status,
    "Live review verdict cache is incomplete. Run `pnpm review:live -- vitejs/vite 23333 --provider gemini --model gemini-3.8-flash --max-tokens 400` again.",
  ).toBe(200);
  const result = reviewResultSchema.parse(await response.json());

  expect(response.status).toBe(200);
  expect(result.evidence_status).toBe("complete");
  expect(result.risk.band).toBe("high");
  expect(result.decisions.length).toBeGreaterThan(0);
  expect(
    result.decisions.map(({ id, violated, evidence }) => ({
      id,
      violated,
      evidence,
    })),
  ).toEqual(
    saved.decisions.map(({ id, violated, evidence }) => ({
      id,
      violated,
      evidence,
    })),
  );
  expect(result.paths.some(({ kind }) => kind === "decision")).toBe(true);
  expect(result.paths.some(({ kind }) => kind === "incident")).toBe(true);
  await verifyRealPaths(result.paths);
  expect(await graphCounts(graph)).toEqual(before);
});

it("rejects invalid input at the real route before the model boundary", async () => {
  const response = await handler()(request("vitejs/vite", 0));
  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("error");
  expect(modelVerdict.calls).toBe(0);
});

it("exports the production POST handler used by review:live", async () => {
  const response = await productionPost(request("vitejs/vite", 0));
  expect(response.status).toBe(400);
});

async function verifyRealPaths(
  paths: Awaited<ReturnType<typeof reviewResultSchema.parse>>["paths"],
) {
  const pathsToVerify = paths.filter(
    ({ kind }) => kind === "decision" || kind === "incident",
  );
  expect(pathsToVerify.some(({ kind }) => kind === "decision")).toBe(true);
  expect(pathsToVerify.some(({ kind }) => kind === "incident")).toBe(true);
  for (const path of pathsToVerify) {
    const ids = path.nodes.map(({ id }) => id);
    expect((await verifyPathNodes(graph, ids)).map(({ id }) => id)).toEqual(
      expect.arrayContaining(ids),
    );
    expect(
      (await verifyPathEdges(graph, path.edges)).every(
        ({ count }) => count > 0,
      ),
    ).toBe(true);
    if (path.kind === "decision") {
      expect(ids.some((id) => id.startsWith("comment:review:"))).toBe(true);
    }
    if (path.kind === "incident") {
      expect(ids).toContain("incident:regression:issue:23197");
      const source = await query<{ url: string; body: string }>(
        graph,
        "MATCH (issue:Issue {id: 'issue:23197'}) RETURN issue.url AS url, issue.body AS body",
      );
      expect(source[0]?.url).toBe(
        "https://github.com/vitejs/vite/issues/23197",
      );
      expect(source[0]?.body).toMatch(
        /introduced in `v8\.2\.0-beta\.0` by PR #22832/i,
      );
    }
  }
}

afterAll(async () => {
  await closeGraphClient();
});
