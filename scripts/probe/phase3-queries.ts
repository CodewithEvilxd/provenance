import { closeGraphClient, query } from "../../packages/graph/src/client.js";
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
} from "../../packages/graph/src/queries.js";

const graph = process.env.PROVENANCE_GRAPH ?? "repo:vitejs/vite";
try {
  const functions = await query<{ id: string; path: string }>(
    graph,
    "MATCH (fn:Function) RETURN fn.id AS id, fn.path AS path ORDER BY fn.id LIMIT 1",
  );
  const fn = functions[0];
  if (!fn) throw new Error(`No ingested functions in ${graph}`);
  const now = Date.now();
  const rows = await Promise.all([
    blastRadius(graph, fn.id),
    incidentHistory(graph, [fn.id]),
    activeDecisions(graph, [fn.id], [fn.path]),
    whyTrace(graph, fn.id),
    whoKnows(graph, fn.id, now),
    reviewerRank(graph, [fn.id], "", now),
    pathForEvidence(graph, fn.id),
    asOfSubgraph(graph, now),
    ownershipConcentration(graph, now - 365 * 86400000),
  ]);
  process.stdout.write(
    `${JSON.stringify({ graph, fn: fn.id, rowCounts: rows.map((result) => result.length) })}\n`,
  );
} finally {
  await closeGraphClient();
}
