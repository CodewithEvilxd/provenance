import { afterAll, describe, expect, it } from "vitest";
import { closeGraphClient, query } from "../src/client.js";
import { FalkorDB } from "falkordb";

const graphName = "test:foundation";

describe("FalkorDB connection", () => {
  it("round trips the connected server version", async () => {
    const database = await FalkorDB.connect({
      host: process.env.FALKORDB_HOST ?? "localhost",
      port: Number(process.env.FALKORDB_PORT ?? 6379),
      ...(process.env.FALKORDB_PASSWORD
        ? { password: process.env.FALKORDB_PASSWORD }
        : {}),
    });
    const serverInfo = await (await database.connection).info("server");
    await database.close();
    const [written] = await query<{ info: string }>(
      graphName,
      "CREATE (server:FalkorDBServer {id: $id, info: $info}) RETURN server.info AS info",
      { id: graphName, info: serverInfo },
    );
    const [read] = await query<{ info: string }>(
      graphName,
      "MATCH (server:FalkorDBServer {id: $id}) RETURN server.info AS info",
      { id: graphName },
    );
    expect(read?.info).toBe(serverInfo);
    expect(written?.info).toBe(serverInfo);
  });
});

afterAll(async () => {
  const database = await FalkorDB.connect({
    host: process.env.FALKORDB_HOST ?? "localhost",
    port: Number(process.env.FALKORDB_PORT ?? 6379),
    ...(process.env.FALKORDB_PASSWORD
      ? { password: process.env.FALKORDB_PASSWORD }
      : {}),
  });
  await database.selectGraph(graphName).delete();
  await database.close();
  await closeGraphClient();
});
