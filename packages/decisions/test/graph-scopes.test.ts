import { afterAll, expect, it } from "vitest";
import {
  closeGraphClient,
  query,
  selectGraph,
} from "../../graph/src/client.js";
import { writeNodes } from "../../ingest/src/load-writes.js";
import { reviewComments } from "../../ingest/src/github-discussions.js";
import {
  resolveGraphScopes,
  verifyDecisionEvidence,
} from "../src/scope-resolution.js";
import corpus from "../../../tests/corpus-measurements/vitejs-vite.json" with { type: "json" };
import preparation from "../../../tests/corpus-measurements/vitejs-vite-preparation.json" with { type: "json" };

const graph = `repo:${corpus.repository}`;
const isolated = "test:vite-scope-resolution";
let isolatedGraphReady = false;

function sourceScopes() {
  return preparation.threads.flatMap((thread) =>
    thread.comments.map((comment) => ({
      source_comment_id: comment.id,
      file_ids: comment.candidate_file_ids,
      function_ids: comment.candidate_function_ids,
    })),
  );
}

async function verifyCommentLinks() {
  const references = new Map(
    preparation.threads.flatMap((thread) =>
      thread.comments.map(
        (comment) =>
          [comment.id, { ...comment, pull_url: thread.pull_url }] as const,
      ),
    ),
  );
  const pullNumbers = [
    ...new Set(preparation.threads.map(({ pull_number }) => pull_number)),
  ];
  for (const number of pullNumbers) {
    const sourceComments = await reviewComments("vitejs", "vite", number);
    for (const comment of sourceComments) {
      const reference = references.get(`comment:review:${comment.id}`);
      if (reference)
        expect([reference.url, reference.pull_url]).toEqual([
          comment.html_url,
          `https://github.com/vitejs/vite/pull/${number}`,
        ]);
    }
  }
}

async function verifyStoredSources(
  ids: string[],
  expectedDecisionCount: number,
) {
  const stored = await query<{ id: string }>(
    graph,
    "MATCH (comment:Comment) WHERE comment.id IN $ids RETURN comment.id AS id",
    { ids },
  );
  expect(stored.map(({ id }) => id).sort()).toEqual(
    [...corpus.source_ids].sort(),
  );
  const decisions = await query<{ count: number }>(
    graph,
    "MATCH (decision:Decision) RETURN count(decision) AS count",
  );
  expect(decisions[0]?.count).toBe(expectedDecisionCount);
}

async function sourceFiles(ids: string[]) {
  return query<{
    id: string;
    path: string;
    language: string;
    first_seen: string | null;
    last_seen: string | null;
  }>(
    graph,
    "MATCH (file:File) WHERE file.id IN $ids RETURN file.id AS id, file.path AS path, file.language AS language, file.first_seen AS first_seen, file.last_seen AS last_seen",
    { ids },
  );
}

async function sourceComment(id: string) {
  const comments = await query<{
    id: string;
    body: string;
    created_at: string;
    kind: string;
    path: string;
    line: number | null;
    is_bot: boolean;
  }>(
    graph,
    "MATCH (comment:Comment {id: $id}) RETURN comment.id AS id, comment.body AS body, comment.created_at AS created_at, comment.kind AS kind, comment.path AS path, comment.line AS line, comment.is_bot AS is_bot",
    { id },
  );
  return comments[0];
}

async function seedIsolatedGraph(
  file: Awaited<ReturnType<typeof sourceFiles>>[number],
  comment: NonNullable<Awaited<ReturnType<typeof sourceComment>>>,
) {
  await writeNodes(isolated, "File", [
    {
      id: file.id,
      props: {
        path: file.path,
        language: file.language,
        first_seen: file.first_seen,
        last_seen: file.last_seen,
      },
    },
  ]);
  isolatedGraphReady = true;
  await writeNodes(isolated, "Comment", [
    {
      id: comment.id,
      props: {
        body: comment.body,
        created_at: comment.created_at,
        kind: comment.kind,
        path: comment.path,
        line: comment.line,
        is_bot: comment.is_bot,
      },
    },
  ]);
}

it("resolves measured review scopes to stored Vite graph nodes", async () => {
  const before = await query<{ count: number }>(
    graph,
    "MATCH (decision:Decision) RETURN count(decision) AS count",
  );
  const comments = sourceScopes();
  const scopes = await resolveGraphScopes(graph, comments);
  expect(scopes).toHaveLength(corpus.qualifying_comments);
  expect(scopes.every((scope) => scope.resolved_file_ids.length > 0)).toBe(
    true,
  );
  expect(
    new Set(scopes.flatMap(({ resolved_file_ids }) => resolved_file_ids)).size,
  ).toBe(preparation.candidate_files.length);
  expect(
    new Set(
      scopes.flatMap(({ resolved_function_ids }) => resolved_function_ids),
    ).size,
  ).toBe(preparation.candidate_functions.length);
  expect(
    await verifyDecisionEvidence(
      graph,
      [comments[0]!.source_comment_id],
      [...scopes[0]!.resolved_file_ids, ...scopes[0]!.resolved_function_ids],
    ),
  ).toBe(true);
  expect(
    await verifyDecisionEvidence(graph, [comments[0]!.source_comment_id], []),
  ).toBe(false);
  await verifyStoredSources(
    comments.map(({ source_comment_id }) => source_comment_id),
    before[0]?.count ?? 0,
  );
  await verifyCommentLinks();
});

it("rejects a real Vite file ID that is absent from the target graph", async () => {
  const fileIds = preparation.candidate_files.slice(0, 2);
  const [files, comment] = await Promise.all([
    sourceFiles(fileIds),
    sourceComment(corpus.source_ids[0]!),
  ]);
  expect(files).toHaveLength(2);
  expect(comment).toBeDefined();
  await seedIsolatedGraph(files[0]!, comment!);
  await expect(
    verifyDecisionEvidence(
      isolated,
      [corpus.source_ids[0]!, corpus.source_ids[1]!],
      [files[0]!.id],
    ),
  ).rejects.toThrow(corpus.source_ids[1]!);
  await expect(
    resolveGraphScopes(isolated, [
      {
        source_comment_id: corpus.source_ids[0]!,
        file_ids: fileIds,
        function_ids: [],
      },
    ]),
  ).rejects.toThrow(files[1]!.id);
});

afterAll(async () => {
  if (isolatedGraphReady) await (await selectGraph(isolated)).delete();
  await closeGraphClient();
});
