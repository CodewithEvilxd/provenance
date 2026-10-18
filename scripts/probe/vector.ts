import {
  closeGraphClient,
  query,
  selectGraph,
} from "../../packages/graph/src/client.js";

const graph = await selectGraph("probe:vector");
await graph.createNodeVectorIndex("Decision", 384, "cosine", "embedding");
const matches = await query(
  "probe:vector",
  "CALL db.idx.vector.queryNodes('Decision', 'embedding', 1, vecf32($embedding)) YIELD node, score RETURN node.id AS id, score",
  { embedding: Array.from({ length: 384 }, () => 0) },
);
process.stdout.write(
  `${JSON.stringify({ vectorIndex: "Decision.embedding", matches })}\n`,
);
await graph.delete();
await closeGraphClient();
