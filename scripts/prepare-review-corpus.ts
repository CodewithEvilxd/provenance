import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  recentMergedPulls,
  repository,
} from "../packages/ingest/src/github.js";
import {
  pullDetail,
  pullFiles,
  reviewComments,
} from "../packages/ingest/src/github-discussions.js";
import { prepareReviewThreads } from "../packages/decisions/src/preparation.js";
import { qualifiesComment } from "../packages/decisions/src/review-filter.js";

const [repo = "vercel/next.js", rawLimit = "300"] = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Pass owner/name");
const [owner, name] = repo.split("/");
if (!owner || !name) throw new Error("Pass owner/name");
const limit = Number(rawLimit);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
  throw new Error("Pass a merged pull request limit from 1 to 500");

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

const [repositoryInfo, merged] = await Promise.all([
  repository(owner, name),
  recentMergedPulls(owner, name, limit),
]);
const discussions = await batch(merged, 10, async (pull) => ({
  pull,
  comments: await reviewComments(owner, name, pull.number),
}));
const eligible = discussions.filter(({ comments }) =>
  comments.some((comment) =>
    qualifiesComment(
      comment.body,
      comment.user?.type === "Bot" ||
        /\[bot\]$/i.test(comment.user?.login ?? ""),
    ),
  ),
);
const selected = await batch(eligible, 5, async ({ pull }) => {
  const [detail, files, comments] = await Promise.all([
    pullDetail(owner, name, pull.number),
    pullFiles(owner, name, pull.number),
    reviewComments(owner, name, pull.number),
  ]);
  return { pull: detail, files, comments };
});
const threads = prepareReviewThreads(
  repo,
  selected.map(({ pull }) => pull),
  new Map(selected.map(({ pull, comments }) => [pull.number, comments])),
  new Map(selected.map(({ pull, files }) => [pull.number, files])),
);
const sourceIds = threads.flatMap((thread) =>
  thread.comments.map((comment) => comment.id),
);
const expectedIds = selected.flatMap(({ comments }) =>
  comments
    .filter((comment) =>
      qualifiesComment(
        comment.body,
        comment.user?.type === "Bot" ||
          /\[bot\]$/i.test(comment.user?.login ?? ""),
      ),
    )
    .map((comment) => `comment:review:${comment.id}`),
);
if (
  JSON.stringify([...sourceIds].sort()) !==
  JSON.stringify([...expectedIds].sort())
)
  throw new Error("Prepared source IDs differ from qualifying GitHub comments");
const comments = threads.flatMap((thread) => thread.comments);
const manifest = {
  repository: repo,
  default_branch: repositoryInfo.default_branch,
  measured_merged_pulls: limit,
  qualifying_comments: comments.length,
  distinct_pulls: selected.length,
  distinct_authors: new Set(
    comments.flatMap(({ author }) => (author ? [author] : [])),
  ).size,
  grouped_review_threads: threads.length,
  cache_related_comments: comments
    .filter(({ body }) => /\bcach/i.test(body))
    .map(({ id, url, body }) => ({ id, url, body })),
  source_ids: [...sourceIds].sort(),
  candidate_files: [
    ...new Set(threads.flatMap(({ candidate_file_ids }) => candidate_file_ids)),
  ].sort(),
  scope_note:
    "Real changed-file targets from GitHub; function scope requires a source checkout and parser pass.",
  pulls: selected.map(({ pull }) => pull),
  threads,
};
const path = join(
  process.cwd(),
  "tests",
  "corpus-measurements",
  "vercel-nextjs-preparation.json",
);
await mkdir(join(process.cwd(), "tests", "corpus-measurements"), {
  recursive: true,
});
await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({
    repository: repo,
    merged_pulls: limit,
    qualifying_comments: manifest.qualifying_comments,
    distinct_pulls: manifest.distinct_pulls,
    distinct_authors: manifest.distinct_authors,
    grouped_review_threads: manifest.grouped_review_threads,
    cache_related_comments: manifest.cache_related_comments.length,
    candidate_files: manifest.candidate_files.length,
    manifest: path,
  })}\n`,
);
