import { afterAll, expect, it } from "vitest";
import {
  closeGraphClient,
  query,
  selectGraph,
} from "../../graph/src/client.js";
import { pulls } from "../../ingest/src/github.js";
import {
  pullFiles,
  reviewComments,
} from "../../ingest/src/github-discussions.js";
import { commentId } from "../../ingest/src/load-writes.js";
import { extractDecisions } from "../src/extract.js";
import { qualifiesComment } from "../src/review-filter.js";

const corpus = "jridgewell/trace-mapping";
const [owner, name] = corpus.split("/");
const graph = "test:decisions-offline";

async function decisionCount() {
  const rows = await query<{ count: number }>(
    graph,
    "MATCH (decision:Decision) RETURN count(decision) AS count",
  );
  return rows[0]?.count ?? 0;
}

async function sourceThreads() {
  const pullList = await pulls(owner!, name!);
  const threads = await Promise.all(
    pullList.map(async (pull) => ({
      pull,
      comments: await reviewComments(owner!, name!, pull.number),
    })),
  );
  const candidates = threads
    .filter(({ comments }) =>
      comments.some((comment) =>
        qualifiesComment(
          comment.body,
          comment.user?.type === "Bot" ||
            /\[bot\]$/i.test(comment.user?.login ?? ""),
        ),
      ),
    )
    .map(({ pull, comments }) => ({
      pull,
      thread: {
        number: pull.number,
        title: pull.title,
        body: pull.body ?? "",
        comments: comments.map((comment) => ({
          id: commentId(comment.id, "review"),
          body: comment.body,
          path: comment.path,
          line: comment.line,
          created_at: comment.created_at,
          is_bot:
            comment.user?.type === "Bot" ||
            /\[bot\]$/i.test(comment.user?.login ?? ""),
        })),
      },
    }));
  const files = await Promise.all(
    candidates.map(async ({ pull }) => ({
      number: pull.number,
      paths: (await pullFiles(owner!, name!, pull.number)).map(
        (file) => file.filename,
      ),
    })),
  );
  return {
    threads: candidates.map(({ thread }) => thread),
    files: new Map(files.map(({ number, paths }) => [number, paths])),
    sourceComments: threads.flatMap(({ comments }) => comments),
  };
}

it("replays only cached model responses without changing the graph", async () => {
  const { threads, files, sourceComments } = await sourceThreads();
  const expected = sourceComments
    .filter((comment) => {
      const words = comment.body.trim().split(/\s+/).filter(Boolean).length;
      const bot =
        comment.user?.type === "Bot" ||
        /\[bot\]$/i.test(comment.user?.login ?? "");
      const cue =
        /\b(?:because|so that|instead of|do not|don['’]t|must|should|avoid|never|rather than|trade[- ]off|workaround|ha(?:c)k|legacy|deprecated|breaks|regression)\b/i;
      return !bot && words >= 15 && cue.test(comment.body);
    })
    .map((comment) => commentId(comment.id, "review"));
  const actual = sourceComments
    .filter((comment) =>
      qualifiesComment(
        comment.body,
        comment.user?.type === "Bot" ||
          /\[bot\]$/i.test(comment.user?.login ?? ""),
      ),
    )
    .map((comment) => commentId(comment.id, "review"));
  expect(actual).toEqual(expected);
  const before = await decisionCount();
  const cached = await extractDecisions(graph, corpus, threads, files, true);
  expect(cached.threadsProcessed).toBe(threads.length);
  expect(cached.decisionsPassedVerification).toBe(0);
  expect(Array.isArray(cached.skippedThreads)).toBe(true);
  expect(await decisionCount()).toBe(before);
});

afterAll(async () => {
  await (await selectGraph(graph)).delete();
  await closeGraphClient();
});
