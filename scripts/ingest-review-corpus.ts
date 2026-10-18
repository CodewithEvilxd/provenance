import { closeGraphClient, query } from "../packages/graph/src/client.js";
import { createSchema } from "../packages/graph/src/schema.js";
import {
  authoredEdge,
  personId,
  writeEdges,
  writeNodes,
} from "../packages/ingest/src/load-writes.js";
import corpus from "../tests/corpus-measurements/vercel-nextjs-preparation.json" with { type: "json" };

const graph = process.env.PROVENANCE_GRAPH ?? `repo:${corpus.repository}`;
const comments = corpus.threads.flatMap((thread) =>
  thread.comments.map((comment) => ({
    ...comment,
    pull_number: thread.pull_number,
  })),
);
const people = new Map<
  string,
  { login: string; first_seen: string; last_seen: string }
>();
for (const comment of comments) {
  if (!comment.author) continue;
  const person = people.get(comment.author);
  const dates = [person?.first_seen, comment.created_at]
    .filter((date): date is string => Boolean(date))
    .sort();
  people.set(comment.author, {
    login: comment.author,
    first_seen: dates[0]!,
    last_seen: dates.at(-1)!,
  });
}

async function counts() {
  const labels = ["Person", "PR", "Comment", "File", "Decision"];
  return Object.fromEntries(
    await Promise.all(
      labels.map(async (label) => {
        const rows = await query<{ count: number }>(
          graph,
          `MATCH (node:${label}) RETURN count(node) AS count`,
        );
        return [label, rows[0]?.count ?? 0];
      }),
    ),
  );
}

try {
  await createSchema(graph);
  await writeNodes(
    graph,
    "Person",
    [...people].map(([login, props]) => ({
      id: personId(login),
      props: { ...props, name: null, email_hash: null },
    })),
  );
  await writeNodes(
    graph,
    "PR",
    corpus.pulls.map((pull) => ({
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
    })),
  );
  await writeNodes(
    graph,
    "Comment",
    comments.map((comment) => ({
      id: comment.id,
      props: {
        body: comment.body,
        url: comment.url,
        created_at: comment.created_at,
        kind: "review",
        path: comment.path,
        line: comment.line,
        is_bot: comment.is_bot,
      },
    })),
  );
  await writeNodes(
    graph,
    "File",
    corpus.candidate_files.map((id) => ({
      id,
      props: {
        path: id.slice(5),
        language: id.split(".").at(-1) ?? null,
        first_seen: null,
        last_seen: null,
      },
    })),
  );
  await writeEdges(
    graph,
    "AUTHORED",
    comments.flatMap((comment) =>
      authoredEdge(comment.author, comment.id, comment.created_at),
    ),
  );
  await writeEdges(
    graph,
    "ON",
    comments.map((comment) => ({
      from: comment.id,
      to: `pr:${comment.pull_number}`,
      props: { valid_from: comment.created_at, valid_to: null },
    })),
  );
  process.stdout.write(
    `${JSON.stringify({ repository: corpus.repository, graph, counts: await counts() })}\n`,
  );
} finally {
  await closeGraphClient();
}
