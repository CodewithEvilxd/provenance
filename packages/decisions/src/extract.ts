import { z } from "zod";
import {
  graphStep,
  query,
  type GraphParameters,
} from "../../graph/src/client.js";
import { createLlmRouter } from "../../llm/src/router.js";
import { ProviderFailure, providerCauseDetails } from "../../llm/src/types.js";
import type { LlmRouter } from "../../llm/src/types.js";
import { cachedOutput, cachedValue } from "./cache.js";
import { decisionId } from "./decision-id.js";
import { embedText } from "./embedding.js";
import { decisionReviewPrompt, extractionPrompt } from "./prompt.js";
import { decisionReviewSchema, extractionSchema } from "./schema.js";
import {
  extractionBatchSchema,
  type ExtractionBatch,
} from "./provider-cache.js";
import { verifyDecisionEvidence } from "./scope-resolution.js";
import { supersedes } from "./supersedes.js";
import { completeJson, MalformedModelResponseError } from "./validation.js";
import { qualifiesComment } from "./review-filter.js";

const threshold = 0.6;
type Comment = {
  id: string;
  body: string;
  path: string | null;
  line: number | null;
  created_at: string;
  is_bot: boolean;
};
export type DecisionThread = {
  number: number;
  title: string;
  body: string;
  comments: Comment[];
};
export type ExtractedDecision = z.infer<
  typeof extractionSchema
>["decisions"][number];
type Target = { id: string; path: string; name: string };
export type SkippedThread = {
  pullNumber: number;
  sourceCommentIds: string[];
  reason: string;
};
export type ExtractionRunReport = {
  threadsProcessed: number;
  skippedThreads: SkippedThread[];
  decisionsPassedVerification: number;
};
type ExtractionOptions = {
  routerFactory?: () => LlmRouter;
  useCache?: boolean;
  replayCached?: boolean;
};

export function extractionCacheInput(thread: DecisionThread, files: string[]) {
  return JSON.stringify({ version: 5, thread, files });
}

export function hasEligibleComment(comments: Comment[]) {
  return comments.some((comment) =>
    qualifiesComment(comment.body, comment.is_bot),
  );
}

export async function extractThread(thread: DecisionThread, router: LlmRouter) {
  if (router.reviewEnabled && !router.reviewProvider)
    throw new Error("Second-provider review requires an identified provider");
  const comments = thread.comments.filter((comment) =>
    qualifiesComment(comment.body, comment.is_bot),
  );
  if (!comments.length) return { decisions: [], reviews: [] };
  const input = {
    title: thread.title,
    body: thread.body,
    comments: comments.map(({ id, body, path, line }) => ({
      id,
      body,
      path,
      line,
    })),
  };
  const extracted = await completeJson(
    router,
    extractionPrompt(input),
    extractionSchema,
  );
  const decisions = extracted.decisions.filter(
    (decision) =>
      decision.confidence >= threshold &&
      decision.source_comment_ids.every((id) =>
        comments.some((comment) => comment.id === id),
      ),
  );
  const reviews = router.reviewEnabled
    ? await reviewAmbiguous(router, input, decisions)
    : [];
  return { decisions, reviews };
}

async function reviewAmbiguous(
  router: LlmRouter,
  thread: unknown,
  decisions: ExtractedDecision[],
) {
  const reviews: ExtractionBatch["reviews"] = [];
  for (const decision of decisions) {
    if (!needsReview(decision)) continue;
    const review = await completeJson(
      router,
      decisionReviewPrompt(thread, decision),
      decisionReviewSchema,
      "review",
    );
    reviews.push({
      ...review,
      decision_id: decisionId(decision.summary, decision.source_comment_ids),
      source_comment_ids: decision.source_comment_ids,
      provider: router.lastProvider ?? router.reviewProvider!,
    });
  }
  return reviews;
}

function needsReview(decision: ExtractedDecision) {
  return (
    decision.strength === "hard" ||
    decision.confidence < 0.75 ||
    decision.scope.functions.length > 1 ||
    decision.scope.files.length > 1
  );
}

async function targets(
  graph: string,
  pullFiles: string[],
  scope: ExtractedDecision["scope"],
) {
  const scopedFiles = scope.files.filter((path) => pullFiles.includes(path));
  const functions = await graphStep("resolve scoped functions", () =>
    query<Target>(
      graph,
      "MATCH (fn:Function) WHERE fn.path IN $files RETURN fn.id AS id, fn.path AS path, fn.qualified_name AS name",
      { files: scopedFiles.length ? scopedFiles : pullFiles },
    ),
  );
  const matched = functions.filter((fn) => scope.functions.includes(fn.name));
  if (matched.length)
    return { ids: matched.map(({ id }) => id), fallback: false };
  const files = await graphStep("resolve scoped files", () =>
    query<{ id: string }>(
      graph,
      "MATCH (file:File) WHERE file.path IN $paths RETURN file.id AS id",
      { paths: scopedFiles.length ? scopedFiles : pullFiles },
    ),
  );
  return { ids: files.map(({ id }) => id), fallback: !scopedFiles.length };
}

