import { createHmac } from "node:crypto";
import { expect } from "vitest";
import { query } from "@provenance/graph/client";
import type { ReviewResult } from "../src/reviewer.js";
import type { PullRequestPayload } from "../src/webhook.js";

export const testWebhookSecret = "test-webhook-secret-value-123";

export function computeSignature(
  payload: string,
  secret: string = testWebhookSecret,
): string {
  const hash = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${hash}`;
}

export function buildTestPayload(
  action = "opened",
  prNumber = 201,
  headSha = "sha-201-initial",
): PullRequestPayload {
  return {
    action,
    number: prNumber,
    pull_request: {
      number: prNumber,
      title: "Improve revalidation caching layer",
      state: "open",
      user: { login: "test-developer" },
      head: { sha: headSha, ref: "feature/cache-opt" },
      base: { ref: "main" },
    },
    repository: {
      full_name: "vercel/next.js",
      name: "next.js",
      owner: { login: "vercel" },
    },
  };
}

const testBlastRadius = [
  {
    id: "fn:render",
    name: "render",
    path: "packages/next/src/server/next-server.ts",
    hops: 1,
    path_confidence: 0.95,
  },
];

const testIncidents = [
  {
    fn: "packages/next/src/server/base-server.ts#renderToHTML",
    incident: "inc-402",
    title: "ISR cache stampede",
    kind: "revert" as const,
    at: "2026-03-01T12:00:00Z",
    pr: 4020,
  },
];

const testDecisions = [
  {
    id: "dec-101",
    summary: "Deterministic cache tags",
    reason: "Prevent stale reads",
    strength: "REQUIRED" as const,
    confidence: 0.9,
    target: "packages/next/src/server/base-server.ts",
    sources: ["discussion:101"],
    available: true,
    model_id: "gemini-test",
    violated: false,
    evidence: "Uses stable key formatting",
  },
];

const testPaths = [
  {
    kind: "blast" as const,
    nodes: [
      { id: "fn:renderToHTML", label: "Function", text: "renderToHTML" },
      { id: "file:next-server.ts", label: "File", text: "next-server.ts" },
    ],
    edges: [
      { from: "fn:renderToHTML", to: "file:next-server.ts", type: "CALLS" },
    ],
  },
];

export function buildTestReview(
  status: "complete" | "insufficient_evidence" = "complete",
): ReviewResult {
  return {
    pr: 101,
    evidence_status: status,
    missing_evidence:
      status === "complete" ? [] : ["active decisions", "blast radius"],
    risk: {
      score: 75,
      band: "high",
      components: {
        blast: 30,
        history: 20,
        decisions: 15,
        familiarity: 5,
        size: 5,
      },
    },
    reasons: ["Modifies core revalidation logic with 4 upstream dependents"],
    changed_functions: ["packages/next/src/server/base-server.ts:renderToHTML"],
    blast_radius: testBlastRadius,
    incidents: testIncidents,
    decisions: testDecisions,
    reviewers: [{ login: "timneutkens", score: 0.9 }],
    paths: testPaths,
  };
}

export async function verifyGraphRecord(
  graphName: string,
  prNumber: number,
  expectedSha: string,
): Promise<void> {
  const prRows = await query(
    graphName,
    "MATCH (p:Person)-[:AUTHORED]->(pr:PR {number: $prNumber}) RETURN p.login AS author, pr.head_sha AS sha",
    { prNumber },
  );
  expect(prRows).toHaveLength(1);
  expect(prRows[0]?.author).toBe("test-developer");
  expect(prRows[0]?.sha).toBe(expectedSha);
}
