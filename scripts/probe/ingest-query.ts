import { closeGraphClient, query } from "../../packages/graph/src/client.js";

const argumentsList = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const repository = argumentsList[0] ?? "unjs/ofetch";
const graph = argumentsList[1] ?? `repo:${repository}`;
const functions = await query<{ id: string }>(
  graph,
  "MATCH (caller:Function)-[:CALLS]->(fn:Function) RETURN fn.id AS id LIMIT 1",
);
const functionId = functions[0]?.id;
if (!functionId)
  throw new Error("The real repo has no function with a resolved caller");
const [callers, commits] = await Promise.all([
  query<{ caller: string }>(
    graph,
    "MATCH (caller:Function)-[:CALLS]->(fn:Function {id: $id}) RETURN caller.id AS caller LIMIT 20",
    { id: functionId },
  ),
  query<{ sha: string; committed_at: string }>(
    graph,
    "MATCH (commit:Commit)-[:MODIFIED]->(fn:Function {id: $id}) RETURN commit.sha AS sha, commit.committed_at AS committed_at ORDER BY commit.committed_at DESC LIMIT 5",
    { id: functionId },
  ),
]);
process.stdout.write(
  JSON.stringify({ functionId, callers, lastFiveCommits: commits }, null, 2) +
    "\n",
);
await closeGraphClient();
