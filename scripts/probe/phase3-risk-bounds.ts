import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const [
  { pullFiles },
  { activeDecisions, blastRadius, incidentHistory },
  { query, closeGraphClient },
  { riskScore },
] = await Promise.all([
  import("../../packages/ingest/src/github-discussions.js"),
  import("../../packages/graph/src/queries.js"),
  import("../../packages/graph/src/client.js"),
  import("../../packages/agents/src/risk.js"),
]);
const graph = "repo:vitejs/vite";
const changeRange = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g;
const results = [];
for (const pr of [22832, 23198]) {
  const files = await pullFiles("vitejs", "vite", pr);
  const functions = await query<{
    id: string;
    path: string;
    start: number;
    end: number;
  }>(
    graph,
    "MATCH (fn:Function) WHERE fn.path IN $paths RETURN fn.id AS id, fn.path AS path, fn.start_line AS start, fn.end_line AS end",
    { paths: files.map(({ filename }) => filename) },
  );
  const changed = functions.filter((fn) =>
    files.some(
      (file) =>
        file.filename === fn.path &&
        [...(file.patch ?? "").matchAll(changeRange)].some((match) => {
          const start = Number(match[1]);
          return start <= fn.end && start + Number(match[2] ?? 1) >= fn.start;
        }),
    ),
  );
  const ids = changed.map(({ id }) => id);
  const [blastRows, incidents, decisions] = await Promise.all([
    Promise.all(ids.map((id) => blastRadius(graph, id))),
    incidentHistory(graph, ids),
    activeDecisions(
      graph,
      ids,
      files.map(({ filename }) => filename),
    ),
  ]);
  const blast = [
    ...new Map(blastRows.flat().map((row) => [row.id, row])).values(),
  ];
  const direct = incidents.some(
    ({ fn, at }) =>
      ids.includes(fn) && Date.now() - Date.parse(at) <= 365 * 86400000,
  );
  const linesChanged = files.reduce(
    (sum, file) => sum + file.additions + file.deletions,
    0,
  );
  const lower = riskScore({
    blastRadius: blast.length,
    weightedIncidents: incidents.length,
    decisions: decisions.map(({ strength }) => ({
      strength: strength as "hard" | "soft",
      violated: false,
    })),
    authorKnowledge: 0,
    linesChanged,
    recentDirectIncident: direct,
  });
  const upper = riskScore({
    blastRadius: blast.length,
    weightedIncidents: incidents.length,
    decisions: decisions.map(({ strength }) => ({
      strength: strength as "hard" | "soft",
      violated: true,
    })),
    authorKnowledge: 0,
    linesChanged,
    recentDirectIncident: direct,
  });
  results.push({
    pr,
    changedFunctions: ids,
    blastRadius: blast.length,
    incidents: incidents.length,
    directIncident: direct,
    activeDecisions: decisions.map(({ id, strength, target }) => ({
      id,
      strength,
      target,
    })),
    linesChanged,
    riskWithoutViolationsAndWithNoAuthorKnowledge: lower,
    upperBoundIfEveryDecisionIsViolatedAndNoAuthorKnowledge: upper,
  });
}
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
await closeGraphClient();
