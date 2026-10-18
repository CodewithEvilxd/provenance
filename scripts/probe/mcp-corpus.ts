import { closeGraphClient, query } from "../../packages/graph/src/client.js";
import { embedText } from "../../packages/decisions/src/embedding.js";
import { searchDecisionRows } from "../../packages/graph/src/queries.js";

const graph = "repo:vercel/next.js";
const labels = ["Function", "File", "Incident", "Decision", "Comment", "PR"];
for (const label of labels) {
  const rows = await query<{ count: number }>(
    graph,
    `MATCH (node:${label}) RETURN count(node) AS count`,
  );
  process.stdout.write(`${label}=${rows[0]?.count ?? 0}\n`);
}
const matches = await searchDecisionRows(graph, embedText("caching"), null, 10);
process.stdout.write(
  `${JSON.stringify(matches.map(({ id, summary, sources }) => ({ id, summary, sources })))}\n`,
);
await closeGraphClient();
