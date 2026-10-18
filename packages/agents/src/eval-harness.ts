import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LlmRouter } from "@provenance/llm/types";
import { reviewPullRequest, type ReviewResult } from "./reviewer.js";
import { HISTORICAL_EVALUATION_DATASET } from "./eval-dataset.js";
import { calculateEvaluationMetrics } from "./eval-metrics.js";
import type {
  EvaluationExclusion,
  EvaluationOutcome,
  EvaluationReport,
  GroundTruthItem,
} from "./eval-types.js";

export type EvaluationOptions = {
  dataset?: GroundTruthItem[] | undefined;
  riskThreshold?: number | undefined;
  graphNamePrefix?: string | undefined;
  router?: LlmRouter | undefined;
  outputPath?: string | undefined;
  reviewRunner?: (
    repo: string,
    pr: number,
    cutoffTime: string,
  ) => Promise<ReviewResult>;
};

function classifyOutcome(
  isRisky: boolean,
  predictedRisky: boolean,
): "TP" | "FP" | "TN" | "FN" {
  if (isRisky && predictedRisky) return "TP";
  if (!isRisky && predictedRisky) return "FP";
  if (!isRisky && !predictedRisky) return "TN";
  return "FN";
}

function createOfflineRouter(): LlmRouter {
  return {
    primaryProvider: "openrouter",
    primaryModel: "offline-eval-model",
    routeFor: () => ({
      provider: "openrouter",
      model: "offline-eval-model",
    }),
    execute: async () => ({
      content: JSON.stringify({ violates: false, evidence: "none" }),
    }),
    routeEvents: [],
  } as unknown as LlmRouter;
}

async function fetchReview(
  item: GroundTruthItem,
  options: EvaluationOptions,
  router: LlmRouter,
): Promise<ReviewResult> {
  if (options.reviewRunner) {
    return options.reviewRunner(item.repo, item.pr, item.merged_at);
  }
  const [owner, name] = item.repo.split("/") as [string, string];
  const graphPrefix = options.graphNamePrefix ?? "repo";
  const graph = `${graphPrefix}:${item.repo}`;
  return reviewPullRequest(
    graph,
    item.repo,
    owner,
    name,
    item.pr,
    router,
    item.merged_at,
  );
}

function buildOutcome(
  item: GroundTruthItem,
  review: ReviewResult,
  threshold: number,
): EvaluationOutcome {
  const predictedRisky = review.risk.score >= threshold;
  return {
    pr: item.pr,
    repo: item.repo,
    title: item.title,
    cutoff_time: item.merged_at,
    ground_truth_risk: item.ground_truth_risk,
    is_risky: item.is_risky,
    predicted_score: review.risk.score,
    predicted_band: review.risk.band,
    predicted_risky: predictedRisky,
    classification: classifyOutcome(item.is_risky, predictedRisky),
    evidence_status: review.evidence_status,
    reasons: review.reasons,
  };
}

async function evaluateSingleItem(
  item: GroundTruthItem,
  threshold: number,
  options: EvaluationOptions,
  router: LlmRouter,
): Promise<{ outcome?: EvaluationOutcome; exclusion?: EvaluationExclusion }> {
  if (Number.isNaN(Date.parse(item.merged_at))) {
    return {
      exclusion: {
        pr: item.pr,
        repo: item.repo,
        reason: "invalid_cutoff_timestamp",
      },
    };
  }

  try {
    const review = await fetchReview(item, options, router);
    return { outcome: buildOutcome(item, review, threshold) };
  } catch (error) {
    return {
      exclusion: {
        pr: item.pr,
        repo: item.repo,
        reason:
          error instanceof Error ? error.message : "Review execution failed",
      },
    };
  }
}

export async function runHistoricalEvaluation(
  options: EvaluationOptions = {},
): Promise<EvaluationReport> {
  const dataset = options.dataset ?? HISTORICAL_EVALUATION_DATASET;
  const threshold = options.riskThreshold ?? 30;
  const router = options.router ?? createOfflineRouter();

  const outcomes: EvaluationOutcome[] = [];
  const exclusions: EvaluationExclusion[] = [];

  for (const item of dataset) {
    const result = await evaluateSingleItem(item, threshold, options, router);
    if (result.outcome) outcomes.push(result.outcome);
    if (result.exclusion) exclusions.push(result.exclusion);
  }

  const metrics = calculateEvaluationMetrics(outcomes, exclusions);
  const report: EvaluationReport = {
    run_id: `eval-${Date.now()}`,
    created_at: new Date().toISOString(),
    dataset_name: "historical-vitejs-eval",
    cutoff_policy: "strict_merge_time_as_of",
    limitations: [
      "Phase 2 LLM decision extraction remains blocked by quota limits; evaluations test graph-grounded change risk",
      "Historical dataset contains 21 verified pull requests from vitejs/vite with documented merge time cutoffs",
      "Call graph relationships reflect static baseline parsing with temporal cutoff filters on incidents and decisions",
    ],
    risk_threshold: threshold,
    metrics,
    outcomes,
    exclusions,
  };

  const outputPath =
    options.outputPath ?? "tests/corpus-measurements/eval-report.json";
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  } catch {
    // preserve report if filesystem write encounters permission constraints
  }

  return report;
}
