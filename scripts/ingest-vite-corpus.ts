import { execFile as run } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { query, closeGraphClient } from "../packages/graph/src/client.js";
import { createSchema } from "../packages/graph/src/schema.js";
import { loadRepository } from "../packages/ingest/src/load.js";
import {
  writeEdges,
  writeNodes,
  commentId,
} from "../packages/ingest/src/load-writes.js";
import {
  detectIncidents,
  revertedCommit,
} from "../packages/ingest/src/incidents.js";
import {
  recentMergedPulls,
  repository,
  type IssueComment,
} from "../packages/ingest/src/github.js";
import {
  commitComments,
  commitDetails,
  commitPullRequests,
  pullCommits,
  pullDetail,
  pullFiles,
  reviewComments,
  reviews,
} from "../packages/ingest/src/github-discussions.js";
import {
  modifiedFunctions,
  parseFile,
  resolveCalls,
} from "../packages/ingest/src/parse.js";
import corpus from "../tests/corpus-measurements/vitejs-vite.json" with { type: "json" };
import preparation from "../tests/corpus-measurements/vitejs-vite-preparation.json" with { type: "json" };

const execFile = promisify(run);
const [owner, name] = corpus.repository.split("/");
if (!owner || !name) throw new Error("Vite corpus manifest is invalid");
const graph = `repo:${corpus.repository}`;

