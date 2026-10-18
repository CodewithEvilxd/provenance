import { existsSync } from "node:fs";
import {
  closeGraphClient,
  GraphStepFailure,
  graphStep,
  query,
} from "../packages/graph/src/client.js";
import { createSchema } from "../packages/graph/src/schema.js";
import { createLlmRouter } from "../packages/llm/src/router.js";
import {
  extractDecisions,
  hasEligibleComment,
  type ExtractionRunReport,
} from "../packages/decisions/src/extract.js";
import { pulls } from "../packages/ingest/src/github.js";
import {
  pullFiles,
  reviewComments,
} from "../packages/ingest/src/github-discussions.js";
import { commentId } from "../packages/ingest/src/load-writes.js";
import vitePreparation from "../tests/corpus-measurements/vitejs-vite-preparation.json" with { type: "json" };
import nextPreparation from "../tests/corpus-measurements/vercel-nextjs-preparation.json" with { type: "json" };

type ExtractionComment = {
  id: string;
  body: string;
  path: string | null;
  line: number | null;
  created_at: string;
  is_bot: boolean;
};
type PreparedThread = {
  pull: { number: number; title: string; body: string | null };
  comments: ExtractionComment[];
};
type ChangedFiles = { number: number; files: string[] };

const argumentsList = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const offline = argumentsList.includes("--offline");
const replayCached = argumentsList.includes("--cached-write");
const limitIndex = argumentsList.indexOf("--limit");
const requestedLimit =
  limitIndex < 0 ? undefined : argumentsList[limitIndex + 1];
const limit = requestedLimit === undefined ? Infinity : Number(requestedLimit);
if (requestedLimit !== undefined && (!Number.isInteger(limit) || limit < 1))
  throw new Error("--limit must be a positive integer");
const offsetIndex = argumentsList.indexOf("--offset");
const requestedOffset =
  offsetIndex < 0 ? undefined : argumentsList[offsetIndex + 1];
const offset = Number(requestedOffset ?? 0);
if (!Number.isInteger(offset) || offset < 0)
  throw new Error("--offset must be a non-negative integer");
const providerIndex = argumentsList.indexOf("--provider");
const providerOverride =
  providerIndex < 0 ? undefined : argumentsList[providerIndex + 1];
const pullsIndex = argumentsList.indexOf("--pulls");
const requestedPulls =
  pullsIndex < 0 ? undefined : argumentsList[pullsIndex + 1];
const pullNumbers = requestedPulls?.split(",").map(Number) ?? [];
if (
  requestedPulls !== undefined &&
  (!requestedPulls ||
    pullNumbers.some((number) => !Number.isSafeInteger(number) || number < 1))
)
  throw new Error(
    "--pulls must be a comma-separated list of positive integers",
  );
const selectedPulls = new Set(pullNumbers);
const repo = argumentsList.find((argument) =>
  /^[\w.-]+\/[\w.-]+$/.test(argument),
);
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo))
  throw new Error("Pass a public repository as owner/name");
const [owner, name] = repo.split("/");
if (!owner || !name) throw new Error("Pass a public repository as owner/name");
const graph = process.env.PROVENANCE_GRAPH ?? `repo:${repo}`;
const runReport: ExtractionRunReport = {
  threadsProcessed: 0,
  skippedThreads: [],
  decisionsPassedVerification: 0,
};

async function batch<T, R>(
  records: T[],
  size: number,
  fetch: (record: T) => Promise<R>,
) {
  const received: R[] = [];
  for (let offset = 0; offset < records.length; offset += size)
    received.push(
      ...(await Promise.all(records.slice(offset, offset + size).map(fetch))),
    );
  return received;
}

const storedPreparation =
  repo === vitePreparation.repository
    ? vitePreparation
    : repo === nextPreparation.repository
      ? nextPreparation
      : undefined;
const availableCandidates: PreparedThread[] = storedPreparation
  ? storedPreparation.threads.map((thread) => ({
      pull: {
        number: thread.pull_number,
        title: thread.title,
        body: thread.body,
      },
      comments: thread.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        path: comment.path,
        line: comment.line,
        created_at: comment.created_at,
        is_bot: comment.is_bot,
      })),
    }))
  : await liveThreads(owner, name);
