import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { embedText } from "@provenance/decisions/embedding";
import { closeGraphClient } from "@provenance/graph/client";
import {
  graphCounts as readGraphCounts,
  searchDecisionRows,
  supersessionLinks,
  verifyPathEdges,
  verifyPathNodes,
} from "@provenance/graph/queries";
import {
  assessOutputSchema,
  explainOutputSchema,
  searchOutputSchema,
  traceOutputSchema,
} from "../src/reasoning.js";
import manifest from "../../../tests/corpus-measurements/vercel-nextjs-preparation.json" with { type: "json" };

const repository = "vercel/next.js";
const graph = `repo:${repository}`;
const projectRoot = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const sourceIds = new Set(manifest.source_ids);
const commentUrls = new Map(
  manifest.threads.flatMap((thread) =>
    thread.comments.map((comment) => [comment.id, comment.url] as const),
  ),
);
const commentBodies = new Map(
  manifest.threads.flatMap((thread) =>
    thread.comments.map((comment) => [comment.id, comment.body] as const),
  ),
);
let client: Client;
let transport: StdioClientTransport;
beforeAll(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve(projectRoot, "node_modules/tsx/dist/cli.mjs"),
      resolve(projectRoot, "packages/mcp/src/server.ts"),
    ],
    cwd: projectRoot,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    stderr: "inherit",
  });
  client = new Client({
    name: "provenance-integration-test",
    version: "1.0.0",
  });
  await client.connect(transport);
});

it("discovers and invokes graph reasoning tools using verified Next.js evidence", async () => {
  const before = await graphCounts();
  const listed = await client.listTools();
  expect(listed.tools.map(({ name }) => name).sort()).toEqual([
    "assess_change_risk",
    "check_change_safety",
    "explain_code_constraint",
    "explain_why",
    "get_task_handoff",
    "my_context",
    "record_developer_memory",
    "record_task_handoff",
    "search_decisions",
    "trace_decision_evidence",
  ]);

  const searchCall = await client.callTool({
    name: "search_decisions",
    arguments: { repo: repository, query: "caching", limit: 10 },
  });
  const search = searchOutputSchema.parse(searchCall.structuredContent);
  expect(search.status).toBe("found");
  const independentSearch = await searchDecisionRows(
    graph,
    embedText("caching"),
    null,
    10,
  );
  expect(search.matches.map(({ id }) => id)).toEqual(
    independentSearch.map(({ id }) => id),
  );
  expect(
    search.matches
      .flatMap(({ sources }) => sources.map(({ id }) => id))
      .every((id) => sourceIds.has(id)),
  ).toBe(true);
  const decision = search.matches.find(({ sources }) =>
    sources.some(
      ({ id, text }) =>
        sourceIds.has(id) &&
        /cache-handler-redis|Redis example/i.test(text ?? ""),
    ),
  );
  expect(decision).toBeDefined();
  const target = decision!.targets.find(({ label }) => label === "File");
  const source = decision!.sources.find(({ id }) => sourceIds.has(id));
  expect(target).toBeDefined();
  expect(source).toBeDefined();

  const explanationCall = await client.callTool({
    name: "explain_code_constraint",
    arguments: { repo: repository, target: target!.path },
  });
  const explanation = explainOutputSchema.parse(
    explanationCall.structuredContent,
  );
  expect(explanation.decisions.map(({ id }) => id)).toContain(decision!.id);

  const traceCall = await client.callTool({
    name: "trace_decision_evidence",
    arguments: { repo: repository, decisionId: decision!.id },
  });
  const trace = traceOutputSchema.parse(traceCall.structuredContent);
  expect(trace.status).toBe("traced");
  expect(trace.sources.map(({ id }) => id)).toContain(source!.id);
  expect(trace.targets.map(({ id }) => id)).toContain(target!.id);
  expect(trace.sources.every(({ id }) => sourceIds.has(id))).toBe(true);
  expect(trace.sources.find(({ id }) => id === source!.id)?.url).toBe(
    commentUrls.get(source!.id) ?? null,
  );
  expect(trace.sources.find(({ id }) => id === source!.id)?.text).toBe(
    commentBodies.get(source!.id),
  );
  await expectRealPaths(trace.paths);

  const riskCall = await client.callTool({
    name: "assess_change_risk",
    arguments: {
      repo: repository,
      target: target!.path,
      changedFiles: [target!.path],
    },
  });
  const risk = assessOutputSchema.parse(riskCall.structuredContent);
  expect(risk.status).toBe("insufficient_evidence");
  expect(risk.risk).toBeNull();
  expect(risk.decisions.map(({ id }) => id)).toContain(decision!.id);
  expect(
    risk.missingInformation.some((entry) =>
      entry.includes("no Function parse"),
    ),
  ).toBe(true);

  const invalid = await client.callTool({
    name: "search_decisions",
    arguments: { repo: repository, query: "x", limit: 100 },
  });
  expect(invalid.isError).toBe(true);
  expect(await graphCounts()).toEqual(before);
});

it("traces an observed supersession without reclassifying shared scope as contradiction", async () => {
  const [link] = await supersessionLinks(graph);
  expect(link).toBeDefined();
  const response = await client.callTool({
    name: "trace_decision_evidence",
    arguments: { repo: repository, decisionId: link!.newer },
  });
  const trace = traceOutputSchema.parse(response.structuredContent);
  expect(trace.supersedes.map(({ id }) => id)).toContain(link!.older);
  const olderResponse = await client.callTool({
    name: "trace_decision_evidence",
    arguments: { repo: repository, decisionId: link!.older },
  });
  const olderTrace = traceOutputSchema.parse(olderResponse.structuredContent);
  expect(olderTrace.supersededBy.map(({ id }) => id)).toContain(link!.newer);
  const shared = trace.sharedScopeDecisions;
  for (const candidate of shared) {
    expect(candidate.id).not.toBe(link!.newer);
    expect(candidate.targets.length).toBeGreaterThan(0);
  }
});

afterAll(async () => {
  await client?.close();
  await transport?.close();
  await closeGraphClient();
});

async function graphCounts() {
  return readGraphCounts(graph);
}

async function expectRealPaths(
  paths: {
    nodes: { id: string }[];
    edges: { from: string; to: string; type: string }[];
  }[],
) {
  for (const path of paths) {
    const nodes = await verifyPathNodes(
      graph,
      path.nodes.map(({ id }) => id),
    );
    expect(new Set(nodes.map(({ id }) => id))).toEqual(
      new Set(path.nodes.map(({ id }) => id)),
    );
    const edges = await verifyPathEdges(graph, path.edges);
    expect(edges).toHaveLength(path.edges.length);
    expect(edges.every(({ count }) => count > 0)).toBe(true);
  }
}
