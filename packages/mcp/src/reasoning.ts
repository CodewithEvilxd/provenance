import { embedText } from "@provenance/decisions/embedding";
import {
  activeDecisions,
  blastRadius,
  decisionEvidenceRows,
  incidentHistory,
  pathForEvidence,
  resolveTargetRows,
  reviewerRank,
  searchDecisionRows,
  whoKnows,
  type DecisionEvidenceRow,
  type EvidencePathRow,
  type ResolvedTargetRow,
} from "@provenance/graph/queries";
import { riskScore } from "@provenance/agents/risk";
import {
  recallDeveloperContext,
  recordEpisode,
} from "@provenance/agents/memory";
import { z } from "zod";

const nodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string().nullable(),
  url: z.string().nullable(),
  path: z.string().nullable(),
  strength: z.string().nullable(),
});
const edgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
});
const pathSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});
const decisionSchema = z.object({
  id: z.string(),
  summary: z.string(),
  rationale: z.string(),
  confidence: z.number(),
  targets: z.array(nodeSchema),
  sources: z.array(nodeSchema),
});

export const searchOutputSchema = z.object({
  status: z.enum(["found", "insufficient_evidence"]),
  matches: z.array(decisionSchema.extend({ similarity: z.number() })),
  paths: z.array(pathSchema),
});

export const explainOutputSchema = z.object({
  status: z.enum(["found", "insufficient_evidence"]),
  targets: z.array(nodeSchema),
  decisions: z.array(decisionSchema),
  paths: z.array(pathSchema),
  missingInformation: z.array(z.string()),
});

export const traceOutputSchema = z.object({
  status: z.enum(["traced", "insufficient_evidence"]),
  decision: nodeSchema.nullable(),
  sources: z.array(nodeSchema),
  targets: z.array(nodeSchema),
  supersedes: z.array(nodeSchema),
  supersededBy: z.array(nodeSchema),
  sharedScopeDecisions: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      targets: z.array(z.string()),
    }),
  ),
  paths: z.array(pathSchema),
  missingInformation: z.array(z.string()),
});

const riskSchema = z.object({
  score: z.number(),
  band: z.enum(["low", "medium", "high"]),
  components: z.object({
    blast: z.number(),
    history: z.number(),
    decisions: z.number(),
    familiarity: z.number(),
    size: z.number(),
  }),
});

export const assessOutputSchema = z.object({
  status: z.enum(["assessed", "insufficient_evidence"]),
  risk: riskSchema.nullable(),
  targets: z.array(nodeSchema),
  changedFunctions: z.array(z.string()),
  blastRadius: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      hops: z.number(),
      confidence: z.number(),
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
    decisionSchema.extend({ decisionCheck: z.literal("not_run") }),
  ),
  reviewers: z.array(z.object({ login: z.string(), score: z.number() })),
  paths: z.array(pathSchema),
  missingInformation: z.array(z.string()),
  interpretation: z.string(),
  priorInteractions: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        summary: z.string(),
        at: z.number(),
      }),
    )
    .default([]),
});

type GraphNode = z.infer<typeof nodeSchema>;
type GraphPath = z.infer<typeof pathSchema>;
type Decision = z.infer<typeof decisionSchema>;

export async function searchDecisions(
  graph: string,
  text: string,
  path: string | undefined,
  limit: number,
) {
  const rows = await searchDecisionRows(
    graph,
    embedText(text),
    path ?? null,
    limit,
  );
  const matches = rows.map((row) => ({
    id: row.id,
    summary: row.summary,
    rationale: row.reason,
    confidence: row.confidence,
    similarity: row.score,
    targets: row.targets.map((target) => ({
      id: target.id,
      label: target.label,
      text: target.path,
      path: target.path,
      url: null,
      strength: target.strength,
    })),
    sources: row.sources.map(sourceNode),
  }));
  return searchOutputSchema.parse({
    status: matches.length ? "found" : "insufficient_evidence",
    matches,
    paths: matches.flatMap((decision) => decisionPaths(decision)),
  });
}

