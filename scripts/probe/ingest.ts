import {
  closeGraphClient,
  query,
  selectGraph,
} from "../../packages/graph/src/client.js";
import { commits, repository } from "../../packages/ingest/src/github.js";

process.loadEnvFile(".env.local");
const [owner, name] = ["unjs", "ofetch"];
const repositoryInfo = await repository(owner, name);
const sourceCommit = (
  await commits(owner, name, repositoryInfo.default_branch)
).find((commit) => commit.author?.login);
if (!sourceCommit?.author?.login)
  throw new Error("The public repo has no authored commit to probe");
const graphName = "probe:unjs/ofetch";
const graph = await selectGraph(graphName);
const personRow = {
  id: `person:${sourceCommit.author.login}`,
  props: { login: sourceCommit.author.login },
};
const commitRow = {
  id: `commit:${sourceCommit.sha}`,
  props: { sha: sourceCommit.sha, message: sourceCommit.commit.message },
};
const temporalEdge = {
  from: personRow.id,
  to: commitRow.id,
  props: {
    valid_from: sourceCommit.commit.author?.date ?? null,
    valid_to: null,
  },
};
await query(
  graphName,
  "UNWIND $rows AS row MERGE (n:Person {id: row.id}) SET n += row.props",
  { rows: [personRow] },
);
await query(
  graphName,
  "UNWIND $rows AS row MERGE (n:Commit {id: row.id}) SET n += row.props",
  { rows: [commitRow] },
);
await query(
  graphName,
  "UNWIND $rows AS row MATCH (a {id: row.from}) MATCH (b {id: row.to}) MERGE (a)-[r:AUTHORED]->(b) SET r += row.props",
  { rows: [temporalEdge] },
);
const roundTrip = await graph.query<{
  login: string;
  sha: string;
  valid_from: string;
}>(
  "MATCH (p:Person)-[r:AUTHORED]->(c:Commit) RETURN p.login AS login, c.sha AS sha, r.valid_from AS valid_from",
);
process.stdout.write(JSON.stringify(roundTrip.data?.[0] ?? null) + "\n");
await graph.delete();
await closeGraphClient();
