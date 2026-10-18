import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { activeDecisions, graphCounts, resolveTargetRows } =
  await import("../../packages/graph/src/queries.js");
const manifest = (
  await import(
    "../../tests/corpus-measurements/vercel-nextjs-preparation.json",
    {
      with: { type: "json" },
    }
  )
).default;
const graph = `repo:${manifest.repository}`;
const candidates = [99234, 99227, 98862];
const report = [];
for (const number of candidates) {
  const threads = manifest.threads.filter(
    (thread) => thread.pull_number === number,
  );
  const paths = [
    ...new Set(threads.flatMap((thread) => thread.changed_file_paths)),
  ];
  const targets = await resolveTargetRows(graph, paths);
  const decisions = await activeDecisions(
    graph,
    targets.flatMap(({ functionIds }) => functionIds),
    paths,
  );
  report.push({
    pull: number,
    paths,
    parsedFunctions: new Set(targets.flatMap(({ functionIds }) => functionIds))
      .size,
    decisions: decisions.map(({ id, summary, target }) => ({
      id,
      summary,
      target,
    })),
  });
}
report.push({ graph: await graphCounts(graph) });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
