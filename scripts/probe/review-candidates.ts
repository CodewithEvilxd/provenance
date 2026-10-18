import { recentMergedPulls } from "../../packages/ingest/src/github.js";
import { reviewComments } from "../../packages/ingest/src/github-discussions.js";
import { qualifiesComment } from "../../packages/decisions/src/review-filter.js";

const [repository, rawLimit] = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
  throw new Error("Pass owner/name");
const [owner, name] = repository.split("/");
if (!owner || !name) throw new Error("Pass owner/name");
const limit = Number(rawLimit ?? 100);
const pulls = await recentMergedPulls(owner, name, limit);
const comments = [];
for (let offset = 0; offset < pulls.length; offset += 10) {
  comments.push(
    ...(await Promise.all(
      pulls.slice(offset, offset + 10).map(async (pull) => ({
        pull,
        comments: await reviewComments(owner, name, pull.number),
      })),
    )),
  );
}
const qualified = comments.flatMap(({ pull, comments: reviews }) =>
  reviews
    .filter((comment) =>
      qualifiesComment(
        comment.body,
        comment.user?.type === "Bot" ||
          /\[bot\]$/i.test(comment.user?.login ?? ""),
      ),
    )
    .map((comment) => ({
      pull: pull.number,
      title: pull.title,
      id: `comment:review:${comment.id}`,
      url: comment.html_url,
      author: comment.user?.login,
      path: comment.path,
      body: comment.body,
    })),
);
process.stdout.write(
  `${JSON.stringify(
    {
      repository,
      qualifyingComments: qualified.length,
      cacheMentioned: qualified.filter(({ body }) => /\bcach/i.test(body)),
      qualified,
    },
    null,
    2,
  )}\n`,
);