async function writeDecision(
  graph: string,
  repo: string,
  thread: DecisionThread,
  router: LlmRouter | undefined,
  decision: ExtractedDecision,
  pullFiles: string[],
) {
  const constrained = await targets(graph, pullFiles, decision.scope);
  const evidenceVerified = await verifyDecisionEvidence(
    graph,
    decision.source_comment_ids,
    constrained.ids,
  );
  if (!evidenceVerified) {
    process.stderr.write(
      `${JSON.stringify({
        component: "decision_extraction",
        event: "decision_skipped",
        pullNumber: thread.number,
        sourceCommentIds: decision.source_comment_ids,
        reason: "no_graph_target",
      })}\n`,
    );
    return false;
  }
  const decidedAt = thread.comments
    .filter((comment) => decision.source_comment_ids.includes(comment.id))
    .map((comment) => comment.created_at)
    .sort()
    .at(-1);
  if (!decidedAt) return false;
  const id = decisionId(decision.summary, decision.source_comment_ids);
  const props: GraphParameters = {
    summary: decision.summary,
    reason: decision.reason,
    scope_text: decision.scope.free_text,
    confidence: decision.confidence,
    decided_at: decidedAt,
    status: "active",
    embedding: embedText(`${decision.summary} ${decision.reason}`),
  };
  await graphStep("upsert Decision node", () =>
    query(
      graph,
      "MERGE (decision:Decision {id: $id}) SET decision += $props, decision.embedding = vecf32($props.embedding)",
      { id, props },
    ),
  );
  await graphStep("write DERIVED_FROM edges", () =>
    query(
      graph,
      "UNWIND $sources AS sourceId MATCH (decision:Decision {id: $id}) MATCH (source:Comment {id: sourceId}) MERGE (decision)-[edge:DERIVED_FROM]->(source) SET edge.valid_from = $at, edge.valid_to = null",
      { id, sources: decision.source_comment_ids, at: decidedAt },
    ),
  );
  await graphStep("write CONSTRAINS edges", () =>
    query(
      graph,
      "UNWIND $targets AS targetId MATCH (decision:Decision {id: $id}) MATCH (target {id: targetId}) MERGE (decision)-[edge:CONSTRAINS]->(target) SET edge.strength = $strength, edge.valid_from = $at, edge.valid_to = null",
      {
        id,
        targets: constrained.ids,
        strength: constrained.fallback ? "soft" : decision.strength,
        at: decidedAt,
      },
    ),
  );
  if (router)
    await supersedes(graph, repo, id, router, decision, constrained.ids);
  return true;
}

export async function extractDecisions(
  graph: string,
  repo: string,
  threads: DecisionThread[],
  threadFiles: Map<number, string[]>,
  cacheOnly = false,
  report: ExtractionRunReport = {
    threadsProcessed: 0,
    skippedThreads: [],
    decisionsPassedVerification: 0,
  },
  options: ExtractionOptions = {},
) {
  let router: LlmRouter | undefined;
  for (const thread of threads) {
    if (!hasEligibleComment(thread.comments)) continue;
    report.threadsProcessed++;
    const sourceCommentIds = thread.comments
      .filter((comment) => qualifiesComment(comment.body, comment.is_bot))
      .map((comment) => comment.id);
    const files = threadFiles.get(thread.number) ?? [];
    const content = extractionCacheInput(thread, files);
    let extractedBatch: ExtractionBatch | undefined;
    try {
      const request = async () => {
        router ??= options.routerFactory?.() ?? createLlmRouter();
        const eventOffset = router.routeEvents.length;
        try {
          const extracted = await extractThread(thread, router);
          return {
            ...extracted,
            routeEvents: router.routeEvents.slice(eventOffset),
          };
        } catch (error) {
          process.stderr.write(
            `${JSON.stringify({
              component: "llm",
              event: "extraction_failed",
              routeEvents: router.routeEvents.slice(eventOffset),
              ...(error instanceof ProviderFailure
                ? {
                    provider: error.provider,
                    kind: error.kind,
                    httpStatus: error.status,
                    ...providerCauseDetails(error.cause),
                  }
                : {}),
            })}\n`,
          );
          throw error;
        }
      };
      extractedBatch =
        cacheOnly || options.replayCached
          ? await cachedValue<ExtractionBatch>(repo, content)
          : options.useCache === false
            ? await request()
            : await cachedOutput(repo, content, request);
    } catch (error) {
      if (isSkippableThreadFailure(error)) {
        const reason =
          error instanceof MalformedModelResponseError
            ? error.reason
            : `provider_${error.kind}`;
        report.skippedThreads.push({
          pullNumber: thread.number,
          sourceCommentIds,
          reason,
        });
        process.stderr.write(
          `${JSON.stringify({
            component: "llm",
            event: "thread_skipped",
            pullNumber: thread.number,
            sourceCommentIds,
            reason,
          })}\n`,
        );
        continue;
      }
      throw error;
    }
    if (!extractedBatch) {
      if (cacheOnly || options.replayCached)
        report.skippedThreads.push({
          pullNumber: thread.number,
          sourceCommentIds,
          reason: "no_cached_response",
        });
      continue;
    }
    const validated = extractionBatchSchema.parse(extractedBatch).decisions;
    if (cacheOnly) {
      continue;
    }
    for (const decision of validated)
      if (await writeDecision(graph, repo, thread, router, decision, files))
        report.decisionsPassedVerification++;
  }
  return report;
}

function isSkippableThreadFailure(
  error: unknown,
): error is ProviderFailure | MalformedModelResponseError {
  if (error instanceof MalformedModelResponseError) return true;
  return (
    error instanceof ProviderFailure &&
    ["transient", "rate_limit", "malformed"].includes(error.kind)
  );
}
