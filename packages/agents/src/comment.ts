import { Octokit } from "@octokit/rest";
import type { ReviewResult } from "./reviewer.js";

export const PROVENANCE_MARKER = "<!-- provenance-review -->";

export type PublishCommentOptions = {
  owner: string;
  name: string;
  pr: number;
  body: string;
  token?: string | undefined;
  octokitClient?: Octokit | undefined;
};

export function formatReviewComment(
  review: ReviewResult,
  repo: string,
  pr: number,
  dashboardOrigin = "http://localhost:3100",
): string {
  const score = Math.round(review.risk.score);
  const band = review.risk.band.toUpperCase();
  const isComplete = review.evidence_status === "complete";
  const evidenceNotice = isComplete
    ? "Evidence status: Complete (all constraints verified against graph)"
    : `> [!WARNING]\n> Evidence status: Incomplete (${review.missing_evidence.join(", ")}).\n> Incomplete evidence must not be treated as proof of safety.`;

  const callerCount = review.blast_radius.length;
  const incidentCount = review.incidents.length;
  const decisionCount = review.decisions.length;
  const authorFamiliarity = review.risk.components.familiarity.toFixed(1);

  const keyReasons = review.reasons.length
    ? review.reasons.map((reason) => `- ${reason}`).join("\n")
    : "- No active constraints or past incidents detected.";

  const pathList = review.paths
    .slice(0, 3)
    .map((path) => {
      const nodeNames = path.nodes
        .map((node) => node.text || node.id)
        .join(" -> ");
      return `- [${path.kind}] ${nodeNames}`;
    })
    .join("\n");

  const pathSection = pathList.length
    ? `\n### Verified Evidence Paths\n${pathList}\n`
    : "";

  return [
    "## Provenance Pull Request Review",
    "",
    `**Change Risk:** **${score}/100 (${band})**`,
    evidenceNotice,
    "",
    "### Signal Breakdown",
    `- **Blast Radius:** ${callerCount} caller${callerCount === 1 ? "" : "s"} within 3 hops`,
    `- **Incident History:** ${incidentCount} related past incident${incidentCount === 1 ? "" : "s"}`,
    `- **Decision Conflicts:** ${decisionCount} active decision${decisionCount === 1 ? "" : "s"} evaluated`,
    `- **Author Familiarity:** ${authorFamiliarity}`,
    "",
    "### Key Reasons",
    keyReasons,
    pathSection,
    `[View interactive evidence graph and paths](${dashboardOrigin}/repos/${repo}/pr/${pr})`,
    "",
    PROVENANCE_MARKER,
  ].join("\n");
}

async function withBoundedRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 2,
  backoffMs = 150,
): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
  }
  throw new Error("Retry attempts exhausted");
}

export async function publishOrUpdateComment(
  options: PublishCommentOptions,
): Promise<{ id: number; action: "created" | "updated" }> {
  const client =
    options.octokitClient ??
    new Octokit({
      auth: options.token ?? process.env.GITHUB_TOKEN,
      userAgent: "provenance-webhook",
    });

  const existingComments = await withBoundedRetry(() =>
    client.issues.listComments({
      owner: options.owner,
      repo: options.name,
      issue_number: options.pr,
      per_page: 100,
    }),
  );

  const matched = existingComments.data.find((entry) =>
    entry.body?.includes(PROVENANCE_MARKER),
  );

  if (matched) {
    const updated = await withBoundedRetry(() =>
      client.issues.updateComment({
        owner: options.owner,
        repo: options.name,
        comment_id: matched.id,
        body: options.body,
      }),
    );
    return { id: updated.data.id, action: "updated" };
  }

  const created = await withBoundedRetry(() =>
    client.issues.createComment({
      owner: options.owner,
      repo: options.name,
      issue_number: options.pr,
      body: options.body,
    }),
  );
  return { id: created.data.id, action: "created" };
}
