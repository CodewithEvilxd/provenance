import type { IngestionRecords } from "./records.js";
import { causedBy, incident, incidentRows } from "./incident-records.js";

const causalReference =
  /\b(?:caused by|introduced in|broke after)\s+#(\d+)\b|\bintroduced\b.{0,80}\bby (?:PR )?#(\d+)\b/i;
const labels = new Set(["regression", "bug", "incident", "hotfix"]);

export function regressionIncidents(records: IngestionRecords) {
  const rows = incidentRows();
  for (const issue of records.issues) {
    const text = `${issue.title}\n${issue.body ?? ""}`;
    const labeled = issue.labels.some((label) =>
      labels.has((label.name ?? "").toLowerCase()),
    );
    const reference = causalReference.exec(text)?.slice(1).find(Boolean);
    if (!labeled && !reference) continue;
    const id = `incident:regression:issue:${issue.number}`;
    rows.nodes.push(
      incident(
        id,
        issue.title,
        "regression",
        labeled ? "regression issue label" : "explicit regression reference",
        issue.created_at,
      ),
    );
    rows.edges.reportedIn.push({
      from: id,
      to: `issue:${issue.number}`,
      props: { valid_from: issue.created_at, valid_to: null },
    });
    const pull = Number(reference);
    if (pull && records.pulls.some((candidate) => candidate.number === pull))
      rows.edges.causedBy.push(causedBy(id, pull, issue.created_at));
  }
  return rows;
}
