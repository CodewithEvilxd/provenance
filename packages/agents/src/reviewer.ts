import { z } from "zod";
import { cachedValue, writeCachedValue } from "@provenance/decisions/cache";
import { completeJson } from "@provenance/decisions/validation";
import { query } from "@provenance/graph/client";
import {
  activeDecisions,
  blastRadius,
  incidentHistory,
  pathForEvidence,
  reviewerRank,
  whoKnows,
  type ActiveDecisionRow,
  type BlastRadiusRow,
  type EvidencePathRow,
  type IncidentHistoryRow,
} from "@provenance/graph/queries";
import { pullDetail, pullFiles } from "@provenance/ingest/github-discussions";
import { ProviderFailure, type LlmRouter } from "@provenance/llm/types";
import { riskScore } from "./risk.js";
import { buildReviewChecks } from "./review-checks.js";

const violationSchema = z.object({
  violated: z.boolean(),
  evidence: z.string().trim().min(1).max(150),
});
const storedCheckSchema = z.discriminatedUnion("status", [
  z.object({
    model_id: z.string(),
    status: z.literal("available"),
    violated: z.boolean(),
    evidence: z.string(),
  }),
  z.object({
    model_id: z.string(),
    status: z.literal("unavailable"),
    reason: z.string(),
  }),
]);
type StoredDecisionCheck = z.infer<typeof storedCheckSchema>;

type PullFiles = Awaited<ReturnType<typeof pullFiles>>;
type ChangedFunction = { id: string; path: string; start: number; end: number };
type VerifiedDecision = ActiveDecisionRow & {
  available: boolean;
  model_id: string | null;
  violated: boolean | null;
  evidence: string;
};
type ReviewGraph = {
  blast: BlastRadiusRow[];
  history: IncidentHistoryRow[];
  decisions: ActiveDecisionRow[];
  authors: Awaited<ReturnType<typeof whoKnows>>[];
  reviewers: { login: string; score: number }[];
};

export type ReviewResult = {
  pr: number;
  evidence_status: "complete" | "insufficient_evidence";
  missing_evidence: string[];
  risk: ReturnType<typeof riskScore>;
  reasons: string[];
  changed_functions: string[];
  blast_radius: BlastRadiusRow[];
  incidents: IncidentHistoryRow[];
  decisions: VerifiedDecision[];
  reviewers: { login: string; score: number }[];
  paths: {
    kind: EvidencePathRow["kind"];
    nodes: EvidencePathRow["nodes"];
    edges: { from: string; to: string; type: string }[];
  }[];
};

export async function reviewPullRequest(
  graph: string,
  repo: string,
  owner: string,
  name: string,
  number: number,
  router: LlmRouter,
  cutoffTime?: string | number | undefined,
): Promise<ReviewResult> {
  const [pull, files] = await Promise.all([
    pullDetail(owner, name, number),
    pullFiles(owner, name, number),
  ]);
  const changed = await changedFunctions(graph, files);
  const functionIds = changed.map(({ id }) => id);
  const now =
    cutoffTime !== undefined
      ? typeof cutoffTime === "number"
        ? cutoffTime
        : Date.parse(cutoffTime)
      : Date.now();
  if (Number.isNaN(now)) throw new Error(`Invalid cutoffTime: ${cutoffTime}`);
  const graphReview = await reviewGraph(
    graph,
    functionIds,
    files,
    pull.user?.login ?? "",
    now,
  );
  const verified = await verifyDecisions(
    repo,
    number,
    graphReview.decisions,
    files,
    changed,
    router,
  );
  const directIncident = graphReview.history.some(
    ({ fn, at }) =>
      functionIds.includes(fn) && now - Date.parse(at) <= 365 * 86400000,
  );
  const paths = await evidencePaths(
    graph,
    functionIds,
    new Set(graphReview.decisions.map((d) => d.id)),
    new Set(graphReview.history.map((h) => h.incident)),
  );
  const failedDecisionChecks = verified.some(
    ({ model_id, available }) => model_id !== null && !available,
  );
  const missingEvidence = [
    ...(functionIds.length ? [] : ["changed_functions"]),
    ...(paths.some(({ kind }) => kind === "decision") ? [] : ["decisions"]),
    ...(paths.some(({ kind }) => kind === "incident") ? [] : ["incidents"]),
    ...(failedDecisionChecks ? ["decision_verdicts"] : []),
  ];
  const risk = reviewRisk(
    graphReview.blast,
    graphReview.history,
    verified,
    graphReview.authors,
    files,
    pull.user?.login ?? "",
    functionIds,
    now,
    directIncident,
    missingEvidence,
  );
  const result = {
    pr: number,
    evidence_status: missingEvidence.length
      ? "insufficient_evidence"
      : "complete",
    missing_evidence: missingEvidence,
    risk,
    reasons: reviewReasons(verified, directIncident, graphReview.blast.length),
    changed_functions: functionIds,
    blast_radius: graphReview.blast,
    incidents: graphReview.history,
    decisions: verified,
    reviewers: graphReview.reviewers,
    paths,
  };
  return reviewResultSchema.parse(result);
}

