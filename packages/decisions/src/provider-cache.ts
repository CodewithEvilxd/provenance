import { z } from "zod";
import { decisionReviewSchema, extractionSchema } from "./schema.js";

const providerName = z.enum(["openai", "gemini", "anthropic", "openrouter"]);
const routeEvent = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("selected"),
    provider: providerName,
    purpose: z.enum(["extract", "review", "decision_check"]),
  }),
  z.object({
    event: z.literal("failed"),
    provider: providerName,
    purpose: z.enum(["extract", "review", "decision_check"]),
    kind: z.enum([
      "invalid_key",
      "rate_limit",
      "quota",
      "transient",
      "malformed",
      "unsupported",
    ]),
    status: z.number().optional(),
    providerMessage: z.string().optional(),
    retryAfter: z.string().optional(),
    rateLimitWindow: z.enum(["minute", "day"]).optional(),
  }),
  z.object({
    event: z.literal("fallback"),
    from: providerName,
    to: providerName,
    purpose: z.enum(["extract", "review", "decision_check"]),
    kind: z.enum([
      "invalid_key",
      "rate_limit",
      "quota",
      "transient",
      "malformed",
      "unsupported",
    ]),
    status: z.number().optional(),
    providerMessage: z.string().optional(),
    retryAfter: z.string().optional(),
    rateLimitWindow: z.enum(["minute", "day"]).optional(),
  }),
  z.object({
    event: z.literal("rate_limit"),
    provider: z.literal("gemini"),
    purpose: z.enum(["extract", "review", "decision_check"]),
    status: z.number(),
    attempt: z.number(),
    retrying: z.boolean(),
    providerMessage: z.string().max(300),
    retryAfter: z.string().optional(),
    rateLimitWindow: z.enum(["minute", "day"]).optional(),
  }),
  z.object({
    event: z.literal("retry"),
    provider: z.literal("gemini"),
    purpose: z.enum(["extract", "review", "decision_check"]),
    status: z.number(),
    attempt: z.number(),
    retrying: z.boolean(),
    providerMessage: z.string().max(300),
  }),
]);

export const extractionBatchSchema = z.object({
  decisions: extractionSchema.shape.decisions,
  reviews: z.array(
    decisionReviewSchema.extend({
      decision_id: z.string(),
      source_comment_ids: z.array(z.string()),
      provider: z.string(),
    }),
  ),
  routeEvents: z.array(routeEvent),
});

export type ExtractionBatch = z.infer<typeof extractionBatchSchema>;
