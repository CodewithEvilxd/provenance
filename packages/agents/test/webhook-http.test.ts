import { describe, expect, it } from "vitest";
import { formatReviewComment, publishOrUpdateComment } from "../src/comment.js";
import {
  createWebhookHandler,
  verifyWebhookSignature,
} from "../src/webhook.js";
import {
  buildTestReview,
  computeSignature,
  testWebhookSecret as testSecret,
} from "./webhook-test-helpers.js";

describe("Webhook signature verification", () => {
  it("verifies valid HMAC signatures with correct secret", () => {
    const rawBody = JSON.stringify({ ping: true });
    const signature = computeSignature(rawBody, testSecret);
    expect(verifyWebhookSignature(rawBody, signature, testSecret)).toBe(true);
  });

  it("rejects invalid or tampered signatures", () => {
    const rawBody = JSON.stringify({ ping: true });
    const tampered = computeSignature(rawBody, "wrong-secret");
    expect(verifyWebhookSignature(rawBody, tampered, testSecret)).toBe(false);
    expect(verifyWebhookSignature(rawBody, "invalid-format", testSecret)).toBe(
      false,
    );
  });

  it("rejects missing signature or missing secret", () => {
    const rawBody = JSON.stringify({ ping: true });
    expect(verifyWebhookSignature(rawBody, null, testSecret)).toBe(false);
    expect(verifyWebhookSignature(rawBody, undefined, testSecret)).toBe(false);
    expect(verifyWebhookSignature(rawBody, "sha256=123", undefined)).toBe(
      false,
    );
  });

  it("rejects malformed signature headers, non-hex, bad lengths, and trailing chars", () => {
    const rawBody = JSON.stringify({ ping: true });
    const validSig = computeSignature(rawBody, testSecret);
    const validHex = validSig.slice(7);

    expect(
      verifyWebhookSignature(rawBody, `sha256=${"g".repeat(64)}`, testSecret),
    ).toBe(false);
    expect(
      verifyWebhookSignature(rawBody, `sha256=${"a".repeat(63)}`, testSecret),
    ).toBe(false);
    expect(
      verifyWebhookSignature(rawBody, `sha256=${"a".repeat(65)}`, testSecret),
    ).toBe(false);
    expect(
      verifyWebhookSignature(
        rawBody,
        `sha256=${validHex.toUpperCase()}`,
        testSecret,
      ),
    ).toBe(false);
    expect(
      verifyWebhookSignature(rawBody, `${validSig}extra`, testSecret),
    ).toBe(false);
    expect(
      verifyWebhookSignature(rawBody, `sha512=${validHex}`, testSecret),
    ).toBe(false);
    expect(
      verifyWebhookSignature(rawBody, `sha256:${validHex}`, testSecret),
    ).toBe(false);
    expect(
      verifyWebhookSignature('{"tampered":true}', validSig, testSecret),
    ).toBe(false);
  });
});

describe("Comment formatting and evidence warning", () => {
  it("formats review comment with warning when evidence is incomplete", () => {
    const review = buildTestReview("insufficient_evidence");
    const comment = formatReviewComment(review, "vercel/next.js", 101);
    expect(comment).toContain("## Provenance Pull Request Review");
    expect(comment).toContain("**75/100 (HIGH)**");
    expect(comment).toContain(
      "Evidence status: Incomplete (active decisions, blast radius)",
    );
    expect(comment).toContain(
      "Incomplete evidence must not be treated as proof of safety",
    );
    expect(comment).toContain("<!-- provenance-review -->");
  });

  it("formats review comment with complete status notice when verified", () => {
    const review = buildTestReview("complete");
    const comment = formatReviewComment(review, "vercel/next.js", 101);
    expect(comment).toContain("Evidence status: Complete");
    expect(comment).toContain("Verified Evidence Paths");
    expect(comment).toContain("[blast] renderToHTML -> next-server.ts");
  });
});

