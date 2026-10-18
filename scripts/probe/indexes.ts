import { FalkorDB } from "falkordb";

const database = await FalkorDB.connect({
  host: process.env.FALKORDB_HOST ?? "localhost",
  port: Number(process.env.FALKORDB_PORT ?? 6379),
  ...(process.env.FALKORDB_PASSWORD
    ? { password: process.env.FALKORDB_PASSWORD }
    : {}),
});
const graph = database.selectGraph("probe:indexes");
await graph.createNodeRangeIndex("Commit", "committed_at_ms");
await graph.createEdgeRangeIndex("AUTHORED", "valid_from");
await graph.createNodeVectorIndex("Decision", 384, "cosine", "embedding");
const indexes = await graph.query("CALL db.indexes()");
process.stdout.write(`${JSON.stringify(indexes.data)}\n`);
await graph.delete();
await database.close();
