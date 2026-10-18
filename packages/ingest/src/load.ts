import type { IngestionRecords } from "./records.js";
import { edgeGroups } from "./load-edges.js";
import { linkGroups } from "./load-links.js";
import { nodeGroups } from "./load-nodes.js";
import { writeEdges, writeNodes } from "./load-writes.js";

export async function loadRepository(graph: string, records: IngestionRecords) {
  for (const [label, rows] of nodeGroups(records))
    await writeNodes(graph, label, rows);
  for (const [type, rows] of [...edgeGroups(records), ...linkGroups(records)])
    await writeEdges(graph, type, rows);
}
