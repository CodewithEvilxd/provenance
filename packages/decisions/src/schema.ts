import { z } from "zod";

export const extractionSchema = z.object({
  decisions: z.array(
    z.object({
      summary: z.string().trim().min(1),
      reason: z.string().trim().min(1),
      scope: z.object({
        files: z.array(z.string()),
        functions: z.array(z.string()),
        free_text: z.string(),
      }),
      strength: z.enum(["hard", "soft"]),
      source_comment_ids: z
        .array(z.string())
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length),
      confidence: z.number().min(0).max(1),
      supersedes_hint: z.string().nullable(),
    }),
  ),
});

export const supersessionSchema = z.object({
  replaces: z.boolean(),
  evidence: z.string().trim().min(1),
});

export const decisionReviewSchema = z.object({
  agrees: z.boolean(),
  evidence: z.string().trim().min(1),
});
