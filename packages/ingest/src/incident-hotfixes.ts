import type { IngestionRecords } from "./records.js";
import { causedBy, incident, incidentRows } from "./incident-records.js";

const issueReference =
  /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)\b/gi;

function issueNumbers(text: string) {
  return [...text.matchAll(issueReference)].map((match) => Number(match[1]));
}

function hotfix(pull: IngestionRecords["pulls"][number]) {
  return (
    /\bhotfix\b/i.test(pull.title) ||
    (pull.labels ?? []).some((label) =>
      (label.name ?? "").toLowerCase().includes("hotfix"),
    )
  );
}

function withinTwoWeeks(earlier: string | null, current: string) {
  if (!earlier) return false;
  const age = Date.parse(current) - Date.parse(earlier);
  return age >= 0 && age <= 14 * 86_400_000;
}

export function hotfixIncidents(
  records: IngestionRecords,
  functionsByPull: Map<number, Set<string>>,
) {
  const rows = incidentRows();
  for (const pull of records.pulls) {
    if (!hotfix(pull)) continue;
    const at = pull.merged_at ?? pull.closed_at ?? pull.created_at;
    const issueIds = issueNumbers(`${pull.title}\n${pull.body ?? ""}`);
    for (const issueId of issueIds) {
      const issue = records.issues.find(
        (candidate) => candidate.number === issueId,
      );
      if (!issue) continue;
      const touched = functionsByPull.get(pull.number) ?? new Set<string>();
      for (const earlier of records.pulls) {
        if (
          earlier.number === pull.number ||
          !withinTwoWeeks(earlier.merged_at, at)
        )
          continue;
        const repeatedFunction = [
          ...(functionsByPull.get(earlier.number) ?? []),
        ].some((fn) => touched.has(fn));
        if (!repeatedFunction) continue;
        const id = `incident:hotfix:pr:${pull.number}:cause:${earlier.number}`;
        rows.nodes.push(
          incident(
            id,
            pull.title,
            "hotfix",
            "hotfix overlaps a function changed in the previous 14 days",
            at,
          ),
        );
        rows.edges.causedBy.push(causedBy(id, earlier.number, at));
        rows.edges.reportedIn.push({
          from: id,
          to: `issue:${issue.number}`,
          props: { valid_from: at, valid_to: null },
        });
        rows.edges.resolvedBy.push({
          from: id,
          to: `pr:${pull.number}`,
          props: { valid_from: at, valid_to: null },
        });
      }
    }
  }
  return rows;
}