export async function explainCodeConstraint(graph: string, target: string) {
  const scopes = await resolveTargetRows(graph, [target]);
  if (!scopes.length)
    return explainOutputSchema.parse({
      status: "insufficient_evidence",
      targets: [],
      decisions: [],
      paths: [],
      missingInformation: [`No indexed Function or File matches ${target}.`],
    });
  const decisions = await scopedDecisions(graph, scopes);
  const evidence = await evidenceForDecisions(graph, decisions);
  return explainOutputSchema.parse({
    status: decisions.length ? "found" : "insufficient_evidence",
    targets: scopes.map(scopeNode),
    decisions: decisions.map((decision) =>
      decisionWithSources(decision, evidence),
    ),
    paths: graphPaths(evidence),
    missingInformation: decisions.length
      ? []
      : ["No active decision constrains the resolved target."],
  });
}

export async function traceDecisionEvidence(graph: string, id: string) {
  const evidence = await decisionEvidenceRows(graph, id);
  const relationRows = evidence.map(evidencePath);
  const decision = evidence.find(
    ({ fromNode }) => fromNode.label === "Decision",
  )?.fromNode;
  const sources = uniqueNodes(
    evidence
      .filter(({ relation }) => relation === "DERIVED_FROM")
      .map(({ toNode }) => toNode),
  );
  const targets = uniqueNodes(
    evidence
      .filter(({ relation }) => relation === "CONSTRAINS")
      .map(({ toNode }) => toNode),
  );
  const supersedes = uniqueNodes(
    evidence
      .filter(
        ({ relation, fromNode }) =>
          relation === "SUPERSEDES" && fromNode.id === id,
      )
      .map(({ toNode }) => toNode),
  );
  const supersededBy = uniqueNodes(
    evidence
      .filter(
        ({ relation, toNode }) => relation === "SUPERSEDES" && toNode.id === id,
      )
      .map(({ fromNode }) => fromNode),
  );
  const active = await activeDecisions(
    graph,
    targets
      .filter(({ label }) => label === "Function")
      .map(({ id: targetId }) => targetId),
    targets
      .filter(({ label }) => label === "File")
      .map(({ path: targetPath }) => targetPath ?? ""),
  );
  const sharedScopeDecisions = active
    .filter(({ id: decisionId }) => decisionId !== id)
    .map((candidate) => ({
      id: candidate.id,
      summary: candidate.summary,
      targets: targets
        .filter(({ id: targetId }) => candidate.target === targetId)
        .map(({ id: targetId }) => targetId),
    }))
    .filter(({ targets: sharedTargets }) => sharedTargets.length > 0);
  return traceOutputSchema.parse({
    status: decision ? "traced" : "insufficient_evidence",
    decision: decision ? graphNode(decision) : null,
    sources,
    targets,
    supersedes,
    supersededBy,
    sharedScopeDecisions,
    paths: relationRows,
    missingInformation: decision
      ? []
      : ["No Decision with graph evidence matches the supplied id."],
  });
}

