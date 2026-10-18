import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { cachedValue } from "../src/cache.js";
import { prepareReviewThreads, preparationHash } from "../src/preparation.js";
import { extractionCacheInput } from "../src/extract.js";
import { extractionSchema } from "../src/schema.js";
import { recentMergedPulls } from "../../ingest/src/github.js";
import {
  pullFiles,
  reviewComments,
} from "../../ingest/src/github-discussions.js";
import { qualifiesComment } from "../src/review-filter.js";
import manifest from "../../../tests/corpus-measurements/vitejs-vite.json" with { type: "json" };
import preparation from "../../../tests/corpus-measurements/vitejs-vite-preparation.json" with { type: "json" };

const [owner, name] = manifest.repository.split("/");

async function sourceThreads() {
  const pulls = (
    await recentMergedPulls(owner!, name!, manifest.merged_pull_limit)
  ).filter((pull) => manifest.qualified_pulls.includes(pull.number));
  const discussions = await Promise.all(
    pulls.map(async (pull) => ({
      pull,
      comments: await reviewComments(owner!, name!, pull.number),
      files: await pullFiles(owner!, name!, pull.number),
    })),
  );
  return prepareReviewThreads(
    manifest.repository,
    pulls,
    new Map(discussions.map(({ pull, comments }) => [pull.number, comments])),
    new Map(discussions.map(({ pull, files }) => [pull.number, files])),
  );
}

it("filters and preserves every measured GitHub comment and original link", async () => {
  const threads = await sourceThreads();
  const comments = threads.flatMap((thread) => thread.comments);
  expect(comments.map(({ id }) => id).sort()).toEqual(
    [...manifest.source_ids].sort(),
  );
  expect(
    comments.every(({ url }) =>
      /^https:\/\/github\.com\/vitejs\/vite\/pull\//.test(url),
    ),
  ).toBe(true);
  expect(
    comments.every(({ body, author }) =>
      qualifiesComment(body, /\[bot\]$/i.test(author ?? "")),
    ),
  ).toBe(true);
  expect(threads.map(({ id }) => id)).toEqual(
    preparation.threads.map(({ id }) => id),
  );
});

it("keeps independent review roots separate while grouping their replies", async () => {
  const threads = await sourceThreads();
  const roots = threads.flatMap((thread) => {
    const commentRoots = new Set(
      thread.comments.map(({ root_comment_id }) => root_comment_id),
    );
    return [...commentRoots].map((root) => ({
      pull: thread.pull_number,
      root,
    }));
  });
  expect(new Set(roots.map(({ pull, root }) => `${pull}:${root}`)).size).toBe(
    roots.length,
  );
  expect(
    threads.every((thread) =>
      thread.comments.every(
        ({ root_comment_id }) =>
          root_comment_id === Number(thread.id.split(":").at(-1)),
      ),
    ),
  ).toBe(true);
});

it("resolves candidate scopes against real files and parsed functions at Vite HEAD", async () => {
  const report = JSON.parse(
    await readFile(
      "tests/corpus-measurements/vitejs-vite-preparation.json",
      "utf8",
    ),
  );
  expect(report.qualifying_comments).toBe(70);
  expect(report.distinct_pulls).toBe(33);
  expect(report.distinct_authors).toBe(8);
  expect(report.candidate_files).toHaveLength(44);
  expect(report.candidate_functions).toHaveLength(27);
  expect(report.current_head_function_scopes).toBe(26);
  expect(report.historical_function_scopes).toBe(1);
  expect(report.scope_uncertainties).toHaveLength(43);
  expect(report.unresolved_comment_scopes).toEqual([]);
  expect(
    report.threads
      .flatMap(
        (thread: (typeof preparation.threads)[number]) => thread.comments,
      )
      .every(
        (comment: (typeof preparation.threads)[number]["comments"][number]) =>
          comment.url && comment.candidate_file_ids.length > 0,
      ),
  ).toBe(true);
});

it("uses stable content hashes and validates only the extraction envelope", async () => {
  const threads = await sourceThreads();
  const hash = preparationHash(preparation.threads);
  expect(hash).toBe(
    createHash("sha256")
      .update(JSON.stringify(preparation.threads))
      .digest("hex"),
  );
  expect(hash).toBe(preparation.preparation_hash);
  expect(extractionSchema.parse({ decisions: [] })).toEqual({ decisions: [] });
  expect(extractionSchema.safeParse({}).success).toBe(false);
  const cached = await Promise.all(
    threads.map((thread) =>
      cachedValue(
        "vitejs/vite-cache-contract",
        extractionCacheInput(
          {
            number: thread.pull_number,
            title: thread.title,
            body: thread.body,
            comments: thread.comments.map(
              ({ id, body, path, line, created_at, is_bot }) => ({
                id,
                body,
                path,
                line,
                created_at,
                is_bot,
              }),
            ),
          },
          thread.changed_file_paths,
        ),
      ),
    ),
  );
  expect(cached.every((entry) => entry === undefined)).toBe(true);
});
