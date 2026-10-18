import { z } from "zod";
import type { LlmRouter } from "@provenance/llm/types";
import type { publishOrUpdateComment } from "./comment.js";
import type { ReviewResult } from "./reviewer.js";

export const supportedPullRequestActions = [
  "opened",
  "reopened",
  "synchronize",
  "ready_for_review",
] as const;

export const pullRequestPayloadSchema = z.object({
  action: z.string(),
  number: z.number().int().positive(),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    state: z.string(),
    html_url: z.string().optional(),
    user: z.object({ login: z.string() }).nullable().optional(),
    head: z.object({ sha: z.string(), ref: z.string() }),
    base: z.object({ ref: z.string() }),
  }),
  repository: z.object({
    full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    name: z.string(),
    owner: z.object({ login: z.string() }),
    html_url: z.string().optional(),
  }),
});

export type PullRequestPayload = z.infer<typeof pullRequestPayloadSchema>;

export type ReviewRunner = (
  graph: string,
  repo: string,
  owner: string,
  name: string,
  pr: number,
  router: LlmRouter,
) => Promise<ReviewResult>;

export type MetadataRefresher = (
  graph: string,
  repo: string,
  payload: PullRequestPayload,
) => Promise<void>;

export type WebhookHandlerOptions = {
  secret?: string | undefined;
  token?: string | undefined;
  publishComment?: boolean | undefined;
  graphNamePrefix?: string | undefined;
  routerFactory?: (() => LlmRouter) | undefined;
  reviewRunner?: ReviewRunner | undefined;
  commentPublisher?: typeof publishOrUpdateComment | undefined;
  metadataRefresher?: MetadataRefresher | undefined;
};

export type WebhookProcessOutcome = {
  status: "ok" | "ignored" | "already_processed";
  taskId?: string | undefined;
  reason?: string | undefined;
  review?: ReviewResult | undefined;
  comment?: { id: number; action: "created" | "updated" } | undefined;
};

export function sanitizeSecret(
  message: string,
  secrets: (string | undefined)[] = [],
): string {
  let cleaned = message;
  for (const secret of secrets) {
    if (secret && secret.length > 4) {
      cleaned = cleaned.replaceAll(secret, "[REDACTED]");
    }
  }
  return cleaned.replace(
    /(ghp_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{50,}|Bearer\s+[a-zA-Z0-9._-]+|whsec_[a-zA-Z0-9_]{16,})/gi,
    "[REDACTED]",
  );
}

export function parsePullRequestPayload(rawBody: string): {
  payload?: PullRequestPayload | undefined;
  errorResponse?: Response | undefined;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      errorResponse: Response.json(
        { error: "Malformed JSON payload" },
        { status: 400 },
      ),
    };
  }
  const outcome = pullRequestPayloadSchema.safeParse(parsed);
  if (!outcome.success) {
    return {
      errorResponse: Response.json(
        {
          error: "Invalid pull_request payload schema",
          issues: outcome.error.issues,
        },
        { status: 400 },
      ),
    };
  }
  return { payload: outcome.data };
}
