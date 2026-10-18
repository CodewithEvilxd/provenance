import { execFile as run } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
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
  commitComments,
  issues,
  issueComments,
  pullCommits,
  reviewComments,
} from "../src/github-discussions.js";
import { parseFile, resolveCalls } from "../src/parse.js";

const execFile = promisify(run);
const corpus = "jridgewell/trace-mapping";
const [owner, name] = corpus.split("/");
const graph = "test:corpus";
const sourcePath = `data/repos/${owner}__${name}`;

async function ingest() {
  await execFile(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/ingest.ts", "--", corpus],
    { env: { ...process.env, PROVENANCE_GRAPH: graph } },
  );
}

async function countNodes(label: string) {
  const rows = await query<{ count: number }>(
    graph,
    `MATCH (node:${label}) RETURN count(node) AS count`,
  );
  return rows[0]?.count ?? 0;
}

async function countEdges(type: string) {
  const rows = await query<{ count: number }>(
    graph,
    `MATCH ()-[edge:${type}]->() RETURN count(edge) AS count`,
  );
  return rows[0]?.count ?? 0;
}

async function pullCommitsFor(number: number) {
  return pullCommits(owner!, name!, number);
}

async function verifyGitHubCounts() {
  const repositoryInfo = await repository(owner!, name!);
  const [mainCommits, pullList, issueList] = await Promise.all([
    commits(owner!, name!, repositoryInfo.default_branch),
    pulls(owner!, name!),
    issues(owner!, name!),
  ]);
  await access(`${sourcePath}/.git`);
  const git = await execFile("git", [
    "-c",
    `safe.directory=${resolve(sourcePath)}`,
    "-C",
    sourcePath,
    "rev-list",
    "--count",
    "HEAD",
  ]);
  expect(mainCommits.length).toBe(Number(git.stdout.trim()));
  const pullCommitLists = await Promise.all(
    pullList.map((pull) => pullCommitsFor(pull.number)),
  );
  const commitShas = new Set([
    ...mainCommits.map((commit) => commit.sha),
    ...pullCommitLists.flat().map((commit) => commit.sha),
  ]);
  const reviewComments = await Promise.all(
    pullList.map((pull) => reviewCommentsFor(pull.number)),
  );
  const issueComments = await Promise.all(
    issueList.map((issue) => issueCommentsFor(issue.number)),
  );
  const commitComments = await Promise.all(
    [...commitShas].map((sha) => commitCommentsFor(sha)),
  );
  expect(await countNodes("Commit")).toBe(commitShas.size);
  expect(await countNodes("PR")).toBe(pullList.length);
  expect(await countNodes("Issue")).toBe(issueList.length);
  expect(await countNodes("Comment")).toBe(
    [...reviewComments, ...issueComments, ...commitComments].reduce(
      (total, comments) => total + comments.length,
      0,
    ),
  );
}

async function reviewCommentsFor(number: number) {
  return reviewComments(owner!, name!, number);
}

async function issueCommentsFor(number: number) {
  return issueComments(owner!, name!, number);
}

async function commitCommentsFor(sha: string) {
  return commitComments(owner!, name!, sha);
}

async function parsedSource() {
  const listed = await execFile("git", [
    "-c",
    `safe.directory=${resolve(sourcePath)}`,
    "-C",
    sourcePath,
    "ls-files",
  ]);
  const paths = listed.stdout
    .trim()
    .split(/\r?\n/)
    .filter((path) => /\.(?:[cm]?js|[cm]?ts|tsx)$/.test(path));
  return resolveCalls(
    await Promise.all(
      paths.map((path) => parseFile(`${sourcePath}/${path}`, path)),
    ),
  );
}

