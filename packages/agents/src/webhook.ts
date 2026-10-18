import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@provenance/graph/client";
import { createLlmRouter } from "@provenance/llm/router";
import { formatReviewComment, publishOrUpdateComment } from "./comment.js";
import { reviewPullRequest, type ReviewResult } from "./reviewer.js";
import { claimWebhookTask, updateTaskState } from "./state.js";
import {
  parsePullRequestPayload,
  pullRequestPayloadSchema,
  sanitizeSecret,
  supportedPullRequestActions,
  type PullRequestPayload,
  type WebhookHandlerOptions,
  type WebhookProcessOutcome,
} from "./webhook-types.js";

export {
  parsePullRequestPayload,
  pullRequestPayloadSchema,
  sanitizeSecret,
  supportedPullRequestActions,
  type PullRequestPayload,
  type WebhookHandlerOptions,
  type WebhookProcessOutcome,
};

const signaturePattern = /^sha256=[0-9a-f]{64}$/;

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!signatureHeader || !secret) return false;
  if (!signaturePattern.test(signatureHeader)) return false;
  const providedSignature = signatureHeader.slice(7);
  const calculatedSignature = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const providedBuffer = Buffer.from(providedSignature, "hex");
  const calculatedBuffer = Buffer.from(calculatedSignature, "hex");
  if (providedBuffer.length !== 32 || calculatedBuffer.length !== 32) {
    return false;
  }
  return timingSafeEqual(providedBuffer, calculatedBuffer);
}

export async function refreshPullRequestMetadata(
  graph: string,
  repo: string,
  payload: PullRequestPayload,
): Promise<void> {
  const pr = payload.pull_request;
  const prId = `pr:${repo}#${pr.number}`;
  const authorLogin = pr.user?.login ?? "ghost";
  const personId = `person:${authorLogin}`;

  await query(
    graph,
    "MERGE (p:Person {id: $personId}) ON CREATE SET p.login = $authorLogin MERGE (pr:PR {id: $prId}) SET pr.number = $number, pr.title = $title, pr.state = $state, pr.head_sha = $headSha, pr.repo = $repo MERGE (p)-[:AUTHORED]->(pr)",
    {
      personId,
      authorLogin,
      prId,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      headSha: pr.head.sha,
      repo,
    },
  );
}

async function dispatchReviewComment(
  payload: PullRequestPayload,
  review: ReviewResult,
  options: WebhookHandlerOptions,
): Promise<{ id: number; action: "created" | "updated" } | undefined> {
  const shouldPublish =
    options.publishComment ??
    (process.env.NODE_ENV !== "test" &&
      process.env.ENABLE_PR_COMMENTS === "true");
  if (!shouldPublish) return undefined;
  const repo = payload.repository.full_name;
  const prNumber = payload.pull_request.number;
  const markdown = formatReviewComment(review, repo, prNumber);
  const publisher = options.commentPublisher ?? publishOrUpdateComment;
  return publisher({
    owner: payload.repository.owner.login,
    name: payload.repository.name,
    pr: prNumber,
    body: markdown,
    token: options.token ?? process.env.GITHUB_TOKEN,
  });
}

async function executeWebhookReview(
  payload: PullRequestPayload,
  graph: string,
  options: WebhookHandlerOptions,
): Promise<ReviewResult> {
  const router = (options.routerFactory ?? createLlmRouter)();
  const runReview = options.reviewRunner ?? reviewPullRequest;
  return runReview(
    graph,
    payload.repository.full_name,
    payload.repository.owner.login,
    payload.repository.name,
    payload.pull_request.number,
    router,
  );
}

async function finalizeWebhookTask(
  taskId: string,
  review: ReviewResult,
  commentPublished: boolean,
): Promise<void> {
  await updateTaskState(taskId, {
    status: "done",
    completedSteps: [
      "Verified webhook delivery",
      "Refreshed PR metadata in graph",
      "Evaluated change risk against decisions and incidents",
      commentPublished
        ? "Published PR review comment"
        : "Skipped comment publication",
    ],
    artifact: {
      kind: "review_summary",
      ref: `risk:${review.risk.score}:${review.evidence_status}`,
    },
  });
}

