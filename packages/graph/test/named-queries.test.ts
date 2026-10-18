import { afterAll, expect, it } from "vitest";
import { closeGraphClient, query } from "../src/client.js";
import {
  activeDecisions,
  asOfSubgraph,
  blastRadius,
  incidentHistory,
  ownershipConcentration,
  pathForEvidence,
  reviewerRank,
  whoKnows,
  whyTrace,
} from "../src/queries.js";

const graph = "repo:vitejs/vite";

it("runs the named query set on real Vite graph data", async () => {
  const fn = await changedDecisionFunction();
  expect(fn).toBeDefined();
  const now = Date.now();
  const [
    blast,
    incidents,
    decisions,
    trace,
    authors,
    reviewers,
    evidence,
    asOf,
    ownership,
  ] = await Promise.all([
    blastRadius(graph, fn!.id),
    incidentHistory(graph, [fn!.id]),
    activeDecisions(graph, [fn!.id], [fn!.path]),
    whyTrace(graph, fn!.id),
    whoKnows(graph, fn!.id, now),
    reviewerRank(graph, [fn!.id], "", now),
    pathForEvidence(graph, fn!.id),
    asOfSubgraph(graph, now),
    ownershipConcentration(graph, now - 365 * 86400000),
  ]);
  expect(
    blast.every(({ hops, path_confidence }) => hops > 0 && path_confidence > 0),
  ).toBe(true);
  expect(decisions.every(({ sources }) => sources.length > 0)).toBe(true);
  expect(authors.every(({ score }) => score > 0)).toBe(true);
  expect(reviewers.every(({ login }) => login !== "")).toBe(true);
  expect(evidence.length).toBeGreaterThan(0);
  expect(
    evidence.every(({ edges, nodes }) =>
      edges.every(
        ([from, to]) =>
          nodes.some(({ id }) => id === from) &&
          nodes.some(({ id }) => id === to),
      ),
    ),
  ).toBe(true);
  expectDecisionPaths(evidence);
  expect(asOf.some(({ id }) => id === fn!.id)).toBe(false);
  expect(ownership.some(({ path }) => path === fn!.path)).toBe(true);
  const independentBlast = await query<{ id: string }>(
    graph,
    "MATCH (changed:Function {id: $fn})<-[:CALLS]-(caller:Function) WHERE caller.valid_to IS NULL RETURN DISTINCT caller.id AS id",
    { fn: fn!.id },
  );
  expect(blast.map(({ id }) => id)).toEqual(
    expect.arrayContaining(independentBlast.map(({ id }) => id)),
  );
  const beforeHistory = await asOfSubgraph(graph, 0);
  expect(beforeHistory).toEqual([]);
  expect(
    incidents.some(
      ({ incident }) => incident === "incident:regression:issue:23197",
    ),
  ).toBe(true);
  expect(trace.length).toBeGreaterThan(0);
});

async function changedDecisionFunction() {
  const candidates = await query<{ id: string; path: string }>(
    graph,
    "MATCH (:Decision)-[:CONSTRAINS]->(fn:Function) RETURN DISTINCT fn.id AS id, fn.path AS path ORDER BY id LIMIT 500",
  );
  for (const candidate of candidates) {
    const [changes] = await query<{ count: number }>(
      graph,
      "MATCH (fn:Function {id: $id})<-[:MODIFIED]-(:Commit) RETURN count(*) AS count",
      { id: candidate.id },
    );
    if (changes?.count) return candidate;
  }
  throw new Error(
    "No changed function with a decision exists in the Vite graph",
  );
}

function expectDecisionPaths(
  paths: Awaited<ReturnType<typeof pathForEvidence>>,
) {
  expect(
    paths
      .filter(({ kind }) => kind === "decision")
      .every(
        ({ nodes }) =>
          nodes.some(({ label }) => label === "Decision") &&
          nodes.some(({ label }) => label === "Comment"),
      ),
  ).toBe(true);
}

it("returns the real revert path from a modified function to its incident", async () => {
  const graph = "test:phase2-live";
  const [knownPath] = await query<{
    fn: string;
    commit: string;
    incident: string;
  }>(
    graph,
    "MATCH (incident:Incident)-[:RESOLVED_BY]->(commit:Commit)-[:MODIFIED]->(fn:Function) RETURN fn.id AS fn, commit.id AS commit, incident.id AS incident ORDER BY incident.id, fn.id LIMIT 1",
  );
  expect(knownPath).toBeDefined();
  const history = await incidentHistory(graph, [knownPath!.fn]);
  const paths = await pathForEvidence(graph, knownPath!.fn);
  expect(history.map(({ incident }) => incident)).toContain(
    knownPath!.incident,
  );
  const path = paths.find(
    ({ kind, nodes }) =>
      kind === "incident" &&
      nodes.some(({ id }) => id === knownPath!.commit) &&
      nodes.at(-1)?.id === knownPath!.incident,
  );
  expect(path).toBeDefined();
  for (const [from, to, type] of path!.edges) {
    const [edge] = await query<{ count: number }>(
      graph,
      "MATCH (source)-[relationship]->(target) WHERE source.id = $from AND target.id = $to AND type(relationship) = $type RETURN count(relationship) AS count",
      { from, to, type },
    );
    expect(edge?.count).toBeGreaterThan(0);
  }
});

afterAll(async () => {
  await closeGraphClient();
});
