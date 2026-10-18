import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import preparation from "../../../tests/corpus-measurements/vitejs-vite-preparation.json" with { type: "json" };
import {
  extractionCacheInput,
  extractDecisions,
  extractThread,
} from "../src/extract.js";
import { cachedValue } from "../src/cache.js";
import { qualifiesComment } from "../src/review-filter.js";

const thread = preparation.threads.find(({ comments }) =>
  comments.some(({ body, is_bot }) => qualifiesComment(body, is_bot)),
)!;
const source = thread.comments.find(({ body, is_bot }) =>
  qualifiesComment(body, is_bot),
)!;
const outsideSourceId = preparation.threads
  .flatMap(({ comments }) => comments)
  .find(({ id }) => id !== source.id)!.id;
const input = {
  number: thread.pull_number,
  title: thread.title,
  body: thread.body,
  comments: thread.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    path: comment.path,
    line: comment.line,
    created_at: comment.created_at,
    is_bot: comment.is_bot,
  })),
};

it("retries one malformed JSON response and validates the corrected output", async () => {
  const responses = ['{"decisions":[null]}', '{"decisions":[]}'];
  let calls = 0;
  const extraction = await extractThread(input, {
    reviewEnabled: false,
    routeEvents: [],
    async complete() {
      calls++;
      return responses.shift()!;
    },
  });
  expect(extraction.decisions).toEqual([]);
  expect(calls).toBe(2);
});

it("skips an uncorrectable real comment thread without caching it and continues", async () => {
  const selected = preparation.threads
    .filter(({ comments }) =>
      comments.some(({ body, is_bot }) => qualifiesComment(body, is_bot)),
    )
    .slice(0, 2);
  const threads = selected.map((item) => ({
    number: item.pull_number,
    title: item.title,
    body: item.body,
    comments: item.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      path: comment.path,
      line: comment.line,
      created_at: comment.created_at,
      is_bot: comment.is_bot,
    })),
  }));
  const repo = `offline/${randomUUID()}`;
  const cacheDirectory = join(
    process.cwd(),
    "data",
    "snapshots",
    repo.replace("/", "__"),
  );
  const report = {
    threadsProcessed: 0,
    skippedThreads: [] as {
      pullNumber: number;
      sourceCommentIds: string[];
      reason: string;
    }[],
    decisionsPassedVerification: 0,
  };
  let calls = 0;
  try {
    await extractDecisions(
      "repo:offline",
      repo,
      threads,
      new Map(),
      false,
      report,
      {
        routerFactory: () => ({
          reviewEnabled: false,
          routeEvents: [],
          async complete() {
            calls++;
            return calls < 3 ? "not JSON" : '{"decisions":[]}';
          },
        }),
      },
    );

    const cachedFirst = await cachedValue(
      repo,
      extractionCacheInput(threads[0]!, []),
    );
    const cachedSecond = await cachedValue(
      repo,
      extractionCacheInput(threads[1]!, []),
    );
    expect(calls).toBe(3);
    expect(cachedFirst).toBeUndefined();
    expect(cachedSecond).toBeDefined();
    expect(report.threadsProcessed).toBe(2);
    expect(report.skippedThreads).toEqual([
      {
        pullNumber: threads[0]!.number,
        sourceCommentIds: threads[0]!.comments
          .filter(({ body, is_bot }) => qualifiesComment(body, is_bot))
          .map(({ id }) => id),
        reason: "invalid_json",
      },
    ]);
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});

it("rejects a source comment ID outside the real thread input", async () => {
  const output = JSON.stringify({
    decisions: [
      {
        summary: "Keep the setting in the existing layer",
        reason:
          "The current review thread explains that this avoids divergent configuration.",
        scope: { files: [], functions: [], free_text: "configuration" },
        strength: "soft",
        source_comment_ids: [outsideSourceId],
        confidence: 0.9,
        supersedes_hint: null,
      },
    ],
  });
  const extraction = await extractThread(input, {
    reviewEnabled: false,
    routeEvents: [],
    async complete() {
      return output;
    },
  });
  expect(input.comments.some(({ id }) => id === outsideSourceId)).toBe(false);
  expect(extraction.decisions).toEqual([]);
});

it("keeps only decisions at or above the documented confidence threshold", async () => {
  const draft = {
    summary: "Keep the setting in the existing layer",
    reason:
      "The current review thread explains that this avoids divergent configuration.",
    scope: { files: [], functions: [], free_text: "configuration" },
    strength: "soft",
    source_comment_ids: [source.id],
    supersedes_hint: null,
  };
  const extraction = await extractThread(input, {
    reviewEnabled: false,
    routeEvents: [],
    async complete() {
      return JSON.stringify({
        decisions: [
          { ...draft, confidence: 0.59 },
          {
            ...draft,
            summary: `${draft.summary} at this layer`,
            confidence: 0.6,
          },
        ],
      });
    },
  });
  expect(extraction.decisions.map(({ confidence }) => confidence)).toEqual([
    0.6,
  ]);
});

it("records an independent disagreement without accepting it as evidence", async () => {
  const output = JSON.stringify({
    decisions: [
      {
        summary: "Keep the setting in the existing layer",
        reason:
          "The current review thread explains that this avoids divergent configuration.",
        scope: { files: [], functions: [], free_text: "configuration" },
        strength: "hard",
        source_comment_ids: [source.id],
        confidence: 0.7,
        supersedes_hint: null,
      },
    ],
  });
  const purposes: string[] = [];
  const extraction = await extractThread(input, {
    reviewEnabled: true,
    reviewProvider: "anthropic",
    routeEvents: [],
    async complete(_prompt, _correction, purpose) {
      purposes.push(purpose ?? "extract");
      return purpose === "review"
        ? '{"agrees":false,"evidence":"The cited comment does not require this constraint."}'
        : output;
    },
  });
  expect(purposes).toEqual(["extract", "review"]);
  expect(extraction.decisions).toHaveLength(1);
  expect(extraction.reviews[0]?.agrees).toBe(false);
  expect(extraction.reviews[0]?.source_comment_ids).toEqual([source.id]);
  expect(extraction.reviews[0]?.provider).toBe("anthropic");
});