const candidates = availableCandidates
  .filter(({ pull }) => !selectedPulls.size || selectedPulls.has(pull.number))
  .slice(offset, offset + limit);
const changedFiles: ChangedFiles[] = storedPreparation
  ? candidates.map(({ pull }) => {
      const thread = storedPreparation.threads.find(
        (prepared) => prepared.pull_number === pull.number,
      );
      if (!thread) throw new Error(`Missing prepared pull ${pull.number}`);
      return {
        number: thread.pull_number,
        files: thread.changed_file_paths,
      };
    })
  : await batch(candidates, 4, async ({ pull }) => ({
      number: pull.number,
      files: await pullFiles(owner, name, pull.number).then((files) =>
        files.map((file) => file.filename),
      ),
    }));
try {
  if (!offline)
    await graphStep("create extraction graph schema", () =>
      createSchema(graph),
    );
  await extractDecisions(
    graph,
    repo,
    candidates.map(({ pull, comments }) => ({
      number: pull.number,
      title: pull.title,
      body: pull.body ?? "",
      comments,
    })),
    new Map(changedFiles.map(({ number, files }) => [number, files])),
    offline,
    runReport,
    replayCached || providerOverride
      ? (() => {
          if (providerOverride && existsSync(".env.local"))
            process.loadEnvFile(".env.local");
          const environment = {
            ...process.env,
            ...(providerOverride
              ? {
                  LLM_PROVIDER: providerOverride,
                  LLM_FALLBACK_PROVIDERS: "",
                  LLM_FALLBACK_PROVIDER: "",
                }
              : {}),
          };
          return {
            ...(providerOverride
              ? { routerFactory: () => createLlmRouter(environment) }
              : {}),
            replayCached,
          };
        })()
      : undefined,
  );
} catch (error) {
  if (error instanceof GraphStepFailure)
    process.stderr.write(
      `${JSON.stringify({ component: "graph", event: "query_failed", step: error.step })}\n`,
    );
  process.stderr.write(
    `${error instanceof Error ? error.message : "Decision extraction failed"}\n`,
  );
  process.exitCode = 1;
} finally {
  let decisionNodesNow: number | null = null;
  try {
    const rows = await graphStep("count Decision nodes", () =>
      query<{ count: number }>(
        graph,
        "MATCH (decision:Decision) RETURN count(decision) AS count",
      ),
    );
    decisionNodesNow = rows[0]?.count ?? 0;
  } catch (error) {
    if (error instanceof GraphStepFailure)
      process.stderr.write(
        `${JSON.stringify({ component: "graph", event: "query_failed", step: error.step })}\n`,
      );
    process.exitCode = 1;
  }
  process.stdout.write(
    `${JSON.stringify({
      component: "decision_extraction",
      repository: repo,
      threadsProcessed: runReport.threadsProcessed,
      threadsSkipped: runReport.skippedThreads.length,
      skippedThreads: runReport.skippedThreads,
      decisionsPassedVerification: runReport.decisionsPassedVerification,
      decisionNodesNow,
    })}\n`,
  );
  await closeGraphClient();
}

async function liveThreads(repositoryOwner: string, repositoryName: string) {
  const pullList = await pulls(repositoryOwner, repositoryName);
  const threads: PreparedThread[] = await batch(pullList, 4, async (pull) => {
    const comments = await reviewComments(
      repositoryOwner,
      repositoryName,
      pull.number,
    );
    return {
      pull,
      comments: comments.map((comment) => ({
        id: commentId(comment.id, "review"),
        body: comment.body,
        path: comment.path,
        line: comment.line,
        created_at: comment.created_at,
        is_bot:
          comment.user?.type === "Bot" ||
          /\[bot\]$/i.test(comment.user?.login ?? ""),
      })),
    };
  });
  return threads.filter((thread) => hasEligibleComment(thread.comments));
}