export async function assessChangeRisk(
  graph: string,
  target: string,
  changedFiles: string[],
  authorLogin: string | undefined,
  linesChanged: number | undefined,
) {
  const scopes = await resolveTargetRows(graph, [target, ...changedFiles]);
  const now = Date.now();
  const user =
    authorLogin ?? (process.env.PROVENANCE_USER?.trim() || undefined);
  const functionIds = [
    ...new Set(scopes.flatMap(({ functionIds: ids }) => ids)),
  ];
  const priorInteractions = await checkAndRecordUserMemory(
    user,
    target,
    graph.replace(/^repo:/, ""),
    functionIds,
    now,
  );
  if (!scopes.length) {
    let interpretation = "No risk score is available without a graph target.";
    if (user && priorInteractions.length > 0) {
      interpretation += ` Note: Developer @${user} previously inspected this area (${priorInteractions.length} prior interaction${priorInteractions.length > 1 ? "s" : ""}).`;
    }
    return assessOutputSchema.parse({
      status: "insufficient_evidence",
      risk: null,
      targets: [],
      changedFunctions: [],
      blastRadius: [],
      incidents: [],
      decisions: [],
      reviewers: [],
      paths: [],
      missingInformation: [`No indexed Function or File matches ${target}.`],
      interpretation,
      priorInteractions,
    });
  }

  const decisions = await scopedDecisions(graph, scopes);
  const [blastRows, incidents, authors, reviewers] = await Promise.all([
    Promise.all(functionIds.map((fn) => blastRadius(graph, fn))),
    incidentHistory(graph, functionIds),
    Promise.all(functionIds.map((fn) => whoKnows(graph, fn, now))),
    reviewerRank(graph, functionIds, authorLogin ?? "", now),
  ]);
  const blast = [
    ...new Map(blastRows.flat().map((caller) => [caller.id, caller])).values(),
  ];
  const uniqueIncidents = [
    ...new Map(
      incidents.map((incident) => [
        `${incident.incident}:${incident.fn}`,
        incident,
      ]),
    ).values(),
  ];
  const directCallers = new Set(
    blast.filter(({ hops }) => hops === 1).map(({ id }) => id),
  );
  const weightedIncidents = uniqueIncidents.reduce((total, incident) => {
    const direct = functionIds.includes(incident.fn);
    const related = directCallers.has(incident.fn);
    const age = now - Date.parse(incident.at);
    return (
      total +
      (direct ? 1 : related ? 0.5 : 0) * (age > 730 * 86400000 ? 0.5 : 1)
    );
  }, 0);
  const authorKnowledge = authors
    .flat()
    .filter(({ login }) => login === authorLogin)
    .reduce((total, person) => total + person.score, 0);
  const decisionEvidence = await evidenceForDecisions(graph, decisions);
  const paths = await riskPaths(graph, functionIds, decisionEvidence);
  const missingInformation = [
    ...(functionIds.length
      ? []
      : [
          "The graph has no Function parse for this File; call edges, incidents and ownership cannot be assessed.",
        ]),
    ...(uniqueIncidents.length
      ? []
      : ["No incident path was found for the resolved functions."]),
    ...(authorLogin
      ? []
      : [
          "Author familiarity is unknown because no GitHub login was supplied.",
        ]),
    ...(linesChanged === undefined
      ? ["Change size is unknown because no changed-line count was supplied."]
      : []),
    "Decision violations were not checked against a diff; this read-only score uses decision presence only.",
  ];
  const risk = functionIds.length
    ? riskScore({
        blastRadius: new Set(blast.map(({ id }) => id)).size,
        weightedIncidents,
        decisions: decisions.map(({ strength }) => ({
          strength: strength === "hard" ? "hard" : "soft",
          violated: false,
        })),
        authorKnowledge,
        linesChanged: linesChanged ?? 0,
        recentDirectIncident: uniqueIncidents.some(
          ({ fn, at }) =>
            functionIds.includes(fn) && now - Date.parse(at) <= 365 * 86400000,
        ),
      })
    : null;

  let interpretationText = risk
    ? "This is a graph-backed heuristic score, not a probability. See missing information before using it as a review verdict."
    : "No risk score is available because this target has no parsed Function nodes.";
  if (user && priorInteractions.length > 0) {
    interpretationText += ` Note: Developer @${user} previously inspected this area (${priorInteractions.length} prior interaction${priorInteractions.length > 1 ? "s" : ""}).`;
  }
  return assessOutputSchema.parse({
    status: risk ? "assessed" : "insufficient_evidence",
    risk,
    targets: scopes.map(scopeNode),
    changedFunctions: functionIds,
    blastRadius: blast,
    incidents: uniqueIncidents,
    decisions: decisions.map((decision) => ({
      ...decisionWithSources(
        decision,
        decisionEvidence.filter(({ fromNode }) => fromNode.id === decision.id),
      ),
      decisionCheck: "not_run" as const,
    })),
    reviewers,
    paths,
    missingInformation,
    interpretation: interpretationText,
    priorInteractions,
  });
}

async function checkAndRecordUserMemory(
  user: string | undefined,
  target: string,
  repo: string,
  functionIds: string[],
  now: number,
) {
  if (!user) return [];
  let prior: { id: string; kind: string; summary: string; at: number }[] = [];
  try {
    const memory = await recallDeveloperContext(user, target);
    prior = memory.episodes.map(({ id, kind, summary, at }) => ({
      id,
      kind,
      summary,
      at,
    }));
  } catch {
    prior = [];
  }
  try {
    await recordEpisode(user, {
      kind: "change_risk_assessment",
      summary: `Assessed risk for target ${target}`,
      repo,
      topics: [target, ...functionIds],
      at: now,
    });
  } catch {
    // safe ignore if memory write fails
  }
  return prior;
}