async function handleWebhookFailure(
  taskId: string,
  error: unknown,
  options: WebhookHandlerOptions,
): Promise<never> {
  const message = sanitizeSecret(
    error instanceof Error ? error.message : "Webhook processing failed",
    [
      options.secret,
      options.token,
      process.env.GITHUB_TOKEN,
      process.env.GITHUB_WEBHOOK_SECRET,
    ],
  );
  try {
    await updateTaskState(taskId, { status: "failed", error: message });
  } catch {
    // preserve original sanitized error if task update fails
  }
  throw new Error(message);
}

function rejectionReason(status: string): string {
  if (status === "done") return "Webhook event already processed";
  if (status === "running") return "Webhook event is currently processing";
  return `Task status is ${status}`;
}

export async function processPullRequestWebhook(
  payload: PullRequestPayload,
  deliveryId: string,
  options: WebhookHandlerOptions = {},
): Promise<WebhookProcessOutcome> {
  const isSupported = (
    supportedPullRequestActions as readonly string[]
  ).includes(payload.action);
  if (!isSupported) {
    return {
      status: "ignored",
      reason: `Unsupported pull_request action: ${payload.action}`,
    };
  }

  const repo = payload.repository.full_name;
  const prNumber = payload.pull_request.number;
  const taskId = `task:webhook:${repo}:${prNumber}:${payload.pull_request.head.sha}`;

  const claim = await claimWebhookTask({
    id: taskId,
    repo,
    scope: `pr:${prNumber}`,
    remainingWork: "Execute review and publish findings",
  });

  if (!claim.acquired) {
    return {
      status: "already_processed",
      taskId,
      reason: rejectionReason(claim.status),
    };
  }

  const graph = options.graphNamePrefix
    ? `${options.graphNamePrefix}:${repo}`
    : (process.env.PROVENANCE_GRAPH ?? `repo:${repo}`);

  try {
    const refresh = options.metadataRefresher ?? refreshPullRequestMetadata;
    await refresh(graph, repo, payload);
    await updateTaskState(taskId, {
      completedSteps: [
        "Verified webhook delivery",
        "Refreshed PR metadata in graph",
      ],
    });
    const review = await executeWebhookReview(payload, graph, options);
    const comment = await dispatchReviewComment(payload, review, options);
    await finalizeWebhookTask(taskId, review, Boolean(comment));
    return { status: "ok", taskId, review, comment };
  } catch (error) {
    return handleWebhookFailure(taskId, error, options);
  }
}

function validateWebhookRequest(
  rawBody: string,
  event: string | null,
  signature: string | null,
  secret?: string | undefined,
): Response | null {
  if (!secret) {
    return Response.json(
      { error: "Webhook secret is not configured" },
      { status: 500 },
    );
  }
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return Response.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }
  if (event === "ping") {
    return Response.json({ status: "ok", message: "pong" });
  }
  if (event !== "pull_request") {
    return Response.json({
      status: "ignored",
      reason: `Unsupported event: ${event}`,
    });
  }
  return null;
}

export function createWebhookHandler(options: WebhookHandlerOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const rawBody = await request.text();
    const event = request.headers.get("x-github-event");
    const signature = request.headers.get("x-hub-signature-256");
    const delivery =
      request.headers.get("x-github-delivery") ?? `delivery:${Date.now()}`;
    const secret = options.secret ?? process.env.GITHUB_WEBHOOK_SECRET;

    const precheck = validateWebhookRequest(rawBody, event, signature, secret);
    if (precheck) return precheck;

    const { payload, errorResponse } = parsePullRequestPayload(rawBody);
    if (errorResponse || !payload) return errorResponse!;

    try {
      const outcome = await processPullRequestWebhook(
        payload,
        delivery,
        options,
      );
      return Response.json(outcome);
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "Webhook processing failed";
      const message = sanitizeSecret(raw, [
        secret,
        options.token,
        process.env.GITHUB_TOKEN,
      ]);
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
