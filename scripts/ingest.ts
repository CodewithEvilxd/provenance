import { execFile as run } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { closeGraphClient, query } from "../packages/graph/src/client.js";
import { createSchema } from "../packages/graph/src/schema.js";
import { commits, pulls, repository } from "../packages/ingest/src/github.js";
import {
  commitComments,
  commitDetails,
  commitPullRequests,
  issueComments,
  issues,
  pullCommits,
  pullDetail,
  reviewComments,
  reviews,
} from "../packages/ingest/src/github-discussions.js";
import { loadRepository } from "../packages/ingest/src/load.js";
import {
  detectIncidents,
  revertedCommit,
} from "../packages/ingest/src/incidents.js";
import { writeEdges, writeNodes } from "../packages/ingest/src/load-writes.js";
import {
  modifiedFunctions,
  parseFile,
  resolveCalls,
} from "../packages/ingest/src/parse.js";

const execFile = promisify(run);
const repo =
  process.argv.slice(2).filter((argument) => argument !== "--")[0] ??
  process.env.DEMO_REPO;
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo))
  throw new Error("Pass a public repository as owner/name");
const [owner, name] = repo.split("/");
if (!owner || !name) throw new Error("Pass a public repository as owner/name");
const graph = process.env.PROVENANCE_GRAPH ?? `repo:${owner}/${name}`;

async function batch<T, R>(
  records: T[],
  size: number,
  fetch: (record: T) => Promise<R>,
) {
  const received: R[] = [];
  for (let offset = 0; offset < records.length; offset += size)
    received.push(
      ...(await Promise.all(records.slice(offset, offset + size).map(fetch))),
    );
  return received;
}

async function cloneRepository(branch: string) {
  const path = `data/repos/${owner}__${name}`;
  try {
    await access(`${path}/.git`);
  } catch {
    await mkdir("data/repos", { recursive: true });
    await execFile("git", [
      "clone",
      "--filter=blob:none",
      "--branch",
      branch,
      `https://github.com/${owner}/${name}.git`,
      path,
    ]);
  }
  await execFile("git", [
    "-c",
    `safe.directory=${resolve(path)}`,
    "-C",
    path,
    "switch",
    "--force",
    branch,
  ]);
  return path;
}

const repositoryInfo = await repository(owner, name);
const [commitList, pullList, issueList] = await Promise.all([
  commits(owner, name, repositoryInfo.default_branch),
  pulls(owner, name),
  issues(owner, name),
]);
const pullRecords = await batch(pullList, 4, async (pull) => {
  const [detail, pullCommitList, reviewList, commentList] = await Promise.all([
    pullDetail(owner, name, pull.number),
    pullCommits(owner, name, pull.number),
    reviews(owner, name, pull.number),
    reviewComments(owner, name, pull.number),
  ]);
  return {
    detail,
    commits: pullCommitList,
    reviews: reviewList,
    comments: commentList,
  };
});
const pullNodes = pullRecords.map((record) => record.detail);
const commitBySha = new Map(
  [...commitList, ...pullRecords.flatMap((record) => record.commits)].map(
    (commit) => [commit.sha, commit],
  ),
);
const allCommits = [...commitBySha.values()];
const [details, commitCommentLists, issueCommentLists] = await Promise.all([
  batch(allCommits, 8, (commit) => commitDetails(owner, name, commit.sha)),
  batch(
    allCommits,
    8,
    async (commit) =>
      [commit.sha, await commitComments(owner, name, commit.sha)] as const,
  ),
  batch(
    issueList,
    8,
    async (issue) =>
      [issue.number, await issueComments(owner, name, issue.number)] as const,
  ),
]);
const sourcePath = await cloneRepository(repositoryInfo.default_branch);
const trackedFiles = (
  await execFile("git", [
    "-c",
    `safe.directory=${resolve(sourcePath)}`,
    "-C",
    sourcePath,
    "ls-files",
  ])
).stdout
  .trim()
  .split(/\r?\n/)
  .filter((path) => /\.(?:[cm]?js|[cm]?ts|tsx)$/.test(path));
const parsedFiles = await Promise.all(
  trackedFiles.map((path) => parseFile(`${sourcePath}/${path}`, path)),
);
const parsed = resolveCalls(parsedFiles);
const functionUpdates = modifiedFunctions(details, parsed.functions);
await createSchema(graph);
await loadRepository(graph, {
  commits: allCommits,
  details,
  pulls: pullNodes,
  pullCommits: new Map(
    pullRecords.map((record, index) => [
      pullNodes[index]?.number ?? 0,
      record.commits,
    ]),
  ),
  reviews: new Map(
    pullRecords.map((record, index) => [
      pullNodes[index]?.number ?? 0,
      record.reviews,
    ]),
  ),
  reviewComments: new Map(
    pullRecords.map((record, index) => [
      pullNodes[index]?.number ?? 0,
      record.comments,
    ]),
  ),
  issues: issueList,
  issueComments: new Map(issueCommentLists),
  commitComments: new Map(commitCommentLists),
  functions: parsed.functions,
  calls: parsed.calls,
  modifiedFunctions: functionUpdates,
});
const revertedShas = [
  ...new Set(
    details.flatMap((detail) => {
      const sha = revertedCommit(detail.commit.message);
      return sha ? [sha] : [];
    }),
  ),
];
const associations = await batch(
  revertedShas,
  4,
  async (sha) => [sha, await commitPullRequests(owner, name, sha)] as const,
);
const incidents = detectIncidents(
  {
    commits: allCommits,
    details,
    pulls: pullNodes,
    pullCommits: new Map(
      pullRecords.map((record, index) => [
        pullNodes[index]?.number ?? 0,
        record.commits,
      ]),
    ),
    reviews: new Map(
      pullRecords.map((record, index) => [
        pullNodes[index]?.number ?? 0,
        record.reviews,
      ]),
    ),
    reviewComments: new Map(
      pullRecords.map((record, index) => [
        pullNodes[index]?.number ?? 0,
        record.comments,
      ]),
    ),
    issues: issueList,
    issueComments: new Map(issueCommentLists),
    commitComments: new Map(commitCommentLists),
    functions: parsed.functions,
    calls: parsed.calls,
    modifiedFunctions: functionUpdates,
  },
  new Map(associations),
);
await writeNodes(graph, "Incident", incidents.nodes);
for (const [key, rows] of Object.entries(incidents.edges)) {
  const type = {
    causedBy: "CAUSED_BY",
    reportedIn: "REPORTED_IN",
    resolvedBy: "RESOLVED_BY",
    reverts: "REVERTS",
  }[key as keyof typeof incidents.edges];
  await writeEdges(graph, type, rows);
}
const counts = await Promise.all(
  [
    "Person",
    "Commit",
    "PR",
    "Issue",
    "Comment",
    "File",
    "Function",
    "Incident",
  ].map(async (label) => {
    const rows = await query<{ count: number }>(
      graph,
      `MATCH (node:${label}) RETURN count(node) AS count`,
    );
    return `${label}=${rows[0]?.count ?? 0}`;
  }),
);
process.stdout.write(
  `Ingested ${repo}: ${counts.join(" ")} CALLS=${parsed.calls.length} MODIFIED_FUNCTIONS=${functionUpdates.length}\n`,
);
await closeGraphClient();
