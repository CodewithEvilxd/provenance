import type { IngestionRecords } from "./records.js";
import { hotfixIncidents } from "./incident-hotfixes.js";
import { regressionIncidents } from "./incident-regressions.js";
import { revertIncidents } from "./incident-reverts.js";

export { revertedCommit } from "./incident-reverts.js";

export function detectIncidents(
  records: IngestionRecords,
  associatedPulls: Map<string, number[]> = new Map(),
) {
  const pullByCommit = new Map<string, number>();
  for (const [number, commits] of records.pullCommits)
    for (const commit of commits) pullByCommit.set(commit.sha, number);
  for (const [sha, numbers] of associatedPulls)
    if (numbers[0]) pullByCommit.set(sha, numbers[0]);
  const functionsByPull = new Map<number, Set<string>>();
  for (const edge of records.modifiedFunctions) {
    const number = pullByCommit.get(edge.commit.replace(/^commit:/, ""));
    if (!number) continue;
    const functions = functionsByPull.get(number) ?? new Set<string>();
    functions.add(edge.fn);
    functionsByPull.set(number, functions);
  }
  const sections = [
    revertIncidents(records, pullByCommit),
    hotfixIncidents(records, functionsByPull),
    regressionIncidents(records),
  ];
  return {
    nodes: sections.flatMap((section) => section.nodes),
    edges: {
      causedBy: sections.flatMap((section) => section.edges.causedBy),
      reportedIn: sections.flatMap((section) => section.edges.reportedIn),
      resolvedBy: sections.flatMap((section) => section.edges.resolvedBy),
      reverts: sections.flatMap((section) => section.edges.reverts),
    },
  };
}
