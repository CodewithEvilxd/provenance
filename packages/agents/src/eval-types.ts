import { z } from "zod";

export const groundTruthItemSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  pr: z.number().int().positive(),
  title: z.string().min(1),
  merged_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  ground_truth_risk: z.enum(["high", "medium", "low"]),
  is_risky: z.boolean(),
  label_source: z.string().min(1),
  label_rationale: z.string().min(1),
});

export type GroundTruthItem = z.infer<typeof groundTruthItemSchema>;

export const evaluationOutcomeSchema = z.object({
  pr: z.number().int().positive(),
  repo: z.string(),
  title: z.string(),
  cutoff_time: z.string(),
  ground_truth_risk: z.enum(["high", "medium", "low"]),
  is_risky: z.boolean(),
  predicted_score: z.number(),
  predicted_band: z.enum(["high", "medium", "low"]),
  predicted_risky: z.boolean(),
  classification: z.enum(["TP", "FP", "TN", "FN"]),
  evidence_status: z.enum(["complete", "insufficient_evidence"]),
  reasons: z.array(z.string()),
});

export type EvaluationOutcome = z.infer<typeof evaluationOutcomeSchema>;

export const evaluationExclusionSchema = z.object({
  pr: z.number().int().positive(),
  repo: z.string(),
  reason: z.string(),
});

export type EvaluationExclusion = z.infer<typeof evaluationExclusionSchema>;

export const evaluationMetricsSchema = z.object({
  tp: z.number().int().nonnegative(),
  fp: z.number().int().nonnegative(),
  tn: z.number().int().nonnegative(),
  fn: z.number().int().nonnegative(),
  precision: z.number().nullable(),
  recall: z.number().nullable(),
  falsePositiveRate: z.number().nullable(),
  f1Score: z.number().nullable(),
  accuracy: z.number().nullable(),
  totalEvaluated: z.number().int().nonnegative(),
  totalExcluded: z.number().int().nonnegative(),
  notes: z.array(z.string()),
});

export type EvaluationMetrics = z.infer<typeof evaluationMetricsSchema>;

export const evaluationReportSchema = z.object({
  run_id: z.string(),
  created_at: z.string(),
  dataset_name: z.string(),
  cutoff_policy: z.string(),
  limitations: z.array(z.string()),
  risk_threshold: z.number(),
  metrics: evaluationMetricsSchema,
  outcomes: z.array(evaluationOutcomeSchema),
  exclusions: z.array(evaluationExclusionSchema),
});

export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
