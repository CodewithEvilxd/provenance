import { describe, expect, it } from "vitest";
import { calculateEvaluationMetrics } from "../src/eval-metrics.js";
import type { EvaluationOutcome } from "../src/eval-types.js";

function makeOutcome(
  pr: number,
  isRisky: boolean,
  predictedRisky: boolean,
  score = 25,
): EvaluationOutcome {
  const classification = isRisky
    ? predictedRisky
      ? "TP"
      : "FN"
    : predictedRisky
      ? "FP"
      : "TN";
  return {
    pr,
    repo: "test/repo",
    title: `PR ${pr}`,
    cutoff_time: "2026-03-01T00:00:00Z",
    ground_truth_risk: isRisky ? "high" : "low",
    is_risky: isRisky,
    predicted_score: score,
    predicted_band: predictedRisky ? "high" : "low",
    predicted_risky: predictedRisky,
    classification,
    evidence_status: "complete",
    reasons: ["Callers count"],
  };
}

describe("Evaluation metrics calculations", () => {
  it("calculates exact metrics for standard confusion matrix", () => {
    const outcomes: EvaluationOutcome[] = [
      makeOutcome(1, true, true), // TP
      makeOutcome(2, true, true), // TP
      makeOutcome(3, true, false), // FN
      makeOutcome(4, false, true), // FP
      makeOutcome(5, false, false), // TN
      makeOutcome(6, false, false), // TN
      makeOutcome(7, false, false), // TN
      makeOutcome(8, false, false), // TN
    ];

    const metrics = calculateEvaluationMetrics(outcomes, 0);

    expect(metrics.tp).toBe(2);
    expect(metrics.fp).toBe(1);
    expect(metrics.fn).toBe(1);
    expect(metrics.tn).toBe(4);
    expect(metrics.totalEvaluated).toBe(8);
    expect(metrics.totalExcluded).toBe(0);

    // Precision = 2 / (2 + 1) = 2/3 = 0.6667
    expect(metrics.precision).toBeCloseTo(0.6667, 3);
    // Recall = 2 / (2 + 1) = 2/3 = 0.6667
    expect(metrics.recall).toBeCloseTo(0.6667, 3);
    // FPR = 1 / (1 + 4) = 1/5 = 0.2000
    expect(metrics.falsePositiveRate).toBeCloseTo(0.2, 3);
    // F1 = 2 * (2/3 * 2/3) / (4/3) = 2/3 = 0.6667
    expect(metrics.f1Score).toBeCloseTo(0.6667, 3);
    // Accuracy = (2 + 4) / 8 = 6/8 = 0.7500
    expect(metrics.accuracy).toBeCloseTo(0.75, 3);
    expect(metrics.notes).toHaveLength(0);
  });

  it("handles zero positive predictions without division by zero", () => {
    const outcomes: EvaluationOutcome[] = [
      makeOutcome(1, true, false), // FN
      makeOutcome(2, true, false), // FN
      makeOutcome(3, false, false), // TN
      makeOutcome(4, false, false), // TN
    ];

    const metrics = calculateEvaluationMetrics(outcomes, 1);

    expect(metrics.tp).toBe(0);
    expect(metrics.fp).toBe(0);
    expect(metrics.fn).toBe(2);
    expect(metrics.tn).toBe(2);
    expect(metrics.precision).toBeNull();
    expect(metrics.f1Score).toBeNull();
    expect(metrics.recall).toBe(0);
    expect(metrics.falsePositiveRate).toBe(0);
    expect(metrics.accuracy).toBe(0.5);
    expect(metrics.totalExcluded).toBe(1);
    expect(metrics.notes.some((n) => n.includes("Precision undefined"))).toBe(
      true,
    );
  });

  it("handles zero actual positives without division by zero", () => {
    const outcomes: EvaluationOutcome[] = [
      makeOutcome(1, false, true), // FP
      makeOutcome(2, false, false), // TN
    ];

    const metrics = calculateEvaluationMetrics(outcomes, 0);

    expect(metrics.tp).toBe(0);
    expect(metrics.fn).toBe(0);
    expect(metrics.recall).toBeNull();
    expect(metrics.precision).toBe(0);
    expect(metrics.f1Score).toBeNull();
    expect(metrics.notes.some((n) => n.includes("Recall undefined"))).toBe(
      true,
    );
  });

  it("handles empty outcomes dataset", () => {
    const metrics = calculateEvaluationMetrics([], 3);

    expect(metrics.tp).toBe(0);
    expect(metrics.fp).toBe(0);
    expect(metrics.tn).toBe(0);
    expect(metrics.fn).toBe(0);
    expect(metrics.precision).toBeNull();
    expect(metrics.recall).toBeNull();
    expect(metrics.falsePositiveRate).toBeNull();
    expect(metrics.f1Score).toBeNull();
    expect(metrics.accuracy).toBeNull();
    expect(metrics.totalEvaluated).toBe(0);
    expect(metrics.totalExcluded).toBe(3);
    expect(metrics.notes.length).toBeGreaterThan(0);
  });
});
