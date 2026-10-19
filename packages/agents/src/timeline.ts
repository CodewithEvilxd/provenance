import { query } from "@provenance/graph/client";
import { cypherStatements } from "@provenance/graph/queries";
import { z } from "zod";

const boundsStatement = cypherStatements["timeline-bounds"] ?? "";
const milestonesStatement = cypherStatements["timeline-milestones"] ?? "";
const nodesStatement = cypherStatements["as-of-nodes"] ?? "";
const edgesStatement = cypherStatements["as-of-edges"] ?? "";

export const timelineMilestoneSchema = z.object({
  kind: z.enum(["decision", "incident", "pr", "commit"]),
  id: z.string(),
  text: z.string(),
  timestamp: z.string(),
});

export const asOfNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
  timestamp: z.string().nullable(),
});

export const asOfEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
});

export const timelineReportSchema = z.object({
  repository: z.string(),
  isEmpty: z.boolean(),
  earliest: z.string(),
  latest: z.string(),
  cutoff: z.string(),
  cutoffMs: z.number(),
  totalNodes: z.number().int().nonnegative(),
  totalEdges: z.number().int().nonnegative(),
  activeDecisionsCount: z.number().int().nonnegative(),
  detectedIncidentsCount: z.number().int().nonnegative(),
  milestones: z.array(timelineMilestoneSchema),
  nodes: z.array(asOfNodeSchema),
  edges: z.array(asOfEdgeSchema),
});

export type TimelineMilestone = z.infer<typeof timelineMilestoneSchema>;
export type AsOfNode = z.infer<typeof asOfNodeSchema>;
export type AsOfEdge = z.infer<typeof asOfEdgeSchema>;
export type TimelineReport = z.infer<typeof timelineReportSchema>;

type BoundsRow = {
  minCommitMs: number | null;
  maxCommitMs: number | null;
  minDecisionAt: string | null;
  maxDecisionAt: string | null;
};

type MilestoneRow = {
  kind: "decision" | "incident" | "pr" | "commit";
  id: string;
  text: string;
  timestamp: string;
};

type NodeRow = {
  label: string;
  id: string;
  text: string;
  timestamp: string | null;
};

type EdgeRow = {
  from: string;
  to: string;
  type: string;
};

export type TimelineOptions = {
  repository: string;
  graph?: string | undefined;
  asOf?: string | undefined;
  asOfMs?: number | undefined;
  nodeLimit?: number | undefined;
  edgeLimit?: number | undefined;
};