async function batches<T, R>(
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

async function sourcePulls() {
  const latest = await recentMergedPulls(
    owner!,
    name!,
    corpus.merged_pull_limit,
  );
  const selected = latest.filter((pull) =>
    corpus.qualified_pulls.includes(pull.number),
  );
  if (selected.length !== corpus.distinct_qualified_pulls)
    throw new Error(
      `Expected ${corpus.distinct_qualified_pulls} measured PRs, found ${selected.length}`,
    );
  return batches(selected, 4, (pull) => pullDetail(owner!, name!, pull.number));
}

async function pullRecords(pulls: Awaited<ReturnType<typeof sourcePulls>>) {
  return batches(pulls, 4, async (pull) => {
    const [pullCommitList, reviewList, comments, files] = await Promise.all([
      pullCommits(owner!, name!, pull.number),
      reviews(owner!, name!, pull.number),
      reviewComments(owner!, name!, pull.number),
      pullFiles(owner!, name!, pull.number),
    ]);
    return {
      pull,
      commits: pullCommitList,
      reviews: reviewList,
      comments,
      files,
    };
  });
}

async function sourceTree(sourceCommit: string) {
  const directory = join(process.cwd(), "data", "repos", "vitejs__vite");
  try {
    await access(join(directory, ".git"));
  } catch {
    throw new Error(
      "Run the Vite corpus preparation once to create its real source checkout",
    );
  }
  const safe = `safe.directory=${resolve(directory)}`;
  await execFile("git", [
    "-c",
    safe,
    "-C",
    directory,
    "checkout",
    "--detach",
    sourceCommit,
  ]);
  const tracked = await execFile("git", [
    "-c",
    safe,
    "-C",
    directory,
    "ls-files",
  ]);
  const paths = tracked.stdout
    .trim()
    .split(/\r?\n/)
    .filter((path) => /\.(?:[cm]?js|[cm]?ts|tsx)$/.test(path));
  const files = await Promise.all(
    paths.map((path) => parseFile(join(directory, path), path)),
  );
  return resolveCalls(files);
}

function verifySources(records: Awaited<ReturnType<typeof pullRecords>>) {
  const references = new Map(
    preparation.threads.flatMap((thread) =>
      thread.comments.map(
        (comment) =>
          [
            comment.id,
            { url: comment.url, pull_url: thread.pull_url },
          ] as const,
      ),
    ),
  );
  const comments = records.flatMap(({ comments }) => comments);
  const expected = [...corpus.source_ids].sort();
  const actual = comments.filter((comment) =>
    references.has(commentId(comment.id, "review")),
  );
  if (
    JSON.stringify(
      actual.map((comment) => commentId(comment.id, "review")).sort(),
    ) !== JSON.stringify(expected)
  )
    throw new Error(
      "Vite review comment IDs no longer match the saved source manifest",
    );
  for (const { pull, comments: pullComments } of records)
    for (const comment of pullComments) {
      const reference = references.get(commentId(comment.id, "review"));
      if (
        reference &&
        (reference.url !== comment.html_url ||
          reference.pull_url !== pull.html_url)
      )
        throw new Error(
          `GitHub source URL changed for review comment ${comment.id}`,
        );
    }
}

async function graphCounts() {
  const nodeLabels = [
    "Person",
    "Commit",
    "PR",
    "Issue",
    "Comment",
    "File",
    "Function",
    "Incident",
    "Decision",
  ];
  const edgeTypes = [
    "AUTHORED",
    "REVIEWED",
    "CONTAINS",
    "MODIFIED",
    "ON",
    "IN",
    "CALLS",
    "MENTIONS",
    "FIXES",
    "REVERTS",
    "CAUSED_BY",
    "REPORTED_IN",
    "RESOLVED_BY",
  ];
  const nodes = await Promise.all(
    nodeLabels.map(async (label) => {
      const rows = await query<{ count: number }>(
        graph,
        `MATCH (node:${label}) RETURN count(node) AS count`,
      );
      return [label, rows[0]?.count ?? 0] as const;
    }),
  );
  const edges = await Promise.all(
    edgeTypes.map(async (type) => {
      const rows = await query<{ count: number }>(
        graph,
        `MATCH ()-[edge:${type}]->() RETURN count(edge) AS count`,
      );
      return [type, rows[0]?.count ?? 0] as const;
    }),
  );
  return { nodes: Object.fromEntries(nodes), edges: Object.fromEntries(edges) };
}

const repositoryInfo = await repository(owner, name);
const pullList = await sourcePulls();
const discussions = await pullRecords(pullList);
verifySources(discussions);
for (const { pull, files } of discussions) {
  const prepared = preparation.threads.find(
    (thread) => thread.pull_number === pull.number,
  );
  if (
    JSON.stringify([...prepared!.changed_file_paths].sort()) !==
    JSON.stringify(files.map(({ filename }) => filename).sort())
  )
    throw new Error(
      `Changed files differ from saved source manifest for PR ${pull.number}`,
    );
}
const commitBySha = new Map(
  discussions
    .flatMap(({ commits: pullCommitsList }) => pullCommitsList)
    .map((commit) => [commit.sha, commit]),
);
const allCommits = [...commitBySha.values()];
const details = await batches(allCommits, 8, (commit) =>
  commitDetails(owner, name, commit.sha),
);
const commentLists = await batches(
  allCommits,
  8,
  async (commit) =>
    [commit.sha, await commitComments(owner, name, commit.sha)] as const,
);
const parsed = await sourceTree(preparation.function_source_commit);
const modified = modifiedFunctions(details, parsed.functions);
const records = {
  commits: allCommits,
  details,
  pulls: pullList,
  pullCommits: new Map(
    discussions.map(({ pull, commits: pullCommitList }) => [
      pull.number,
      pullCommitList,
    ]),
  ),
  reviews: new Map(
    discussions.map(({ pull, reviews: reviewList }) => [
      pull.number,
      reviewList,
    ]),
  ),
  reviewComments: new Map(
    discussions.map(({ pull, comments }) => [pull.number, comments]),
  ),
  issues: [],
  issueComments: new Map<number, IssueComment[]>(),
  commitComments: new Map(commentLists),
  functions: parsed.functions,
  calls: parsed.calls,
  modifiedFunctions: modified,
};
await createSchema(graph);
await loadRepository(graph, records);
const revertedShas = [
  ...new Set(
    details.flatMap((detail) => {
      const sha = revertedCommit(detail.commit.message);
      return sha ? [sha] : [];
    }),
  ),
];
const associated = await batches(
  revertedShas,
  4,
  async (sha) => [sha, await commitPullRequests(owner, name, sha)] as const,
);
const incidents = detectIncidents(records, new Map(associated));
await writeNodes(graph, "Incident", incidents.nodes);
for (const [edge, rows] of Object.entries(incidents.edges)) {
  const type = {
    causedBy: "CAUSED_BY",
    reportedIn: "REPORTED_IN",
    resolvedBy: "RESOLVED_BY",
    reverts: "REVERTS",
  }[edge as keyof typeof incidents.edges];
  await writeEdges(graph, type, rows);
}
const counts = await graphCounts();
process.stdout.write(
  `${JSON.stringify({ repository: repositoryInfo.full_name, source_commit: preparation.function_source_commit, merged_pulls: pullList.length, comments: discussions.reduce((count, record) => count + record.comments.length, 0), commits: allCommits.length, functions: parsed.functions.length, calls: parsed.calls.length, modified_functions: modified.length, incidents: incidents.nodes.length, counts }, null, 2)}\n`,
);
await closeGraphClient();
