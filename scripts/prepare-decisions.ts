import { mkdir, writeFile } from "node:fs/promises";
import { execFile as run } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseFile, parseSource } from "../packages/ingest/src/parse.js";
import {
  prepareReviewThreads,
  preparationHash,
} from "../packages/decisions/src/preparation.js";
import { recentMergedPulls } from "../packages/ingest/src/github.js";
import {
  pullFiles,
  reviewComments,
  sourceAtCommit,
} from "../packages/ingest/src/github-discussions.js";
import manifest from "../tests/corpus-measurements/vitejs-vite.json" with { type: "json" };

const execFile = promisify(run);
const [owner, name] = manifest.repository.split("/");
if (!owner || !name) throw new Error("Corpus manifest must name owner/name");
const measured = await recentMergedPulls(
  owner,
  name,
  manifest.merged_pull_limit,
);
const pullList = measured.filter((pull) =>
  manifest.qualified_pulls.includes(pull.number),
);
const discussions = await Promise.all(
  pullList.map(async (pull) => ({
    pull,
    comments: await reviewComments(owner, name, pull.number),
    files: await pullFiles(owner, name, pull.number),
  })),
);
const threads = prepareReviewThreads(
  manifest.repository,
  pullList,
  new Map(discussions.map(({ pull, comments }) => [pull.number, comments])),
  new Map(discussions.map(({ pull, files }) => [pull.number, files])),
);
const repositoryPath = join(process.cwd(), "data", "repos", "vitejs__vite");
const sourceCommit = (
  await execFile("git", [
    "-c",
    `safe.directory=${repositoryPath.replace(/\\/g, "/")}`,
    "-C",
    repositoryPath,
    "rev-parse",
    "HEAD",
  ])
).stdout.trim();
const candidatePaths = [
  ...new Set(
    threads.flatMap((thread) =>
      thread.candidate_file_ids.map((id) => id.slice(5)),
    ),
  ),
];
const parsedFiles = await Promise.all(
  candidatePaths.map(async (path) => {
    try {
      return await parseFile(join(repositoryPath, path), path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }),
);
const functions = parsedFiles.flatMap((parsed) => parsed?.functions ?? []);
const functionIds = new Set(functions.map(({ id }) => id));
for (const thread of threads) {
  for (const comment of thread.comments) {
    const candidates = functions.filter((fn) => fn.path === comment.path);
    const scoped =
      comment.line_at_review === null
        ? candidates.length === 1
          ? candidates
          : []
        : candidates.filter(
            (fn) =>
              fn.start_line <= comment.line_at_review! &&
              fn.end_line >= comment.line_at_review!,
          );
    comment.candidate_function_ids = scoped.map(({ id }) => id).sort();
    if (scoped.length) {
      comment.scope_basis = "current_head";
      continue;
    }
    if (comment.scope_resolution === "pull_changed_files") {
      comment.scope_uncertainty =
        "comment path is absent from this PR changed-file list";
      continue;
    }
    if (!/\.(?:[cm]?js|[cm]?ts|tsx)$/.test(comment.path)) {
      comment.scope_uncertainty =
        "reviewed file is not parsed as JavaScript or TypeScript";
      continue;
    }
    if (!comment.original_commit_id || comment.line_at_review === null) {
      comment.scope_uncertainty =
        "no source commit or review line is available";
      continue;
    }
    try {
      const source = await sourceAtCommit(
        owner,
        name,
        comment.path,
        comment.original_commit_id,
      );
      const historical = parseSource(source, comment.path).functions.find(
        (fn) =>
          fn.start_line <= comment.line_at_review! &&
          fn.end_line >= comment.line_at_review!,
      );
      if (historical && functionIds.has(historical.id)) {
        comment.candidate_function_ids = [historical.id];
        comment.scope_basis = "original_commit";
      } else {
        comment.scope_uncertainty = historical
          ? "historical function is absent from the ingested HEAD graph"
          : "review line is outside a function at the original commit";
      }
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : 0;
      if (status !== 404) throw error;
      comment.scope_uncertainty =
        "original file is unavailable at the review commit";
    }
  }
  thread.candidate_function_ids = [
    ...new Set(
      thread.comments.flatMap(
        ({ candidate_function_ids }) => candidate_function_ids,
      ),
    ),
  ].sort();
}
const comments = threads.flatMap((thread) => thread.comments);
const sourceIds = comments.map(({ id }) => id).sort();
const expectedIds = [...manifest.source_ids].sort();
if (JSON.stringify(sourceIds) !== JSON.stringify(expectedIds))
  throw new Error(
    `Measured source IDs differ: prepared ${sourceIds.length}, expected ${expectedIds.length}`,
  );
const report = {
  repository: manifest.repository,
  measured_merged_pulls: manifest.merged_pull_limit,
  qualifying_comments: comments.length,
  distinct_pulls: new Set(threads.map(({ pull_number }) => pull_number)).size,
  distinct_authors: new Set(
    comments.flatMap(({ author }) => (author ? [author] : [])),
  ).size,
  grouped_review_threads: threads.length,
  candidate_files: [
    ...new Set(threads.flatMap(({ candidate_file_ids }) => candidate_file_ids)),
  ].sort(),
  candidate_functions: [
    ...new Set(
      threads.flatMap(({ candidate_function_ids }) => candidate_function_ids),
    ),
  ].sort(),
  function_source: "vitejs/vite default-branch HEAD",
  function_source_commit: sourceCommit,
  pull_file_fallback_comments: comments.filter(
    ({ scope_resolution }) => scope_resolution === "pull_changed_files",
  ).length,
  historical_function_scopes: comments.filter(
    ({ scope_basis }) => scope_basis === "original_commit",
  ).length,
  current_head_function_scopes: comments.filter(
    ({ scope_basis }) => scope_basis === "current_head",
  ).length,
  scope_uncertainties: comments.flatMap((comment) =>
    comment.scope_uncertainty
      ? [{ id: comment.id, reason: comment.scope_uncertainty }]
      : [],
  ),
  unresolved_comment_scopes: threads.flatMap((thread) =>
    thread.comments
      .filter(({ candidate_file_ids }) => !candidate_file_ids.length)
      .map(({ id }) => id),
  ),
  preparation_hash: preparationHash(threads),
  threads,
};
const outputPath = join(
  process.cwd(),
  "tests",
  "corpus-measurements",
  "vitejs-vite-preparation.json",
);
await mkdir(join(process.cwd(), "tests", "corpus-measurements"), {
  recursive: true,
});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ ...report, threads: undefined }, null, 2)}\n`,
);