export const reviewResultSchema = z.object({
  pr: z.number().int().positive(),
  evidence_status: z.enum(["complete", "insufficient_evidence"]),
  missing_evidence: z.array(z.string()),
  risk: z.object({
    score: z.number(),
    band: z.enum(["low", "medium", "high"]),
    components: z.object({
      blast: z.number(),
      history: z.number(),
      decisions: z.number(),
      familiarity: z.number(),
      size: z.number(),
    }),
  }),
  reasons: z.array(z.string()),
  changed_functions: z.array(z.string()),
  blast_radius: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      hops: z.number(),
      path_confidence: z.number(),
    }),
  ),
  incidents: z.array(
    z.object({
      fn: z.string(),
      incident: z.string(),
      title: z.string(),
      kind: z.string(),
      at: z.string(),
      pr: z.number().nullable(),
    }),
  ),
  decisions: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      reason: z.string(),
      strength: z.string(),
      confidence: z.number(),
      target: z.string(),
      sources: z.array(z.string()),
      available: z.boolean(),
      model_id: z.string().nullable(),
      violated: z.boolean().nullable(),
      evidence: z.string(),
    }),
  ),
  reviewers: z.array(z.object({ login: z.string(), score: z.number() })),
  paths: z.array(
    z.object({
      kind: z.enum(["decision", "incident", "blast"]),
      nodes: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          text: z.string().nullable(),
        }),
      ),
      edges: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          type: z.string(),
        }),
      ),
    }),
  ),
});

export async function reviewGraph(
  graph: string,
  functionIds: string[],
  files: PullFiles,
  author: string,
  now: number,
): Promise<ReviewGraph> {
  const blastRows = await Promise.all(
    functionIds.map((fn) => blastRadius(graph, fn)),
  );
  const blast = [
    ...new Map(blastRows.flat().map((row) => [row.id, row])).values(),
  ];
  const [rawHistory, rawDecisions, authors, reviewers] = await Promise.all([
    incidentHistory(graph, [
      ...new Set([
        ...functionIds,
        ...blast.filter(({ hops }) => hops === 1).map(({ id }) => id),
      ]),
    ]),
    activeDecisions(
      graph,
      functionIds,
      files.map(({ filename }) => filename),
    ),
    Promise.all(functionIds.map((fn) => whoKnows(graph, fn, now))),
    reviewerRank(graph, functionIds, author, now),
  ]);
  const history = rawHistory.filter(({ at }) => !at || Date.parse(at) <= now);
  const decisions = rawDecisions.filter(
    ({ decidedAt }) => !decidedAt || Date.parse(decidedAt) <= now,
  );
  return {
    blast,
    history,
    decisions,
    authors,
    reviewers,
  };
}

