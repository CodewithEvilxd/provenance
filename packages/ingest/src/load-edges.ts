import type { IngestionRecords } from "./records.js";
import {
  authoredEdge,
  commentId,
  personId,
  type EdgeRow,
} from "./load-writes.js";

function authoredEdges(records: IngestionRecords) {
  const authored: EdgeRow[] = [];
  for (const commit of records.commits)
    authored.push(
      ...authoredEdge(
        commit.author?.login,
        `commit:${commit.sha}`,
        commit.commit.author?.date,
      ),
    );
  for (const pull of records.pulls)
    authored.push(
      ...authoredEdge(pull.user?.login, `pr:${pull.number}`, pull.created_at),
    );
  for (const issue of records.issues)
    authored.push(
      ...authoredEdge(
        issue.user?.login,
        `issue:${issue.number}`,
        issue.created_at,
      ),
    );
  for (const comments of records.reviewComments.values())
    for (const entry of comments)
      authored.push(
        ...authoredEdge(
          entry.user?.login,
          commentId(entry.id, "review"),
          entry.created_at,
        ),
      );
  for (const comments of records.issueComments.values())
    for (const entry of comments)
      authored.push(
        ...authoredEdge(
          entry.user?.login,
          commentId(entry.id, "issue"),
          entry.created_at,
        ),
      );
  for (const comments of records.commitComments.values())
    for (const entry of comments)
      authored.push(
        ...authoredEdge(
          entry.user?.login,
          commentId(entry.id, "commit"),
          entry.created_at,
        ),
      );
  return authored;
}

function reviewedEdges(records: IngestionRecords): EdgeRow[] {
  const reviewed: EdgeRow[] = [];
  for (const pull of records.pulls)
    for (const review of records.reviews.get(pull.number) ?? []) {
      if (review.user?.login && review.submitted_at)
        reviewed.push({
          from: personId(review.user.login),
          to: `pr:${pull.number}`,
          props: {
            state: review.state.toLowerCase(),
            valid_from: review.submitted_at,
            valid_to: null,
          },
        });
    }
  return reviewed;
}

function containsEdges(records: IngestionRecords): EdgeRow[] {
  const contains: EdgeRow[] = [];
  for (const pull of records.pulls)
    for (const commit of records.pullCommits.get(pull.number) ?? []) {
      contains.push({
        from: `pr:${pull.number}`,
        to: `commit:${commit.sha}`,
        props: {
          valid_from: pull.merged_at ?? commit.commit.author?.date ?? null,
          valid_to: null,
        },
      });
    }
  return contains;
}

function discussionEdges(records: IngestionRecords): EdgeRow[] {
  const discussion: EdgeRow[] = [];
  for (const pull of records.pulls)
    for (const entry of records.reviewComments.get(pull.number) ?? []) {
      discussion.push({
        from: commentId(entry.id, "review"),
        to: `pr:${pull.number}`,
        props: { valid_from: entry.created_at, valid_to: null },
      });
    }
  for (const issue of records.issues)
    for (const entry of records.issueComments.get(issue.number) ?? []) {
      discussion.push({
        from: commentId(entry.id, "issue"),
        to: `issue:${issue.number}`,
        props: { valid_from: entry.created_at, valid_to: null },
      });
    }
  for (const [sha, comments] of records.commitComments)
    for (const entry of comments) {
      discussion.push({
        from: commentId(entry.id, "commit"),
        to: `commit:${sha}`,
        props: { valid_from: entry.created_at, valid_to: null },
      });
    }
  return discussion;
}

function modifiedEdges(records: IngestionRecords): EdgeRow[] {
  const modified: EdgeRow[] = [];
  for (const detail of records.details)
    for (const file of detail.files) {
      modified.push({
        from: `commit:${detail.sha}`,
        to: `file:${file.filename}`,
        props: {
          additions: file.additions,
          deletions: file.deletions,
          valid_from: detail.commit.author?.date ?? null,
          valid_to: null,
        },
      });
    }
  for (const edge of records.modifiedFunctions) {
    modified.push({
      from: edge.commit,
      to: edge.fn,
      props: {
        approx: true,
        lines_changed: edge.lines_changed,
        valid_from: edge.valid_from,
        valid_to: null,
      },
    });
  }
  return modified;
}

function functionEdges(records: IngestionRecords) {
  const inFile = records.functions.map((fn): EdgeRow => ({
    from: fn.id,
    to: `file:${fn.path}`,
    props: { valid_from: null, valid_to: null },
  }));
  const calls = records.calls.map((call): EdgeRow => ({
    from: call.caller,
    to: call.callee,
    props: { confidence: call.confidence, valid_from: null, valid_to: null },
  }));
  return { inFile, calls };
}

export function edgeGroups(records: IngestionRecords): [string, EdgeRow[]][] {
  const { inFile, calls } = functionEdges(records);
  return [
    ["AUTHORED", authoredEdges(records)],
    ["REVIEWED", reviewedEdges(records)],
    ["CONTAINS", containsEdges(records)],
    ["MODIFIED", modifiedEdges(records)],
    ["ON", discussionEdges(records)],
    ["IN", inFile],
    ["CALLS", calls],
  ];
}
