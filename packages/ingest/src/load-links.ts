import type { IngestionRecords } from "./records.js";
import type { EdgeRow } from "./load-writes.js";

function references(text: string) {
  return [...text.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
}

function targetId(number: number, pulls: Set<number>, issues: Set<number>) {
  if (pulls.has(number)) return `pr:${number}`;
  if (issues.has(number)) return `issue:${number}`;
}

function mentionEdges(records: IngestionRecords): EdgeRow[] {
  const pullNumbers = new Set(records.pulls.map((pull) => pull.number));
  const issueNumbers = new Set(records.issues.map((issue) => issue.number));
  const edges: EdgeRow[] = [];
  for (const pull of records.pulls) {
    for (const number of references(`${pull.title}\n${pull.body ?? ""}`)) {
      const target = targetId(number, pullNumbers, issueNumbers);
      if (target && number !== pull.number)
        edges.push({
          from: `pr:${pull.number}`,
          to: target,
          props: { valid_from: pull.created_at, valid_to: null },
        });
    }
  }
  for (const issue of records.issues) {
    for (const number of references(`${issue.title}\n${issue.body ?? ""}`)) {
      const target = targetId(number, pullNumbers, issueNumbers);
      if (target && number !== issue.number)
        edges.push({
          from: `issue:${issue.number}`,
          to: target,
          props: { valid_from: issue.created_at, valid_to: null },
        });
    }
  }
  return edges;
}

function fixesEdges(records: IngestionRecords): EdgeRow[] {
  const issueNumbers = new Set(records.issues.map((issue) => issue.number));
  const edges: EdgeRow[] = [];
  for (const pull of records.pulls) {
    const text = `${pull.title}\n${pull.body ?? ""}`;
    for (const match of text.matchAll(
      /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi,
    )) {
      const number = Number(match[1]);
      if (issueNumbers.has(number))
        edges.push({
          from: `pr:${pull.number}`,
          to: `issue:${number}`,
          props: {
            valid_from: pull.merged_at ?? pull.created_at,
            valid_to: null,
          },
        });
    }
  }
  return edges;
}

function revertEdges(records: IngestionRecords): EdgeRow[] {
  const pullForCommit = new Map<string, number>();
  for (const [number, commits] of records.pullCommits)
    for (const commit of commits) pullForCommit.set(commit.sha, number);
  const pullNumbers = new Set(records.pulls.map((pull) => pull.number));
  const edges: EdgeRow[] = [];
  for (const pull of records.pulls) {
    const text = `${pull.title}\n${pull.body ?? ""}`;
    const reference = /This reverts commit ([0-9a-f]{7,40})/i.exec(text)?.[1];
    const commit =
      reference &&
      [...pullForCommit.keys()].find((sha) => sha.startsWith(reference));
    const linkedPull = commit
      ? pullForCommit.get(commit)
      : references(text).find((number) => pullNumbers.has(number));
    if (linkedPull && linkedPull !== pull.number)
      edges.push({
        from: `pr:${pull.number}`,
        to: `pr:${linkedPull}`,
        props: {
          valid_from: pull.merged_at ?? pull.created_at,
          valid_to: null,
        },
      });
  }
  return edges;
}

export function linkGroups(records: IngestionRecords): [string, EdgeRow[]][] {
  return [
    ["MENTIONS", mentionEdges(records)],
    ["FIXES", fixesEdges(records)],
    ["REVERTS", revertEdges(records)],
  ];
}