export async function changedFunctions(graph: string, files: PullFiles) {
  const functions = await query<ChangedFunction>(
    graph,
    "MATCH (fn:Function) WHERE fn.path IN $paths RETURN fn.id AS id, fn.path AS path, fn.start_line AS start, fn.end_line AS end",
    { paths: files.map(({ filename }) => filename) },
  );
  return functions.filter((fn) =>
    files.some(
      (file) =>
        file.filename === fn.path &&
        changedLines(file.patch ?? "").some(
          (line) => line >= fn.start && line <= fn.end,
        ),
    ),
  );
}

function mustStopReview(error: unknown) {
  return (
    error instanceof ProviderFailure &&
    ["invalid_key", "quota", "rate_limit", "unsupported"].includes(error.kind)
  );
}

function reviewFailureReason(error: unknown) {
  if (error instanceof ProviderFailure) {
    return [
      error.message,
      error.causeName ? `cause=${error.causeName}` : "",
      error.causeCode ? `code=${error.causeCode}` : "",
      error.upstreamProvider ? `upstream=${error.upstreamProvider}` : "",
      error.upstreamRaw ? `detail=${error.upstreamRaw}` : "",
    ]
      .filter(Boolean)
      .join("; ")
      .slice(0, 500);
  }
  return error instanceof Error
    ? `${error.name}: ${error.message}`.slice(0, 500)
    : "Unknown completion failure";
}

async function verifyDecisions(
  repo: string,
  number: number,
  decisions: ActiveDecisionRow[],
  files: PullFiles,
  changed: ChangedFunction[],
  router: LlmRouter,
): Promise<VerifiedDecision[]> {
  const checks = buildReviewChecks(decisions, files, changed);
  const uniqueChecks = new Map(
    checks.map((check) => [
      JSON.stringify(["review-v2", number, check.decision.id, check.hunk]),
      check,
    ]),
  );
  const modelId = router.routeFor("decision_check").model;
  const outputs = new Map<string, StoredDecisionCheck>();
  for (const [key, check] of uniqueChecks) {
    const cached = await cachedValue<unknown>(repo, key);
    if (cached !== undefined) {
      const parsed = storedCheckSchema.safeParse(cached);
      if (parsed.success) {
        outputs.set(key, parsed.data);
        continue;
      }
      const legacy = violationSchema.safeParse(cached);
      if (legacy.success) {
        const migrated: StoredDecisionCheck = {
          model_id: "unknown (legacy cache)",
          status: "available",
          ...legacy.data,
        };
        await writeCachedValue(repo, key, migrated);
        outputs.set(key, migrated);
        continue;
      }
    }
    const startedAt = Date.now();
    try {
      const answer = await completeJson(
        router,
        check.prompt,
        violationSchema,
        "decision_check",
      );
      const result: StoredDecisionCheck = {
        model_id: modelId,
        status: "available",
        ...answer,
      };
      await writeCachedValue(repo, key, result);
      outputs.set(key, result);
    } catch (error) {
      if (mustStopReview(error)) throw error;
      const elapsed =
        error instanceof ProviderFailure && error.elapsedMs !== undefined
          ? Math.max(error.elapsedMs, Date.now() - startedAt)
          : Date.now() - startedAt;
      outputs.set(key, {
        model_id: modelId,
        status: "unavailable",
        reason: `${reviewFailureReason(error)} (${elapsed} ms)`,
      });
    }
  }
  const byDecisionTarget = new Map(
    checks.map((check) => [
      JSON.stringify([check.decision.id, check.decision.target]),
      check,
    ]),
  );
  return Promise.all(
    decisions.map(async (decision) => {
      const check = byDecisionTarget.get(
        JSON.stringify([decision.id, decision.target]),
      );
      if (!check)
        return {
          ...decision,
          available: false,
          model_id: null,
          violated: null,
          evidence:
            "Skipped: no overlapping hunk on a changed constrained function.",
        };
      const key = JSON.stringify([
        "review-v2",
        number,
        decision.id,
        check.hunk,
      ]);
      const answer = outputs.get(key);
      if (!answer) throw new Error("Review verdict cache result is missing");
      if (answer.status === "unavailable")
        return {
          ...decision,
          available: false,
          model_id: answer.model_id,
          violated: null,
          evidence: `Unavailable: ${answer.reason}`,
        };
      return {
        ...decision,
        available: true,
        model_id: answer.model_id,
        violated: answer.violated,
        evidence: answer.evidence,
      };
    }),
  );
}

