import { graphStep, query } from "../../graph/src/client.js";

export type CandidateScope = {
  source_comment_id: string;
  file_ids: string[];
  function_ids: string[];
};

export type ResolvedScope = CandidateScope & {
  resolved_file_ids: string[];
  resolved_function_ids: string[];
};

export async function verifyDecisionEvidence(
  graph: string,
  sourceIds: string[],
  targetIds: string[],
) {
  if (!targetIds.length) return false;
  if (!sourceIds.length) throw new Error("A decision needs source comments");
  const [sources, files, functions] = await Promise.all([
    graphStep("verify decision source comments", () =>
      query<{ id: string }>(
        graph,
        "MATCH (comment:Comment) WHERE comment.id IN $ids RETURN comment.id AS id",
        { ids: sourceIds },
      ),
    ),
    graphStep("verify decision file targets", () =>
      query<{ id: string }>(
        graph,
        "MATCH (file:File) WHERE file.id IN $ids RETURN file.id AS id",
        { ids: targetIds },
      ),
    ),
    graphStep("verify decision function targets", () =>
      query<{ id: string }>(
        graph,
        "MATCH (fn:Function) WHERE fn.id IN $ids RETURN fn.id AS id",
        { ids: targetIds },
      ),
    ),
  ]);
  requireExisting(graph, "source comments", sourceIds, sources);
  requireExisting(graph, "scope targets", targetIds, [...files, ...functions]);
  return true;
}

function requireExisting(
  graph: string,
  kind: string,
  expected: string[],
  rows: { id: string }[],
) {
  const existing = new Set(rows.map(({ id }) => id));
  const missing = expected.filter((id) => !existing.has(id));
  if (missing.length)
    throw new Error(
      `Decision ${kind} missing from ${graph}: ${missing.join(", ")}`,
    );
}

export async function resolveGraphScopes(
  graph: string,
  candidates: CandidateScope[],
): Promise<ResolvedScope[]> {
  const fileIds = [...new Set(candidates.flatMap(({ file_ids }) => file_ids))];
  const functionIds = [
    ...new Set(candidates.flatMap(({ function_ids }) => function_ids)),
  ];
  const sourceIds = [
    ...new Set(candidates.map(({ source_comment_id }) => source_comment_id)),
  ];
  const sources = await graphStep("resolve source comments", () =>
    query<{ id: string }>(
      graph,
      "MATCH (comment:Comment) WHERE comment.id IN $ids RETURN comment.id AS id",
      { ids: sourceIds },
    ),
  );
  const files = await graphStep("resolve candidate files", () =>
    query<{ id: string }>(
      graph,
      "MATCH (file:File) WHERE file.id IN $ids RETURN file.id AS id",
      { ids: fileIds },
    ),
  );
  const functions = await graphStep("resolve candidate functions", () =>
    query<{ id: string }>(
      graph,
      "MATCH (fn:Function) WHERE fn.id IN $ids RETURN fn.id AS id",
      { ids: functionIds },
    ),
  );
  const existing = new Set(
    [...sources, ...files, ...functions].map(({ id }) => id),
  );
  const missing = [...sourceIds, ...fileIds, ...functionIds].filter(
    (id) => !existing.has(id),
  );
  if (missing.length)
    throw new Error(
      `Candidate scope nodes are missing from ${graph}: ${missing.join(", ")}`,
    );
  return candidates.map((candidate) => ({
    ...candidate,
    resolved_file_ids: candidate.file_ids,
    resolved_function_ids: candidate.function_ids,
  }));
}
