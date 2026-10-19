import { graphStep, query } from "./client.js";
import { cypherStatements } from "./cypher-statements.js";

export { cypherStatements };
const statements = cypherStatements;

export type BlastRadiusRow = {
  id: string;
  name: string;
  path: string;
  hops: number;
  path_confidence: number;
};
export type IncidentHistoryRow = {
  fn: string;
  incident: string;
  title: string;
  kind: string;
  at: string;
  pr: number | null;
};
export type ActiveDecisionRow = {
  id: string;
  summary: string;
  reason: string;
  strength: string;
  confidence: number;
  target: string;
  sources: string[];
  decidedAt?: string | null;
};
export type WhoKnowsRow = { login: string; score: number; commits: number };
export type ReviewerRankRow = { login: string; score: number };
export type EvidencePathRow = {
  kind: "decision" | "incident" | "blast";
  nodes: { id: string; label: string; text: string | null }[];
  edges: [string, string, string][];
};
export type DecisionSearchRow = {
  id: string;
  summary: string;
  reason: string;
  confidence: number;
  score: number;
  targets: {
    id: string;
    path: string | null;
    label: string;
    strength: string;
  }[];
  sources: {
    id: string;
    label: string;
    text: string | null;
    url: string | null;
  }[];
};
export type ResolvedTargetRow = {
  id: string;
  label: "Function" | "File";
  path: string;
  functionIds: string[];
};
export type DecisionEvidenceRow = {
  fromNode: {
    id: string;
    label: string;
    text: string | null;
    url: string | null;
    path?: string | null;
    strength?: string | null;
  };
  toNode: {
    id: string;
    label: string;
    text: string | null;
    url: string | null;
    path?: string | null;
    strength?: string | null;
  };
  relation: string;
};
export type DecisionSourceTargetRow = {
  id: string;
  summary: string;
  path: string;
  target: string;
  source: string;
  url: string | null;
};
export type GraphCountsRow = {
  decisions: number;
  comments: number;
  pulls: number;
  files: number;
  functions: number;
  incidents: number;
};
export type PathEdge = { from: string; to: string; type: string };
export type VerifiedPathEdge = PathEdge & { count: number };
export type SupersessionLink = { newer: string; older: string };
export type VerifiedPathNode = { id: string };

export function blastRadius(graph: string, fn: string, minConf = 0.5) {
  return graphStep("blast radius", () =>
    query<BlastRadiusRow>(graph, statements["blast-radius"]!, {
      fn,
      minConf,
    }),
  );
}

export function incidentHistory(graph: string, fns: string[]) {
  return graphStep("incident history", () =>
    query<IncidentHistoryRow>(graph, statements["incident-history"]!, { fns }),
  );
}

export function activeDecisions(graph: string, fns: string[], files: string[]) {
  return graphStep("active decisions", () =>
    query<ActiveDecisionRow>(graph, statements["active-decisions"]!, {
      fns,
      files,
    }),
  );
}

export function whyTrace(graph: string, fn: string) {
  return graphStep("why trace", () =>
    query(graph, statements["why-trace"]!, { fn }),
  );
}

export function whoKnows(
  graph: string,
  fn: string,
  now: number,
  halfLifeDays = 120,
) {
  return graphStep("who knows", () =>
    query<WhoKnowsRow>(graph, statements["who-knows"]!, {
      fn,
      now,
      halfLifeDays,
    }),
  );
}

export function reviewerRank(
  graph: string,
  fns: string[],
  excludeLogin: string,
  now: number,
  halfLifeDays = 120,
) {
  return graphStep("reviewer rank", () =>
    query<ReviewerRankRow>(graph, statements["reviewer-rank"]!, {
      fns,
      excludeLogin,
      now,
      halfLifeDays,
    }),
  );
}

export function pathForEvidence(graph: string, fn: string) {
  return graphStep("evidence paths", () =>
    query<EvidencePathRow>(graph, statements["path-for-evidence"]!, { fn }),
  );
}

export function asOfSubgraph(graph: string, asOf: number) {
  return graphStep("as-of subgraph", () =>
    query(graph, statements["as-of-subgraph"]!, {
      asOf: new Date(asOf).toISOString(),
      asOfMs: asOf,
    }),
  );
}

export function ownershipConcentration(graph: string, since: number) {
  return graphStep("ownership concentration", () =>
    query(graph, statements["ownership-concentration"]!, { since }),
  );
}

export function searchDecisionRows(
  graph: string,
  embedding: number[],
  path: string | null,
  limit: number,
) {
  return graphStep("search decisions", () =>
    query<DecisionSearchRow>(graph, statements["search-decisions"]!, {
      embedding,
      path,
      limit,
    }),
  );
}

export function resolveTargetRows(graph: string, targets: string[]) {
  return graphStep("resolve reasoning targets", () =>
    query<ResolvedTargetRow>(graph, statements["resolve-targets"]!, {
      targets,
    }),
  );
}

export function decisionEvidenceRows(graph: string, id: string, limit = 100) {
  return graphStep("trace decision evidence", () =>
    query<DecisionEvidenceRow>(graph, statements["decision-evidence"]!, {
      id,
      limit,
    }),
  );
}

export function decisionForSources(graph: string, sourceIds: string[]) {
  return graphStep("find source-backed decision", () =>
    query<DecisionSourceTargetRow>(
      graph,
      statements["decision-source-target"]!,
      {
        sourceIds,
      },
    ),
  );
}

export function graphCounts(graph: string) {
  return graphStep("read graph counts", () =>
    query<GraphCountsRow>(graph, statements["graph-counts"]!),
  );
}

export function verifyPathEdges(graph: string, edges: PathEdge[]) {
  return graphStep("verify evidence path edges", () =>
    query<VerifiedPathEdge>(graph, statements["verify-path-edges"]!, { edges }),
  );
}

export function supersessionLinks(graph: string) {
  return graphStep("read decision supersession links", () =>
    query<SupersessionLink>(graph, statements["supersession-links"]!),
  );
}

export function verifyPathNodes(graph: string, ids: string[]) {
  return graphStep("verify evidence path nodes", () =>
    query<VerifiedPathNode>(graph, statements["verify-path-nodes"]!, { ids }),
  );
}