function reviewRisk(
  blast: BlastRadiusRow[],
  history: IncidentHistoryRow[],
  decisions: VerifiedDecision[],
  authors: Awaited<ReturnType<typeof whoKnows>>[],
  files: PullFiles,
  login: string,
  functionIds: string[],
  now: number,
  directIncident: boolean,
  missingEvidence?: string[],
) {
  const directCallers = new Set(
    blast.filter(({ hops }) => hops === 1).map(({ id }) => id),
  );
  const weightedIncidents = history.reduce((sum, incident) => {
    const age = now - Date.parse(incident.at);
    const weight = functionIds.includes(incident.fn)
      ? 1
      : directCallers.has(incident.fn)
        ? 0.5
        : 0;
    return sum + weight * (age > 730 * 86400000 ? 0.5 : 1);
  }, 0);
  const authorKnowledge = authors
    .flat()
    .filter(({ login: author }) => author === login)
    .reduce((sum, author) => sum + author.score, 0);
  const linesChanged = files.reduce(
    (sum, file) => sum + file.additions + file.deletions,
    0,
  );
  return riskScore({
    blastRadius: new Set(blast.map(({ id }) => id)).size,
    weightedIncidents,
    decisions: decisions
      .filter(({ available }) => available)
      .map(({ strength, violated }) => ({
        strength: strength as "hard" | "soft",
        violated: Boolean(violated),
      })),
    authorKnowledge,
    linesChanged,
    recentDirectIncident: directIncident,
    missingEvidence,
  });
}

function reviewReasons(
  decisions: VerifiedDecision[],
  directIncident: boolean,
  callers: number,
) {
  const reasons = decisions
    .filter(({ available, violated }) => available && violated)
    .map(({ id, summary, evidence }) => `${summary} (${id}): ${evidence}`);
  for (const decision of decisions) {
    if (!decision.available && decision.model_id !== null)
      reasons.push(
        `Decision check unavailable for ${decision.summary} (${decision.id}): ${decision.evidence}`,
      );
  }
  if (directIncident)
    reasons.push("A recent incident affected a changed function.");
  if (callers)
    reasons.push(
      `${callers} callers are within three hops of changed functions.`,
    );
  return reasons;
}

function changedLines(patch: string) {
  return [
    ...patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm),
  ].flatMap((match) => {
    const start = Number(match[1]);
    const length = Number(match[2] ?? 1);
    return Array.from({ length }, (_, index) => start + index);
  });
}

async function evidencePaths(
  graph: string,
  functions: string[],
  activeDecisionIds?: Set<string>,
  activeIncidentIds?: Set<string>,
) {
  const paths: ReviewResult["paths"] = [];
  for (const fn of functions) {
    const rows = await pathForEvidence(graph, fn);
    paths.push(
      ...rows.map((path) => ({
        kind: path.kind,
        nodes: path.nodes,
        edges: path.edges.map(([from, to, type]) => ({ from, to, type })),
      })),
    );
  }
  if (!activeDecisionIds && !activeIncidentIds) return paths;
  return paths.filter((path) => {
    if (path.kind === "decision" && activeDecisionIds) {
      const node = path.nodes.find((n) => n.label === "Decision");
      return node ? activeDecisionIds.has(node.id) : false;
    }
    if (path.kind === "incident" && activeIncidentIds) {
      const node = path.nodes.find((n) => n.label === "Incident");
      return node ? activeIncidentIds.has(node.id) : false;
    }
    return true;
  });
}
