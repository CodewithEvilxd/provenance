import { execFile as run } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  closeGraphClient,
  query,
  selectGraph,
} from "../../graph/src/client.js";
import { commits, pulls, repository } from "../src/github.js";
import {
  commitDetails,
  commitPullRequests,
  issues,
  pullCommits,
} from "../src/github-discussions.js";

const execFile = promisify(run);
const corpus = "jridgewell/trace-mapping";
const [owner, name] = corpus.split("/");
const graph = "test:incidents";

async function ingest() {
  await execFile(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/ingest.ts", "--", corpus],
    { env: { ...process.env, PROVENANCE_GRAPH: graph } },
  );
}

async function count(label: string) {
  const rows = await query<{ count: number }>(
    graph,
    `MATCH (node:${label}) RETURN count(node) AS count`,
  );
  return rows[0]?.count ?? 0;
}

async function edgeCount(type: string) {
  const rows = await query<{ count: number }>(
    graph,
    `MATCH ()-[edge:${type}]->() RETURN count(edge) AS count`,
  );
  return rows[0]?.count ?? 0;
}

async function sourceReverts() {
  const repositoryInfo = await repository(owner!, name!);
  const [mainCommits, pullList] = await Promise.all([
    commits(owner!, name!, repositoryInfo.default_branch),
    pulls(owner!, name!),
  ]);
  const pullCommits = await Promise.all(
    pullList.map((pull) => pullCommitsFor(pull.number)),
  );
  const shas = new Set([
    ...mainCommits.map((commit) => commit.sha),
    ...pullCommits.flat().map((commit) => commit.sha),
  ]);
  const details = await Promise.all(
    [...shas].map((sha) => commitDetails(owner!, name!, sha)),
  );
  return {
    pullList,
    pullCommits,
    details: details.filter((detail) =>
      /This reverts commit ([0-9a-f]{7,40})/i.test(detail.commit.message),
    ),
  };
}

async function pullCommitsFor(number: number) {
  return pullCommits(owner!, name!, number);
}

async function verifyReverts() {
  const { pullList, pullCommits, details } = await sourceReverts();
  const expected = details
    .map((detail) => {
      const reverter = pullList.find((_, index) =>
        pullCommits[index]?.some((commit) => commit.sha === detail.sha),
      );
      return `incident:revert:${reverter ? `pr:${reverter.number}` : `commit:${detail.sha}`}`;
    })
    .sort();
  const incidents = await query<{ id: string }>(
    graph,
    "MATCH (incident:Incident {kind: 'revert'}) RETURN incident.id AS id ORDER BY id",
  );
  expect(incidents.map((incident) => incident.id)).toEqual(expected);
  const resolved = await query<{ sha: string }>(
    graph,
    "MATCH (incident:Incident {kind: 'revert'})-[:RESOLVED_BY]->(commit:Commit) RETURN commit.sha AS sha ORDER BY sha",
  );
  expect(resolved.map((commit) => commit.sha)).toEqual(
    details.map((detail) => detail.sha).sort(),
  );
}

async function verifyRegressionIssues() {
  const issueList = await issues(owner!, name!);
  const expected = issueList
    .filter((issue) => {
      const text = `${issue.title}\n${issue.body ?? ""}`;
      const labeled = issue.labels.some((label) =>
        ["regression", "bug", "incident", "hotfix"].includes(
          (label.name ?? "").toLowerCase(),
        ),
      );
      return (
        labeled ||
        /\b(?:caused by|introduced in|broke after)\s+#\d+\b/i.test(text)
      );
    })
    .map((issue) => `incident:regression:issue:${issue.number}`)
    .sort();
  const incidents = await query<{ id: string }>(
    graph,
    "MATCH (incident:Incident {kind: 'regression'}) RETURN incident.id AS id ORDER BY id",
  );
  expect(incidents.map((incident) => incident.id)).toEqual(expected);
}

async function verifyRevertCauses() {
  const { details } = await sourceReverts();
  const targetShas = details.flatMap((detail) => {
    const sha = /This reverts commit ([0-9a-f]{7,40})/i.exec(
      detail.commit.message,
    )?.[1];
    return sha ? [sha] : [];
  });
  const associations = await Promise.all(
    targetShas.map((sha) => commitPullRequests(owner!, name!, sha)),
  );
  const expected = associations
    .flatMap((numbers) => (numbers[0] ? [numbers[0]] : []))
    .sort((left, right) => left - right);
  const causes = await query<{ number: number }>(
    graph,
    "MATCH (incident:Incident {kind: 'revert'})-[:CAUSED_BY]->(pull:PR) RETURN pull.number AS number ORDER BY number",
  );
  expect(causes.map((pull) => pull.number)).toEqual(expected);
}

async function verifyIncidentIdempotency() {
  const before = await Promise.all(
    ["Incident"]
      .map(count)
      .concat(
        ["CAUSED_BY", "REPORTED_IN", "RESOLVED_BY", "REVERTS"].map(edgeCount),
      ),
  );
  await ingest();
  const after = await Promise.all(
    ["Incident"]
      .map(count)
      .concat(
        ["CAUSED_BY", "REPORTED_IN", "RESOLVED_BY", "REVERTS"].map(edgeCount),
      ),
  );
  expect(after).toEqual(before);
}

beforeAll(async () => ingest());
it("matches incidents to real revert and issue sources", async () => {
  await verifyReverts();
  await verifyRegressionIssues();
  await verifyRevertCauses();
});
it(
  "keeps incident nodes and edges stable on repeat ingestion",
  verifyIncidentIdempotency,
);

afterAll(async () => {
  await (await selectGraph(graph)).delete();
  await closeGraphClient();
});