async function verifyBounds(parsed: Awaited<ReturnType<typeof parsedSource>>) {
  const functionId = parsed.functions.find(
    (fn) => fn.path === "src/trace-mapping.ts" && fn.name === "eachMapping",
  )?.id;
  expect(functionId).toBeDefined();
  const rows = await query<{
    id: string;
    start_line: number;
    end_line: number;
  }>(
    graph,
    "MATCH (fn:Function {id: $id}) RETURN fn.id AS id, fn.start_line AS start_line, fn.end_line AS end_line",
    { id: functionId! },
  );
  const expected = parsed.functions.find((fn) => fn.id === functionId);
  expect(rows[0]).toEqual({
    id: functionId,
    start_line: expected?.start_line,
    end_line: expected?.end_line,
  });
  return { functionId, sourceFunction: expected };
}

async function verifyCallers(
  parsed: Awaited<ReturnType<typeof parsedSource>>,
  functionId: string,
) {
  const callers = await query<{ id: string }>(
    graph,
    "MATCH (caller:Function)-[:CALLS]->(fn:Function {id: $id}) RETURN caller.id AS id ORDER BY caller.id",
    { id: functionId },
  );
  const expected = parsed.calls
    .filter((call) => call.callee === functionId)
    .map((call) => call.caller);
  expect(callers.map((caller) => caller.id)).toEqual(
    [...new Set(expected)].sort(),
  );
}

async function verifyLastFive(
  functionId: string,
  path: string,
  startLine: number,
  endLine: number,
) {
  const commits = await query<{ sha: string }>(
    graph,
    "MATCH (commit:Commit)-[:MODIFIED]->(fn:Function {id: $id}) RETURN commit.sha AS sha, commit.committed_at AS committed_at ORDER BY commit.committed_at DESC LIMIT 5",
    { id: functionId },
  );
  const repositoryInfo = await repository(owner!, name!);
  const mainCommits = await commitsForDefaultBranch(
    repositoryInfo.default_branch,
  );
  const pullList = await pulls(owner!, name!);
  const pullCommitLists = await Promise.all(
    pullList.map((pull) => pullCommitsFor(pull.number)),
  );
  const commitShas = new Set([
    ...mainCommits.map((commit) => commit.sha),
    ...pullCommitLists.flat().map((commit) => commit.sha),
  ]);
  const details = await Promise.all(
    [...commitShas].map((sha) => commitDetails(owner!, name!, sha)),
  );
  const expected = details
    .filter((detail) =>
      detail.files.some(
        (file) =>
          file.filename === path &&
          (file.patch ?? "").split("\n").some((line) => {
            const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
            if (!hunk) return false;
            const first = Number(hunk[1]);
            const last = first + Number(hunk[2] ?? 1) - 1;
            return first <= endLine && last >= startLine;
          }),
      ),
    )
    .sort(
      (left, right) =>
        Date.parse(right.commit.author?.date ?? "") -
        Date.parse(left.commit.author?.date ?? ""),
    )
    .slice(0, 5)
    .map((detail) => detail.sha);
  expect(commits.map((commit) => commit.sha)).toEqual(expected);
}

async function commitsForDefaultBranch(branch: string) {
  return commits(owner!, name!, branch);
}

async function verifyParser() {
  const parsed = await parsedSource();
  expect(await countNodes("Function")).toBe(parsed.functions.length);
  expect(await countEdges("CALLS")).toBe(parsed.calls.length);
  const { functionId, sourceFunction } = await verifyBounds(parsed);
  await verifyCallers(parsed, functionId!);
  await verifyLastFive(
    functionId!,
    sourceFunction!.path,
    sourceFunction!.start_line,
    sourceFunction!.end_line,
  );
}

async function verifyIdempotency() {
  const labels = [
    "Person",
    "Commit",
    "PR",
    "Issue",
    "Comment",
    "File",
    "Function",
  ];
  const before = await Promise.all(labels.map(countNodes));
  await ingest();
  const after = await Promise.all(labels.map(countNodes));
  expect(after).toEqual(before);
}

beforeAll(async () => ingest());
it("matches GitHub payload counts and the git history", verifyGitHubCounts);
it("keeps graph counts stable on the second ingest", verifyIdempotency);
it("matches parsed functions, callers and recent commits", verifyParser);

afterAll(async () => {
  await (await selectGraph(graph)).delete();
  await closeGraphClient();
});
