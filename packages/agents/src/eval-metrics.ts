import type {
  EvaluationExclusion,
  EvaluationMetrics,
  EvaluationOutcome,
} from "./eval-types.js";

function computePrecision(
  tp: number,
  fp: number,
  notes: string[],
): number | null {
  const denominator = tp + fp;
  if (denominator === 0) {
    notes.push(
      "Precision undefined: zero predicted positive items (TP + FP = 0)",
    );
    return null;
  }
  return Number((tp / denominator).toFixed(4));
}

function computeRecall(tp: number, fn: number, notes: string[]): number | null {
  const denominator = tp + fn;
  if (denominator === 0) {
    notes.push(
      "Recall undefined: zero ground-truth positive items (TP + FN = 0)",
    );
    return null;
  }
  return Number((tp / denominator).toFixed(4));
}

function computeFpr(fp: number, tn: number, notes: string[]): number | null {
  const denominator = fp + tn;
  if (denominator === 0) {
    notes.push(
      "False Positive Rate undefined: zero ground-truth negative items (FP + TN = 0)",
    );
    return null;
  }
  return Number((fp / denominator).toFixed(4));
}

function computeF1(
  precision: number | null,
  recall: number | null,
  notes: string[],
): number | null {
  if (precision === null || recall === null) {
    notes.push("F1 score undefined: precision or recall is undefined");
    return null;
  }
  const sum = precision + recall;
  if (sum === 0) {
    notes.push("F1 score undefined: precision + recall = 0");
    return null;
  }
  return Number(((2 * precision * recall) / sum).toFixed(4));
}

export function calculateEvaluationMetrics(
  outcomes: EvaluationOutcome[],
  exclusions: EvaluationExclusion[] | number = [],
): EvaluationMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const outcome of outcomes) {
    if (outcome.classification === "TP") tp += 1;
    else if (outcome.classification === "FP") fp += 1;
    else if (outcome.classification === "TN") tn += 1;
    else if (outcome.classification === "FN") fn += 1;
  }

  const notes: string[] = [];
  const precision = computePrecision(tp, fp, notes);
  const recall = computeRecall(tp, fn, notes);
  const falsePositiveRate = computeFpr(fp, tn, notes);
  const f1Score = computeF1(precision, recall, notes);

  const totalEvaluated = outcomes.length;
  const accuracy =
    totalEvaluated > 0 ? Number(((tp + tn) / totalEvaluated).toFixed(4)) : null;

  return {
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    falsePositiveRate,
    f1Score,
    accuracy,
    totalEvaluated,
    totalExcluded:
      typeof exclusions === "number" ? exclusions : exclusions.length,
    notes,
  };
}
