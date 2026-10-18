import { createHash } from "node:crypto";
import type { Pull, ReviewComment } from "../../ingest/src/github.js";
import { qualifiesComment } from "./review-filter.js";

type ChangedFile = { filename: string };
type PreparedComment = {
  id: string;
  url: string;
  author: string | null;
  is_bot: boolean;
  created_at: string;
  body: string;
  path: string;
  line: number | null;
  review_id: number | null;
  root_comment_id: number;
  in_reply_to_id: number | null;
  candidate_file_ids: string[];
  candidate_function_ids: string[];
  scope_resolution: "comment_path" | "pull_changed_files";
  scope_basis: "current_head" | "original_commit" | "file_fallback";
  scope_uncertainty: string | null;
  commit_id: string | null;
  original_commit_id: string | null;
  line_at_review: number | null;
};
type PreparedThread = {
  id: string;
  pull_number: number;
  pull_url: string;
  title: string;
  body: string;
  comments: PreparedComment[];
  candidate_file_ids: string[];
  candidate_function_ids: string[];
  changed_file_paths: string[];
};

function sourceId(comment: ReviewComment) {
  return `comment:review:${comment.id}`;
}

function threadRoot(comment: ReviewComment, byId: Map<number, ReviewComment>) {
  let root = comment;
  while (root.in_reply_to_id && byId.has(root.in_reply_to_id))
    root = byId.get(root.in_reply_to_id)!;
  return root.id;
}

function fileIds(comments: ReviewComment[], files: ChangedFile[]) {
  const changed = new Set(files.map(({ filename }) => filename));
  const exact = comments
    .map(({ path }) => path)
    .filter((path) => changed.has(path));
  const paths = exact.length ? exact : [...changed];
  return [...new Set(paths)].sort().map((path) => `file:${path}`);
}

function eligibleComments(comments: ReviewComment[]) {
  return comments.filter((comment) =>
    qualifiesComment(
      comment.body,
      comment.user?.type === "Bot" ||
        /\[bot\]$/i.test(comment.user?.login ?? ""),
    ),
  );
}

function groupedComments(comments: ReviewComment[]) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const groups = new Map<number, ReviewComment[]>();
  for (const comment of eligibleComments(comments)) {
    const root = threadRoot(comment, byId);
    groups.set(root, [...(groups.get(root) ?? []), comment]);
  }
  return groups;
}

function preparedComment(
  repository: string,
  pull: Pull,
  comment: ReviewComment,
  root: number,
  files: ChangedFile[],
): PreparedComment {
  return {
    id: sourceId(comment),
    url:
      comment.html_url ??
      `https://github.com/${repository}/pull/${pull.number}#discussion_r${comment.id}`,
    author: comment.user?.login ?? null,
    is_bot:
      comment.user?.type === "Bot" ||
      /\[bot\]$/i.test(comment.user?.login ?? ""),
    created_at: comment.created_at,
    body: comment.body,
    path: comment.path,
    line: comment.line,
    review_id: comment.pull_request_review_id ?? null,
    root_comment_id: root,
    in_reply_to_id: comment.in_reply_to_id ?? null,
    candidate_file_ids: fileIds([comment], files),
    candidate_function_ids: [],
    scope_resolution: files.some(({ filename }) => filename === comment.path)
      ? "comment_path"
      : "pull_changed_files",
    scope_basis: "file_fallback",
    scope_uncertainty: null,
    commit_id: comment.commit_id ?? null,
    original_commit_id: comment.original_commit_id ?? null,
    line_at_review: comment.original_line ?? comment.line,
  };
}

function preparedThread(
  repository: string,
  pull: Pull,
  root: number,
  entries: ReviewComment[],
  files: ChangedFile[],
): PreparedThread {
  const ordered = entries.sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  return {
    id: `review-thread:${pull.number}:${root}`,
    pull_number: pull.number,
    pull_url:
      pull.html_url ?? `https://github.com/${repository}/pull/${pull.number}`,
    title: pull.title,
    body: pull.body ?? "",
    comments: ordered.map((comment) =>
      preparedComment(repository, pull, comment, root, files),
    ),
    candidate_file_ids: fileIds(ordered, files),
    candidate_function_ids: [],
    changed_file_paths: [
      ...new Set(files.map(({ filename }) => filename)),
    ].sort(),
  };
}

export function prepareReviewThreads(
  repository: string,
  pulls: Pull[],
  commentsByPull: Map<number, ReviewComment[]>,
  filesByPull: Map<number, ChangedFile[]>,
) {
  const threads: PreparedThread[] = [];
  for (const pull of pulls) {
    const comments = commentsByPull.get(pull.number) ?? [];
    const files = filesByPull.get(pull.number) ?? [];
    for (const [root, entries] of groupedComments(comments))
      threads.push(preparedThread(repository, pull, root, entries, files));
  }
  return threads.sort(
    (left, right) =>
      left.pull_number - right.pull_number || left.id.localeCompare(right.id),
  );
}

export function preparationHash(threads: PreparedThread[]) {
  return createHash("sha256").update(JSON.stringify(threads)).digest("hex");
}
