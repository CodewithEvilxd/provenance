import type { IngestionRecords } from "./records.js";
import {
  causedBy,
  incident,
  incidentRows,
  type IncidentRows,
} from "./incident-records.js";

const revertCommit = /This reverts commit ([0-9a-f]{7,40})/i;
const revertTitle = /^Revert\s+"(.+)"$/i;

export function revertedCommit(message: string) {
  return revertCommit.exec(message)?.[1];
}

function pullReverts(
  records: IngestionRecords,
  pullByCommit: Map<string, number>,
) {
  const rows = incidentRows();
  for (const pull of records.pulls) {
    const at = pull.merged_at ?? pull.closed_at ?? pull.created_at;
    const commits = records.pullCommits.get(pull.number) ?? [];
    const revertedSha =
      revertedCommit(pull.body ?? "") ??
      records.details
        .filter((detail) => commits.some((commit) => commit.sha === detail.sha))
        .map((detail) => revertedCommit(detail.commit.message))
        .find(Boolean);
    const title = revertTitle.exec(pull.title)?.[1];
    const cause =
      (revertedSha && pullByCommit.get(revertedSha)) ??
      records.pulls.find((candidate) => candidate.title === title)?.number;
    if (!cause || cause === pull.number) continue;
    const id = `incident:revert:pr:${pull.number}`;
    rows.nodes.push(
      incident(id, pull.title, "revert", "revert PR reference", at),
    );
    rows.edges.causedBy.push(causedBy(id, cause, at));
    rows.edges.reverts.push({
      from: `pr:${pull.number}`,
      to: `pr:${cause}`,
      props: { valid_from: at, valid_to: null },
    });
  }
  return rows;
}

function commitReverts(
  records: IngestionRecords,
  pullByCommit: Map<string, number>,
) {
  const rows = incidentRows();
  for (const detail of records.details) {
    const targetSha = revertedCommit(detail.commit.message);
    const at = detail.commit.author?.date;
    if (!targetSha || !at) continue;
    const title = revertTitle.exec(detail.commit.message)?.[1];
    const cause =
      pullByCommit.get(targetSha) ??
      records.pulls.find((pull) => pull.title === title)?.number;
    const reverter = pullByCommit.get(detail.sha);
    const id = `incident:revert:${reverter ? `pr:${reverter}` : `commit:${detail.sha}`}`;
    rows.nodes.push(
      incident(
        id,
        detail.commit.message.split("\n")[0] ?? "Revert",
        "revert",
        "revert commit reference",
        at,
      ),
    );
    if (cause) rows.edges.causedBy.push(causedBy(id, cause, at));
    rows.edges.resolvedBy.push({
      from: id,
      to: `commit:${detail.sha}`,
      props: { valid_from: at, valid_to: null },
    });
    if (reverter && cause)
      rows.edges.reverts.push({
        from: `pr:${reverter}`,
        to: `pr:${cause}`,
        props: { valid_from: at, valid_to: null },
      });
  }
  return rows;
}

function combine(sections: IncidentRows[]): IncidentRows {
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

export function revertIncidents(
  records: IngestionRecords,
  pullByCommit: Map<string, number>,
) {
  return combine([
    pullReverts(records, pullByCommit),
    commitReverts(records, pullByCommit),
  ]);
}
