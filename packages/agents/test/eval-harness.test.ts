import { describe, expect, it } from "vitest";
import {
  HISTORICAL_EVALUATION_DATASET,
  validateGroundTruthDataset,
} from "../src/eval-dataset.js";
import { runHistoricalEvaluation } from "../src/eval-harness.js";
import {
  evaluationReportSchema,
  type GroundTruthItem,
} from "../src/eval-types.js";
import type { ReviewResult } from "../src/reviewer.js";

function buildControlledReview(score: number): ReviewResult {
  return {
    pr: 100,
    evidence_status: "complete",
    missing_evidence: [],
    risk: {
      score,
      band: score >= 60 ? "high" : score >= 30 ? "medium" : "low",
      components: {
        blast: score / 100,
        history: 0,
        decisions: 0,
        familiarity: 0,
        size: 0,
      },
    },
    reasons: [`Risk score calculated at ${score}`],
    changed_functions: ["fn:test#resolve"],
    blast_radius: [],
    incidents: [],
    decisions: [],
    reviewers: [],
    paths: [],
  };
}

describe("Evaluation dataset integrity", () => {
  it("validates all 21 historical PR items with ground-truth labels and cutoffs", () => {
    const validated = validateGroundTruthDataset();
    expect(validated.valid).toBe(true);
    expect(validated.items).toHaveLength(21);

    const riskyItems = validated.items.filter((item) => item.is_risky);
    const normalItems = validated.items.filter((item) => !item.is_risky);

    expect(riskyItems).toHaveLength(10);
    expect(normalItems).toHaveLength(11);

    for (const item of validated.items) {
      expect(item.repo).toBe("vitejs/vite");
      expect(item.pr).toBeGreaterThan(0);
      expect(item.label_source.length).toBeGreaterThan(5);
      expect(item.label_rationale.length).toBeGreaterThan(10);
      expect(Number.isNaN(Date.parse(item.merged_at))).toBe(false);
    }
  });
});

describe("Evaluation harness execution and reproducibility", () => {
  it("produces deterministic classifications with controlled review runner", async () => {
    const controlledDataset: GroundTruthItem[] = [
      {
        pr: 101,
        repo: "vitejs/vite",
        title: "Risky regression fix",
        merged_at: "2026-03-01T10:00:00Z",
        is_risky: true,
        ground_truth_risk: "high",
        label_source: "github_issue_link",
        label_rationale: "Caused subsequent regression",
      },
      {
        pr: 102,
        repo: "vitejs/vite",
        title: "Clean documentation update",
        merged_at: "2026-03-02T11:00:00Z",
        is_risky: false,
        ground_truth_risk: "low",
        label_source: "clean_history",
        label_rationale: "Documentation changes only",
      },
    ];

    const report1 = await runHistoricalEvaluation({
      dataset: controlledDataset,
      riskThreshold: 50,
      reviewRunner: async (_repo, pr) =>
        buildControlledReview(pr === 101 ? 75 : 15),
    });

    const report2 = await runHistoricalEvaluation({
      dataset: controlledDataset,
      riskThreshold: 50,
      reviewRunner: async (_repo, pr) =>
        buildControlledReview(pr === 101 ? 75 : 15),
    });

    expect(report1.metrics).toEqual(report2.metrics);
    expect(report1.metrics.tp).toBe(1);
    expect(report1.metrics.tn).toBe(1);
    expect(report1.metrics.fp).toBe(0);
    expect(report1.metrics.fn).toBe(0);
    expect(report1.metrics.accuracy).toBe(1.0);
    expect(report1.metrics.precision).toBe(1.0);
    expect(report1.metrics.recall).toBe(1.0);
  });

  it("safely excludes records with invalid cutoff timestamps", async () => {
    const datasetWithInvalid: GroundTruthItem[] = [
      {
        pr: 999,
        repo: "vitejs/vite",
        title: "Invalid timestamp PR",
        merged_at: "invalid-timestamp-value",
        is_risky: true,
        ground_truth_risk: "high",
        label_source: "manual",
        label_rationale: "Testing invalid timestamp exclusion",
      },
    ];

    const report = await runHistoricalEvaluation({
      dataset: datasetWithInvalid,
      riskThreshold: 50,
      reviewRunner: async () => buildControlledReview(80),
    });

    expect(report.metrics.totalEvaluated).toBe(0);
    expect(report.metrics.totalExcluded).toBe(1);
    expect(report.exclusions).toHaveLength(1);
    expect(report.exclusions[0]?.reason).toBe("invalid_cutoff_timestamp");
  });

  it("validates output conforms to evaluationReportSchema", async () => {
    const report = await runHistoricalEvaluation({
      dataset: HISTORICAL_EVALUATION_DATASET.slice(0, 3),
      riskThreshold: 50,
      reviewRunner: async () => buildControlledReview(25),
    });

    const parsed = evaluationReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it("defaults to riskThreshold = 30 aligning with the medium risk band boundary", async () => {
    const controlledDataset: GroundTruthItem[] = [
      {
        pr: 105,
        repo: "vitejs/vite",
        title: "Medium risk change",
        merged_at: "2026-03-01T10:00:00Z",
        is_risky: true,
        ground_truth_risk: "medium",
        label_source: "manual",
        label_rationale: "Medium risk",
      },
    ];

    const report = await runHistoricalEvaluation({
      dataset: controlledDataset,
      reviewRunner: async () => buildControlledReview(35),
    });

    expect(report.risk_threshold).toBe(30);
    expect(report.metrics.tp).toBe(1);
    expect(report.outcomes[0]?.predicted_band).toBe("medium");
    expect(report.outcomes[0]?.classification).toBe("TP");
  });
});
