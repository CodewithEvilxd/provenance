import {
  recentMergedPulls,
  repository as getRepository,
} from "../../packages/ingest/src/github.js";
import { reviewComments } from "../../packages/ingest/src/github-discussions.js";

const [repository, rawLimit] = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
  throw new Error("Pass a public repository as owner/name");
const [owner, name] = repository.split("/");
if (!owner || !name) throw new Error("Pass a public repository as owner/name");
const limit = Number(rawLimit ?? 100);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
  throw new Error("Pass a merged pull request limit from 1 to 500");
const repositoryInfo = await getRepository(owner, name);
const merged = await recentMergedPulls(owner, name, limit);
const rationale =
  /\b(?:because|so that|instead of|do not|don['’]t|must|should|avoid|never|rather than|trade[- ]off|workaround|ha(?:c)k|legacy|deprecated|breaks|regression)\b/i;
const threads = [];
for (let offset = 0; offset < merged.length; offset += 10) {
  const batch = merged.slice(offset, offset + 10);
  threads.push(
    ...(await Promise.all(
      batch.map(async (pull) => ({
        number: pull.number,
        author: pull.user?.login ?? null,
        comments: await reviewComments(owner, name, pull.number),
      })),
    )),
  );
}
const qualified = threads.flatMap(({ number, comments }) =>
  comments
    .filter((comment) => {
      const words = comment.body.trim().split(/\s+/).filter(Boolean).length;
      const bot =
        comment.user?.type === "Bot" ||
        /\[bot\]$/i.test(comment.user?.login ?? "");
      return !bot && words >= 15 && rationale.test(comment.body);
    })
    .map((comment) => ({
      id: `comment:review:${comment.id}`,
      pull: number,
      author: comment.user?.login ?? null,
      created_at: comment.created_at,
      body: comment.body,
    })),
);
process.stdout.write(
  JSON.stringify(
    {
      repository,
      default_branch: repositoryInfo.default_branch,
      merged_pull_limit: limit,
      merged_pulls_measured: merged.length,
      review_comments: threads.reduce(
        (total, thread) => total + thread.comments.length,
        0,
      ),
      qualifying_comments: qualified.length,
      distinct_qualified_pulls: new Set(
        qualified.map((comment) => comment.pull),
      ).size,
      distinct_qualified_authors: new Set(
        qualified.flatMap((comment) =>
          comment.author ? [comment.author] : [],
        ),
      ).size,
      qualified_pulls: [...new Set(qualified.map((comment) => comment.pull))],
      qualified_authors: [
        ...new Set(
          qualified.flatMap((comment) =>
            comment.author ? [comment.author] : [],
          ),
        ),
      ],
      source_ids: qualified.map(({ id }) => id),
    },
    null,
    2,
  ) + "\n",
);
