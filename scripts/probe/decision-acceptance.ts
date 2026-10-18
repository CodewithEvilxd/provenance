import { closeGraphClient, query } from "../../packages/graph/src/client.js";
import { decisionId } from "../../packages/decisions/src/decision-id.js";
import { extractionCacheInput } from "../../packages/decisions/src/extract.js";
import { cachedValue } from "../../packages/decisions/src/cache.js";
import { embedText } from "../../packages/decisions/src/embedding.js";
import vitePreparation from "../../tests/corpus-measurements/vitejs-vite-preparation.json" with { type: "json" };
import nextPreparation from "../../tests/corpus-measurements/vercel-nextjs-preparation.json" with { type: "json" };

const repository =
  process.argv
    .slice(2)
    .find((argument) => /^[\w.-]+\/[\w.-]+$/.test(argument)) ??
  vitePreparation.repository;
const preparation =
  repository === vitePreparation.repository
    ? vitePreparation
    : repository === nextPreparation.repository
      ? nextPreparation
      : undefined;
if (!preparation)
  throw new Error(`No saved preparation manifest for ${repository}`);
const graph = process.env.PROVENANCE_GRAPH ?? `repo:${repository}`;
const eligibleSources = new Set(
  preparation.threads.flatMap((thread) =>
    thread.comments.map((comment) => comment.id),
  ),
);

