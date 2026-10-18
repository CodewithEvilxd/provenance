import { createHash } from "node:crypto";
import type { IngestionRecords } from "./records.js";
import { commentId, personId, type NodeRow } from "./load-writes.js";

function peopleNodes(records: IngestionRecords) {
  const people = new Map<string, NodeRow>();
  const add = (
    login: string | null | undefined,
    at: string | null | undefined,
    fullName?: string | null,
    email?: string | null,
  ) => {
    if (!login) return;
    const id = personId(login);
    const previous = people.get(id)?.props;
    const dates = [previous?.first_seen, at]
      .filter((date): date is string => typeof date === "string")
      .sort();
    people.set(id, {
      id,
      props: {
        login,
        name: fullName ?? previous?.name ?? null,
        email_hash: email
          ? createHash("sha256").update(email.toLowerCase()).digest("hex")
          : (previous?.email_hash ?? null),
        first_seen: dates[0] ?? null,
        last_seen: dates.at(-1) ?? null,
      },
    });
  };
  for (const commit of records.commits)
    add(
      commit.author?.login,
      commit.commit.author?.date,
      commit.commit.author?.name,
      commit.commit.author?.email,
    );
  for (const pull of records.pulls) add(pull.user?.login, pull.created_at);
  for (const issue of records.issues) add(issue.user?.login, issue.created_at);
  for (const reviews of records.reviews.values())
    for (const review of reviews) add(review.user?.login, review.submitted_at);
  for (const comments of records.reviewComments.values())
    for (const entry of comments) add(entry.user?.login, entry.created_at);
  for (const comments of records.issueComments.values())
    for (const entry of comments) add(entry.user?.login, entry.created_at);
  for (const comments of records.commitComments.values())
    for (const entry of comments) add(entry.user?.login, entry.created_at);
  return [...people.values()];
}

function commitNodes(records: IngestionRecords): NodeRow[] {
  const details = new Map(
    records.details.map((detail) => [detail.sha, detail]),
  );
  return records.commits.map((commit) => ({
    id: `commit:${commit.sha}`,
    props: {
      sha: commit.sha,
      message: commit.commit.message,
      committed_at: commit.commit.author?.date ?? null,
      committed_at_ms: commit.commit.author?.date
        ? Date.parse(commit.commit.author.date)
        : null,
      is_merge: commit.parents.length > 1,
      additions: details.get(commit.sha)?.stats.additions ?? null,
      deletions: details.get(commit.sha)?.stats.deletions ?? null,
    },
  }));
}

function pullNodes(records: IngestionRecords): NodeRow[] {
  return records.pulls.map((pull) => ({
    id: `pr:${pull.number}`,
    props: {
      number: pull.number,
      url: pull.html_url ?? null,
      title: pull.title,
      body: pull.body,
      state: pull.state,
      created_at: pull.created_at,
      merged_at: pull.merged_at,
      closed_at: pull.closed_at,
      base_branch: pull.base.ref,
      additions: pull.additions ?? null,
      deletions: pull.deletions ?? null,
    },
  }));
}

function issueNodes(records: IngestionRecords): NodeRow[] {
  return records.issues.map((issue) => ({
    id: `issue:${issue.number}`,
    props: {
      number: issue.number,
      url: issue.html_url ?? null,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      created_at: issue.created_at,
      closed_at: issue.closed_at,
      labels: issue.labels.flatMap((label) => (label.name ? [label.name] : [])),
    },
  }));
}

function commentNodes(records: IngestionRecords): NodeRow[] {
  const comments: NodeRow[] = [];
  for (const entries of records.reviewComments.values())
    for (const entry of entries) {
      comments.push({
        id: commentId(entry.id, "review"),
        props: {
          body: entry.body,
          url: entry.html_url ?? null,
          created_at: entry.created_at,
          kind: "review",
          path: entry.path,
          line: entry.line,
          is_bot: entry.user?.type === "Bot",
        },
      });
    }
  for (const entries of records.issueComments.values())
    for (const entry of entries) {
      comments.push({
        id: commentId(entry.id, "issue"),
        props: {
          body: entry.body,
          url: entry.html_url ?? null,
          created_at: entry.created_at,
          kind: "issue",
          is_bot: entry.user?.type === "Bot",
        },
      });
    }
  for (const entries of records.commitComments.values())
    for (const entry of entries) {
      comments.push({
        id: commentId(entry.id, "commit"),
        props: {
          body: entry.body,
          url: entry.html_url ?? null,
          created_at: entry.created_at,
          kind: "commit",
          path: entry.path,
          line: entry.position,
          is_bot: entry.user?.type === "Bot",
        },
      });
    }
  return comments;
}

function fileNodes(records: IngestionRecords): NodeRow[] {
  const files = new Map<string, NodeRow>();
  for (const detail of records.details)
    for (const file of detail.files) {
      const id = `file:${file.filename}`;
      const previous = files.get(id)?.props;
      const dates = [previous?.first_seen, detail.commit.author?.date]
        .filter((date): date is string => typeof date === "string")
        .sort();
      files.set(id, {
        id,
        props: {
          path: file.filename,
          language: file.filename.split(".").at(-1) ?? null,
          first_seen: dates[0] ?? null,
          last_seen: dates.at(-1) ?? null,
        },
      });
    }
  for (const fn of records.functions) {
    const id = `file:${fn.path}`;
    const previous = files.get(id)?.props;
    files.set(id, {
      id,
      props: {
        ...previous,
        path: fn.path,
        language: fn.path.split(".").at(-1) ?? null,
        first_seen: previous?.first_seen ?? null,
        last_seen: previous?.last_seen ?? null,
      },
    });
  }
  return [...files.values()];
}

function functionNodes(records: IngestionRecords): NodeRow[] {
  return records.functions.map((fn) => ({
    id: fn.id,
    props: {
      name: fn.name,
      qualified_name: fn.id.slice(fn.id.indexOf("#") + 1),
      path: fn.path,
      start_line: fn.start_line,
      end_line: fn.end_line,
      signature_hash: fn.signature_hash,
      valid_from: null,
      valid_to: null,
    },
  }));
}

export function nodeGroups(records: IngestionRecords): [string, NodeRow[]][] {
  const groups: [string, NodeRow[]][] = [
    ["Person", peopleNodes(records)],
    ["Commit", commitNodes(records)],
    ["PR", pullNodes(records)],
    ["Issue", issueNodes(records)],
    ["Comment", commentNodes(records)],
    ["File", fileNodes(records)],
    ["Function", functionNodes(records)],
  ];
  return groups;
}
