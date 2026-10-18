import { query, type GraphParameters } from "../../graph/src/client.js";

export type NodeRow = { id: string; props: GraphParameters };
export type EdgeRow = { from: string; to: string; props: GraphParameters };

export async function writeNodes(
  graph: string,
  label: string,
  rows: readonly NodeRow[],
) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    await query(
      graph,
      `UNWIND $rows AS row MERGE (n:${label} {id: row.id}) SET n += row.props`,
      { rows: rows.slice(offset, offset + 500) },
    );
  }
}

export async function writeEdges(
  graph: string,
  type: string,
  rows: readonly EdgeRow[],
) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    await query(
      graph,
      `UNWIND $rows AS row MATCH (a {id: row.from}) MATCH (b {id: row.to}) MERGE (a)-[r:${type}]->(b) SET r += row.props`,
      { rows: rows.slice(offset, offset + 500) },
    );
  }
}

export function personId(login: string) {
  return `person:${login}`;
}

export function commentId(id: number, kind: string) {
  return `comment:${kind}:${id}`;
}

export function authoredEdge(
  login: string | null | undefined,
  target: string,
  at: string | null | undefined,
): EdgeRow[] {
  if (!login || !at) return [];
  return [
    {
      from: personId(login),
      to: target,
      props: { valid_from: at, valid_to: null },
    },
  ];
}