try {
  const decisions = await query<{
    id: string;
    summary: string;
    reason: string;
    confidence: number;
    embeddingMissing: boolean;
    sourceIds: string[];
  }>(
    graph,
    "MATCH (decision:Decision) OPTIONAL MATCH (decision)-[:DERIVED_FROM]->(source:Comment) WITH decision, collect(source.id) AS sourceIds RETURN decision.id AS id, decision.summary AS summary, decision.reason AS reason, decision.confidence AS confidence, decision.embedding IS NULL AS embeddingMissing, sourceIds",
  );
  const targets = await query<{
    decisionId: string;
    targetId: string;
    labels: string[];
  }>(
    graph,
    "MATCH (decision:Decision)-[:CONSTRAINS]->(target) RETURN decision.id AS decisionId, target.id AS targetId, labels(target) AS labels",
  );
  const missingTargetDecisions = await query<{ id: string }>(
    graph,
    "MATCH (decision:Decision) WHERE NOT (decision)-[:CONSTRAINS]->(:File) AND NOT (decision)-[:CONSTRAINS]->(:Function) RETURN decision.id AS id",
  );
  const cachingMatches = await query<{
    id: string;
    summary: string;
    score: number;
  }>(
    graph,
    "CALL db.idx.vector.queryNodes('Decision', 'embedding', 10, vecf32($embedding)) YIELD node, score RETURN node.id AS id, node.summary AS summary, score ORDER BY score DESC",
    { embedding: embedText("caching") },
  );
  const cacheRelatedDecisions = await query<{
    id: string;
    summary: string;
  }>(
    graph,
    "MATCH (decision:Decision) WHERE toLower(decision.summary + ' ' + decision.reason) CONTAINS 'cach' RETURN decision.id AS id, decision.summary AS summary ORDER BY decision.id",
  );
  const cacheRelatedDecisionIds = new Set(
    cacheRelatedDecisions.map(({ id }) => id),
  );
  const relevantCachingMatches = cachingMatches.filter(({ id }) =>
    cacheRelatedDecisionIds.has(id),
  );
  const checked = decisions.map((decision) => ({
    ...decision,
    expectedId: decisionId(decision.summary, decision.sourceIds),
  }));
  const sourceIds = [...new Set(checked.flatMap(({ sourceIds }) => sourceIds))];
  const missingCorpusSources = sourceIds.filter(
    (id) => !eligibleSources.has(id),
  );
  const missingSourceDecisions = checked.filter(
    ({ sourceIds }) => sourceIds.length === 0,
  );
  const invalidSourceDecisions = checked.filter(({ sourceIds }) =>
    sourceIds.some((id) => !eligibleSources.has(id)),
  );
  const nonDeterministicIds = checked.filter(
    ({ id, expectedId }) => id !== expectedId,
  );
  const missingEmbeddings = checked.filter(
    ({ embeddingMissing }) => embeddingMissing,
  );
  const invalidTargetDecisions = targets.filter(
    ({ labels }) =>
      !labels.some((label) => label === "File" || label === "Function"),
  );
  const targetDecisionIds = new Set(
    targets.map(({ decisionId }) => decisionId),
  );
  const duplicateDecisionIds =
    checked.length - new Set(checked.map(({ id }) => id)).size;
  const cachedDecisionIds = new Set<string>();
  let threadsWithCachedResponses = 0;
  for (const thread of preparation.threads) {
    const extractionThread = {
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
    };
    const batch = await cachedValue<{
      decisions?: Array<{ summary: string; source_comment_ids: string[] }>;
    }>(
      repository,
      extractionCacheInput(extractionThread, thread.changed_file_paths),
    );
    if (!batch) continue;
    threadsWithCachedResponses++;
    for (const decision of batch.decisions ?? [])
      cachedDecisionIds.add(
        decisionId(decision.summary, decision.source_comment_ids),
      );
  }
  const decisionsMissingFromModelCache = checked
    .filter(({ id }) => !cachedDecisionIds.has(id))
    .map(({ id }) => id);
  const freshDecisions = checked
    .filter(({ id }) => cachedDecisionIds.has(id))
    .map(({ id, summary, reason, confidence, sourceIds }) => ({
      id,
      summary,
      reason,
      confidence,
      sourceIds,
    }));
  process.stdout.write(
    `${JSON.stringify({
      graph,
      repository,
      decisionNodes: checked.length,
      uniqueDecisionIds: checked.length - duplicateDecisionIds,
      sourceEdges: checked.reduce(
        (sum, decision) => sum + decision.sourceIds.length,
        0,
      ),
      distinctSourceComments: sourceIds.length,
      threadsWithCachedModelResponses: threadsWithCachedResponses,
      decisionsMatchedToCachedModelResponses:
        checked.length - decisionsMissingFromModelCache.length,
      freshDecisions,
      qualifyingCorpusComments: eligibleSources.size,
      decisionsWithSource: checked.length - missingSourceDecisions.length,
      decisionsWithFileOrFunctionTarget:
        targetDecisionIds.size - invalidTargetDecisions.length,
      targetEdges: targets.length,
      cachingVectorMatches: cachingMatches.length,
      cachingMatches,
      cacheRelatedDecisions,
      relevantCachingMatches: relevantCachingMatches.length,
      missingCorpusSources,
      missingSourceDecisions: missingSourceDecisions.map(({ id }) => id),
      invalidSourceDecisions: invalidSourceDecisions.map(({ id }) => id),
      nonDeterministicIds: nonDeterministicIds.map(({ id, expectedId }) => ({
        id,
        expectedId,
      })),
      missingEmbeddings: missingEmbeddings.map(({ id }) => id),
      decisionsWithoutFileOrFunctionTarget: missingTargetDecisions.map(
        ({ id }) => id,
      ),
      invalidTargets: invalidTargetDecisions,
      decisionsMissingFromModelCache,
      acceptance:
        checked.length >= 30 &&
        missingSourceDecisions.length === 0 &&
        invalidSourceDecisions.length === 0 &&
        nonDeterministicIds.length === 0 &&
        missingEmbeddings.length === 0 &&
        relevantCachingMatches.length > 0 &&
        missingTargetDecisions.length === 0 &&
        decisionsMissingFromModelCache.length === 0 &&
        invalidTargetDecisions.length === 0,
    })}\n`,
  );
} finally {
  await closeGraphClient();
}
