import { execFile as run } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { closeGraphClient, query } from "../packages/graph/src/client.js";
import { createSchema } from "../packages/graph/src/schema.js";
import { loadRepository } from "../packages/ingest/src/load.js";
import { writeEdges, writeNodes } from "../packages/ingest/src/load-writes.js";
import { detectIncidents } from "../packages/ingest/src/incidents.js";
import {
  cached,
  octokit,
  type Issue,
  type IssueComment,
  type Pull,
} from "../packages/ingest/src/github.js";
import {
  commitComments,
  commitDetails,
  issueComments,
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
import preparation from "../tests/corpus-measurements/vitejs-vite-preparation.json" with { type: "json" };

if (!process.env.GITHUB_TOKEN && existsSync(".env.local"))
  process.loadEnvFile(".env.local");

const execFile = promisify(run);
const graph = "repo:vitejs/vite";
const numbers = [22832, 23198];
const issueNumber = 23197;

async function sourceTree() {
  const directory = join(process.cwd(), "data", "repos", "vitejs__vite");
  await access(join(directory, ".git"));
  await readFile(join(directory, ".git", "HEAD"), "utf8");
  const safe = `safe.directory=${resolve(directory)}`;
  await execFile("git", [
    "-c",
    safe,
    "-C",
    directory,
    "checkout",
    "--detach",
    preparation.function_source_commit,
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
  return resolveCalls(
    await Promise.all(
      paths.map((path) => parseFile(join(directory, path), path)),
    ),
  );
}

async function main() {
  const [issueResponse, pulls, parsed] = await Promise.all([
    cached(
      "vitejs",
      "vite",
      `issue:${issueNumber}:detail`,
      async () =>
        (
          await octokit.issues.get({
            owner: "vitejs",
            repo: "vite",
            issue_number: issueNumber,
          })
        ).data,
    ),
    Promise.all(numbers.map((number) => pullDetail("vitejs", "vite", number))),
    sourceTree(),
  ]);
  const issue = issueResponse as Issue;
  const discussions = await Promise.all(
    pulls.map(async (pull) => {
      const [commits, reviewList, comments, files] = await Promise.all([
        pullCommits("vitejs", "vite", pull.number),
        reviews("vitejs", "vite", pull.number),
        reviewComments("vitejs", "vite", pull.number),
        pullFiles("vitejs", "vite", pull.number),
      ]);
      return { pull, commits, reviews: reviewList, comments, files };
    }),
  );
  const allCommits = [
    ...new Map(
      discussions
        .flatMap(({ commits }) => commits)
        .map((commit) => [commit.sha, commit]),
    ).values(),
  ];
  const [details, issueCommentList, commitCommentEntries] = await Promise.all([
    Promise.all(
      allCommits.map((commit) => commitDetails("vitejs", "vite", commit.sha)),
    ),
    issueComments("vitejs", "vite", issue.number),
    Promise.all(
      allCommits.map(
        async ({ sha }) =>
          [sha, await commitComments("vitejs", "vite", sha)] as const,
      ),
    ),
  ]);
  const records = {
    commits: allCommits,
    details,
    pulls: pulls as Pull[],
    pullCommits: new Map(
      discussions.map(({ pull, commits }) => [pull.number, commits]),
    ),
    reviews: new Map(
      discussions.map(({ pull, reviews: pullReviews }) => [
        pull.number,
        pullReviews,
      ]),
    ),
    reviewComments: new Map(
      discussions.map(({ pull, comments }) => [pull.number, comments]),
    ),
    issues: [issue],
    issueComments: new Map<number, IssueComment[]>([
      [issue.number, issueCommentList],
    ]),
    commitComments: new Map(commitCommentEntries),
    functions: parsed.functions,
    calls: parsed.calls,
    modifiedFunctions: modifiedFunctions(details, parsed.functions),
  };
  await createSchema(graph);
  await loadRepository(graph, records);
  const sources = preparation.threads.reduce<
    { id: string; url: string; body: string }[]
  >((all, thread) => {
    for (const comment of thread.comments)
      all.push({ id: comment.id, url: comment.url, body: comment.body });
    return all;
  }, []);
  const existing = await query<{ id: string }>(
    graph,
    "MATCH (comment:Comment) WHERE comment.id IN $ids RETURN comment.id AS id",
    { ids: sources.map(({ id }) => id) },
  );
  if (existing.length !== sources.length)
    throw new Error(
      "The verified review source comments are not all in FalkorDB",
    );
  await writeNodes(
    graph,
    "Comment",
    sources.map(({ id, url, body }) => ({ id, props: { url, body } })),
  );
  const incidents = detectIncidents(records);
  await writeNodes(graph, "Incident", incidents.nodes);
  for (const [key, rows] of Object.entries(incidents.edges)) {
    const relationship = {
      causedBy: "CAUSED_BY",
      reportedIn: "REPORTED_IN",
      resolvedBy: "RESOLVED_BY",
      reverts: "REVERTS",
    }[key as keyof typeof incidents.edges];
    await writeEdges(graph, relationship, rows);
  }
  const evidence = await query<{
    incident: string;
    issue: string;
    cause: number;
  }>(
    graph,
    "MATCH (incident:Incident {id: $incident})-[:REPORTED_IN]->(issue:Issue)<-[:FIXES]-(fix:PR), (incident)-[:CAUSED_BY]->(cause:PR) RETURN incident.id AS incident, issue.url AS issue, cause.number AS cause",
    { incident: `incident:regression:issue:${issueNumber}` },
  );
  process.stdout.write(
    `${JSON.stringify({ issue: { number: issue.number, url: issue.html_url, labels: issue.labels.map(({ name }) => name) }, pulls: discussions.map(({ pull, commits, files }) => ({ number: pull.number, url: pull.html_url, commits: commits.length, files: files.map(({ filename }) => filename) })), functions: parsed.functions.length, incident: incidents.nodes.find(({ id }) => id === `incident:regression:issue:${issueNumber}`), causalEdges: incidents.edges.causedBy.filter(({ from }) => from === `incident:regression:issue:${issueNumber}`), verified: evidence }, null, 2)}\n`,
  );
}

try {
  await main();
} finally {
  await closeGraphClient();
}