function resolveTimelineArgs(
  graphOrOptions: string | TimelineOptions,
  repositoryOrCutoff?: string | number,
  requestedCutoffMs?: number,
  nodeLimit = 150,
  edgeLimit = 200,
): {
  graph: string;
  repository: string;
  cutoffMs: number | undefined;
  nLimit: number;
  eLimit: number;
} {
  if (typeof graphOrOptions === "object" && graphOrOptions !== null) {
    const repository = graphOrOptions.repository;
    const graph = graphOrOptions.graph ?? `repo:${repository}`;
    let cutoffMs: number | undefined;
    if (graphOrOptions.asOf) {
      const parsed = Date.parse(graphOrOptions.asOf);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid date string for asOf: ${graphOrOptions.asOf}`);
      }
      cutoffMs = parsed;
    } else {
      cutoffMs = graphOrOptions.asOfMs;
    }
    return {
      graph,
      repository,
      cutoffMs,
      nLimit: graphOrOptions.nodeLimit ?? nodeLimit,
      eLimit: graphOrOptions.edgeLimit ?? edgeLimit,
    };
  }
  if (typeof repositoryOrCutoff === "string") {
    return {
      graph: graphOrOptions,
      repository: repositoryOrCutoff,
      cutoffMs: requestedCutoffMs,
      nLimit: nodeLimit,
      eLimit: edgeLimit,
    };
  }
  const repository = graphOrOptions.replace(/^repo:/, "");
  const graph = graphOrOptions.startsWith("repo:")
    ? graphOrOptions
    : `repo:${graphOrOptions}`;
  const cutoffMs =
    typeof repositoryOrCutoff === "number"
      ? repositoryOrCutoff
      : requestedCutoffMs;
  return { graph, repository, cutoffMs, nLimit: nodeLimit, eLimit: edgeLimit };
}

async function queryBoundsMs(
  graph: string,
): Promise<{ minMs: number; maxMs: number }> {
  const boundsRows = await query<BoundsRow>(graph, boundsStatement).catch(
    () => [],
  );
  const row = boundsRows[0];
  const minMs = Math.min(
    row?.minCommitMs ?? Infinity,
    row?.minDecisionAt ? Date.parse(row.minDecisionAt) : Infinity,
  );
  const maxMs = Math.max(
    row?.maxCommitMs ?? 0,
    row?.maxDecisionAt ? Date.parse(row.maxDecisionAt) : 0,
  );
  return { minMs, maxMs };
}

function buildEmptyReport(repository: string): TimelineReport {
  const fallbackNow = new Date().toISOString();
  return timelineReportSchema.parse({
    repository,
    isEmpty: true,
    earliest: fallbackNow,
    latest: fallbackNow,
    cutoff: fallbackNow,
    cutoffMs: Date.now(),
    totalNodes: 0,
    totalEdges: 0,
    activeDecisionsCount: 0,
    detectedIncidentsCount: 0,
    milestones: [],
    nodes: [],
    edges: [],
  });
}

async function fetchNodesAndEdges(
  graph: string,
  asOf: string,
  cutoffMs: number,
  nLimit: number,
  eLimit: number,
): Promise<{
  milestoneRows: MilestoneRow[];
  nodeRows: NodeRow[];
  validEdges: EdgeRow[];
}> {
  const [milestoneRows, nodeRows] = await Promise.all([
    query<MilestoneRow>(graph, milestonesStatement).catch(() => []),
    query<NodeRow>(graph, nodesStatement, {
      asOf,
      asOfMs: cutoffMs,
      limit: nLimit,
    }).catch(() => []),
  ]);
  const nodeIds = nodeRows.map((n) => n.id);
  const edgeRows = nodeIds.length
    ? await query<EdgeRow>(graph, edgesStatement, {
        nodeIds,
        asOf,
        limit: eLimit,
      }).catch(() => [])
    : [];
  const validNodeIds = new Set(nodeRows.map((n) => n.id));
  const validEdges = edgeRows.filter(
    (e) => validNodeIds.has(e.from) && validNodeIds.has(e.to),
  );
  return { milestoneRows, nodeRows, validEdges };
}

export async function queryTimeline(
  graphOrOptions: string | TimelineOptions,
  repositoryOrCutoff?: string | number,
  requestedCutoffMs?: number,
  nodeLimit = 150,
  edgeLimit = 200,
): Promise<TimelineReport> {
  const args = resolveTimelineArgs(
    graphOrOptions,
    repositoryOrCutoff,
    requestedCutoffMs,
    nodeLimit,
    edgeLimit,
  );
  const { minMs, maxMs } = await queryBoundsMs(args.graph);
  if (!Number.isFinite(minMs) || maxMs <= 0) {
    return buildEmptyReport(args.repository);
  }

  const effectiveCutoffMs = args.cutoffMs !== undefined ? args.cutoffMs : maxMs;
  const asOf = new Date(effectiveCutoffMs).toISOString();
  const { milestoneRows, nodeRows, validEdges } = await fetchNodesAndEdges(
    args.graph,
    asOf,
    effectiveCutoffMs,
    args.nLimit,
    args.eLimit,
  );

  const activeDecisions = milestoneRows.filter(
    (m) => m.kind === "decision" && m.timestamp <= asOf,
  ).length;
  const detectedIncidents = milestoneRows.filter(
    (m) => m.kind === "incident" && m.timestamp <= asOf,
  ).length;

  return timelineReportSchema.parse({
    repository: args.repository,
    isEmpty: false,
    earliest: new Date(minMs).toISOString(),
    latest: new Date(maxMs).toISOString(),
    cutoff: asOf,
    cutoffMs: effectiveCutoffMs,
    totalNodes: nodeRows.length,
    totalEdges: validEdges.length,
    activeDecisionsCount: activeDecisions,
    detectedIncidentsCount: detectedIncidents,
    milestones: milestoneRows,
    nodes: nodeRows,
    edges: validEdges,
  });
}