describe("Comment publication and update idempotency", () => {
  it("creates new comment when no previous review comment exists", async () => {
    const createdCalls: Array<{ body: string }> = [];
    const simulatedClient = {
      issues: {
        listComments: async () => ({ data: [] }),
        createComment: async (args: { body: string }) => {
          createdCalls.push(args);
          return { data: { id: 77101 } };
        },
        updateComment: async () => ({ data: { id: 77101 } }),
      },
    };

    const result = await publishOrUpdateComment({
      owner: "vercel",
      name: "next.js",
      pr: 101,
      body: "Initial review content <!-- provenance-review -->",
      octokitClient:
        simulatedClient as unknown as import("@octokit/rest").Octokit,
    });

    expect(result).toEqual({ id: 77101, action: "created" });
    expect(createdCalls).toHaveLength(1);
  });

  it("updates existing review comment instead of creating duplicate", async () => {
    const updatedCalls: Array<{ comment_id: number; body: string }> = [];
    const simulatedClient = {
      issues: {
        listComments: async () => ({
          data: [
            { id: 44101, body: "Older comment by team" },
            { id: 44102, body: "Previous review <!-- provenance-review -->" },
          ],
        }),
        createComment: async () => ({ data: { id: 99999 } }),
        updateComment: async (args: { comment_id: number; body: string }) => {
          updatedCalls.push(args);
          return { data: { id: args.comment_id } };
        },
      },
    };

    const result = await publishOrUpdateComment({
      owner: "vercel",
      name: "next.js",
      pr: 101,
      body: "Refreshed review content <!-- provenance-review -->",
      octokitClient:
        simulatedClient as unknown as import("@octokit/rest").Octokit,
    });

    expect(result).toEqual({ id: 44102, action: "updated" });
    expect(updatedCalls).toHaveLength(1);
    expect(updatedCalls[0]?.comment_id).toBe(44102);
  });
});

describe("Webhook endpoint security and ping", () => {
  it("responds pong to ping event", async () => {
    const handler = createWebhookHandler({ secret: testSecret });
    const payload = JSON.stringify({ zen: "Responsive is better than fast." });
    const request = new Request("http://localhost:3000/api/webhook/github", {
      method: "POST",
      headers: {
        "x-github-event": "ping",
        "x-hub-signature-256": computeSignature(payload),
        "content-type": "application/json",
      },
      body: payload,
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok", message: "pong" });
  });

  it("rejects unauthorized request with 401 on bad signature", async () => {
    const handler = createWebhookHandler({ secret: testSecret });
    const payload = JSON.stringify({ zen: "Testing invalid sig" });
    const request = new Request("http://localhost:3000/api/webhook/github", {
      method: "POST",
      headers: {
        "x-github-event": "ping",
        "x-hub-signature-256": "sha256=bad123",
        "content-type": "application/json",
      },
      body: payload,
    });

    const response = await handler(request);
    expect(response.status).toBe(401);
  });
});

describe("Webhook event validation", () => {
  it("ignores unsupported events and actions safely", async () => {
    const handler = createWebhookHandler({ secret: testSecret });
    const payload = JSON.stringify({ action: "labeled" });
    const request = new Request("http://localhost:3000/api/webhook/github", {
      method: "POST",
      headers: {
        "x-github-event": "issues",
        "x-hub-signature-256": computeSignature(payload),
        "content-type": "application/json",
      },
      body: payload,
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("ignored");
  });

  it("returns 400 on malformed JSON payload", async () => {
    const handler = createWebhookHandler({ secret: testSecret });
    const badBody = "{ malformed_json: ";
    const request = new Request("http://localhost:3000/api/webhook/github", {
      method: "POST",
      headers: {
        "x-github-event": "pull_request",
        "x-hub-signature-256": computeSignature(badBody),
        "content-type": "application/json",
      },
      body: badBody,
    });

    const response = await handler(request);
    expect(response.status).toBe(400);
  });
});
