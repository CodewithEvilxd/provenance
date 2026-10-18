import { FalkorDB } from "falkordb";

const database = await FalkorDB.connect({
  host: process.env.FALKORDB_HOST ?? "localhost",
  port: Number(process.env.FALKORDB_PORT ?? 6379),
  ...(process.env.FALKORDB_PASSWORD
    ? { password: process.env.FALKORDB_PASSWORD }
    : {}),
});
const graphName = "probe:foundation";
const graph = database.selectGraph(graphName);
const graphs = await database.list();
const connection = await database.connection;
const serverInfo = await connection.info("server");
const records = await graph.query(
  "CREATE (server:FalkorDBServer {id: $id, info: $info}) RETURN server.id AS id, server.info AS info",
  { params: { id: graphName, info: serverInfo } },
);
const verified = await graph.query(
  "MATCH (server:FalkorDBServer {id: $id}) RETURN server.id AS id, server.info AS info",
  { params: { id: graphName } },
);
if (JSON.stringify(records.data) !== JSON.stringify(verified.data)) {
  throw new Error("FalkorDB did not return the created server record");
}
process.stdout.write(
  `${JSON.stringify({ graphs, serverInfo, metadata: verified.metadata, record: verified.data })}\n`,
);
await graph.delete();
await database.close();
