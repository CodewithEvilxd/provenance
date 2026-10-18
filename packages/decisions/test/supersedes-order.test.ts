import { expect, it } from "vitest";
import { query } from "../../graph/src/client.js";
import { decisionSupersessionCandidatesQuery } from "../src/supersedes.js";

const graph = "repo:vitejs/vite";

it("orders real Vite supersession candidates by vector score", async () => {
  const [decision] = await query<{ id: string; embedding: number[] }>(
    graph,
    "MATCH (decision:Decision) WHERE decision.embedding IS NOT NULL RETURN decision.id AS id, decision.embedding AS embedding ORDER BY decision.id LIMIT 1",
  );
  expect(decision).toBeDefined();
  expect(decision?.embedding).toHaveLength(384);

  const params = {
    embedding: decision!.embedding,
    id: "decision-order-query-probe",
  };
  const expected = await query<{ id: string; score: number }>(
    graph,
    "CALL db.idx.vector.queryNodes('Decision', 'embedding', 10, vecf32($embedding)) YIELD node, score MATCH (node)-[:CONSTRAINS]->(target) WHERE node.status = 'active' AND node.id <> $id RETURN node.id AS id, score ORDER BY score DESC",
    params,
  );
  expect(expected.length).toBeGreaterThan(0);
  for (let index = 1; index < expected.length; index++)
    expect(expected[index - 1]!.score).toBeGreaterThanOrEqual(
      expected[index]!.score,
    );

  const candidates = await query<{ id: string }>(
    graph,
    decisionSupersessionCandidatesQuery,
    params,
  );
  expect(candidates.map(({ id }) => id)).toEqual([
    ...new Set(expected.map(({ id }) => id)),
  ]);
});
