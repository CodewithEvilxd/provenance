import type { EdgeRow, NodeRow } from "./load-writes.js";

export type IncidentRows = {
  nodes: NodeRow[];
  edges: {
    causedBy: EdgeRow[];
    reportedIn: EdgeRow[];
    resolvedBy: EdgeRow[];
    reverts: EdgeRow[];
  };
};

export function incident(
  id: string,
  title: string,
  kind: string,
  heuristic: string,
  detectedAt: string,
): NodeRow {
  return {
    id,
    props: {
      title,
      kind,
      heuristic,
      detected_at: detectedAt,
      severity_guess: null,
    },
  };
}

export function causedBy(
  incidentId: string,
  pull: number,
  at: string,
): EdgeRow {
  return {
    from: incidentId,
    to: `pr:${pull}`,
    props: { valid_from: at, valid_to: null },
  };
}

export function incidentRows(): IncidentRows {
  return {
    nodes: [],
    edges: { causedBy: [], reportedIn: [], resolvedBy: [], reverts: [] },
  };
}