async function scopedDecisions(graph: string, scopes: ResolvedTargetRow[]) {
  const functions = [
    ...new Set(scopes.flatMap(({ functionIds }) => functionIds)),
  ];
  const files = [...new Set(scopes.map(({ path }) => path))];
  const rows = await activeDecisions(graph, functions, files);
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) unique.set(row.id, unique.get(row.id) ?? row);
  return [...unique.values()];
}

async function evidenceForDecisions(
  graph: string,
  decisions: { id: string }[],
) {
  return (
    await Promise.all(
      decisions.map(({ id }) => decisionEvidenceRows(graph, id)),
    )
  ).flat();
}

function decisionWithSources(
  decision: {
    id: string;
    summary: string;
    reason: string;
    confidence: number;
    strength: string;
    target: string;
  },
  evidence: DecisionEvidenceRow[],
): Decision {
  return {
    id: decision.id,
    summary: decision.summary,
    rationale: decision.reason,
    confidence: decision.confidence,
    targets: uniqueNodes(
      evidence
        .filter(({ relation }) => relation === "CONSTRAINS")
        .map(({ toNode }) => toNode),
    ),
    sources: uniqueNodes(
      evidence
        .filter(({ relation }) => relation === "DERIVED_FROM")
        .map(({ toNode }) => toNode),
    ),
  };
}

function decisionPaths(decision: Decision): GraphPath[] {
  const decisionNode: GraphNode = {
    id: decision.id,
    label: "Decision",
    text: decision.summary,
    url: null,
    path: null,
    strength: null,
  };
  return [
    ...decision.sources.map((source) => ({
      nodes: [decisionNode, source],
      edges: [{ from: decision.id, to: source.id, type: "DERIVED_FROM" }],
    })),
    ...decision.targets.map((target) => ({
      nodes: [decisionNode, target],
      edges: [{ from: decision.id, to: target.id, type: "CONSTRAINS" }],
    })),
  ];
}

function graphPaths(evidence: DecisionEvidenceRow[]) {
  return evidence.map(evidencePath);
}

function evidencePath({
  fromNode,
  toNode,
  relation,
}: DecisionEvidenceRow): GraphPath {
  const from = graphNode(fromNode);
  const to = graphNode(toNode);
  return {
    nodes: [from, to],
    edges: [{ from: from.id, to: to.id, type: relation }],
  };
}

async function riskPaths(
  graph: string,
  functions: string[],
  decisionEvidence: DecisionEvidenceRow[],
) {
  const functionPaths = await Promise.all(
    functions.map((fn) => pathForEvidence(graph, fn)),
  );
  const fromFunctionPaths = functionPaths.flat().map(evidenceGraphPath);
  return [...fromFunctionPaths, ...graphPaths(decisionEvidence)];
}

function evidenceGraphPath(path: EvidencePathRow): GraphPath {
  const nodes = path.nodes.map((node) => ({
    ...node,
    url: null,
    path: null,
    strength: null,
  }));
  return {
    nodes,
    edges: path.edges.map(([from, to, type]) => ({ from, to, type })),
  };
}

function sourceNode(source: {
  id: string;
  label: string;
  text: string | null;
  url: string | null;
}): GraphNode {
  return { ...source, path: null, strength: null };
}

function scopeNode(scope: ResolvedTargetRow): GraphNode {
  return {
    id: scope.id,
    label: scope.label,
    text: scope.path,
    url: null,
    path: scope.path,
    strength: null,
  };
}

function graphNode(node: DecisionEvidenceRow["fromNode"]): GraphNode {
  return {
    id: node.id,
    label: node.label,
    text: node.text,
    url: node.url,
    path: node.path ?? null,
    strength: node.strength ?? null,
  };
}

function uniqueNodes(nodes: DecisionEvidenceRow["fromNode"][]) {
  return [...new Map(nodes.map((node) => [node.id, graphNode(node)])).values()];
}
