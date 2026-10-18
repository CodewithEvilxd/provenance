import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeGraphClient, selectGraph } from "@provenance/graph/client";
import { assessOutputSchema } from "../src/reasoning.js";
import {
  contextOutputSchema,
  recordMemoryOutputSchema,
} from "../src/memory-tools.js";

const projectRoot = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const userAlpha = "alpha-dev";
const userBeta = "beta-dev";
const targetPath = "packages/next/src/server/lib/patch-fetch.ts";
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
    name: "provenance-memory-test",
    version: "1.0.0",
  });
  await client.connect(transport);
});

it("records and recalls developer memory with topic isolation", async () => {
  const storeCall = await client.callTool({
    name: "record_developer_memory",
    arguments: {
      login: userAlpha,
      kind: "architecture_inspection",
      summary: "Inspected fetch cache handler configuration",
      topics: ["caching", "fetch-patch"],
      repo: "vercel/next.js",
    },
  });
  const stored = recordMemoryOutputSchema.parse(storeCall.structuredContent);
  expect(stored.recorded).toBe(true);

  const recallCall = await client.callTool({
    name: "my_context",
    arguments: {
      login: userAlpha,
      topic: "caching",
    },
  });
  const context = contextOutputSchema.parse(recallCall.structuredContent);
  expect(context.relevantKnowledgeFound).toBe(true);
  expect(context.episodes.length).toBeGreaterThan(0);
  expect(context.episodes[0]?.summary).toBe(
    "Inspected fetch cache handler configuration",
  );
  expect(context.topics.some(({ name }) => name === "caching")).toBe(true);

  const unrelatedCall = await client.callTool({
    name: "my_context",
    arguments: {
      login: userAlpha,
      topic: "unrelated-compiler-ast",
    },
  });
  const unrelated = contextOutputSchema.parse(unrelatedCall.structuredContent);
  expect(unrelated.relevantKnowledgeFound).toBe(false);
  expect(unrelated.episodes).toHaveLength(0);

  const isolatedCall = await client.callTool({
    name: "my_context",
    arguments: {
      login: userBeta,
    },
  });
  const isolated = contextOutputSchema.parse(isolatedCall.structuredContent);
  expect(isolated.episodes).toHaveLength(0);
  expect(isolated.topics).toHaveLength(0);
});

it("ensures repeated memory writes are idempotent without duplicating episodes", async () => {
  const first = await client.callTool({
    name: "record_developer_memory",
    arguments: {
      login: userAlpha,
      kind: "code_review",
      summary: "Evaluated Redis cache handler configuration",
      topics: ["caching"],
      repo: "vercel/next.js",
    },
  });
  const firstResponse = recordMemoryOutputSchema.parse(first.structuredContent);
  const second = await client.callTool({
    name: "record_developer_memory",
    arguments: {
      login: userAlpha,
      kind: "code_review",
      summary: "Evaluated Redis cache handler configuration",
      topics: ["caching"],
      repo: "vercel/next.js",
    },
  });
  const secondResponse = recordMemoryOutputSchema.parse(
    second.structuredContent,
  );
  expect(firstResponse.id).toBe(secondResponse.id);

  const contextCall = await client.callTool({
    name: "my_context",
    arguments: { login: userAlpha, topic: "caching" },
  });
  const context = contextOutputSchema.parse(contextCall.structuredContent);
  const duplicates = context.episodes.filter(
    ({ summary }) => summary === "Evaluated Redis cache handler configuration",
  );
  expect(duplicates).toHaveLength(1);
});

it("mentions prior interactions in subsequent check_change_safety calls", async () => {
  const firstCall = await client.callTool({
    name: "check_change_safety",
    arguments: {
      repo: "vercel/next.js",
      target: targetPath,
      authorLogin: userAlpha,
    },
  });
  const firstAssessment = assessOutputSchema.parse(firstCall.structuredContent);
  expect(firstAssessment.status).toBe("insufficient_evidence");

  const secondCall = await client.callTool({
    name: "check_change_safety",
    arguments: {
      repo: "vercel/next.js",
      target: targetPath,
      authorLogin: userAlpha,
    },
  });
  const secondAssessment = assessOutputSchema.parse(
    secondCall.structuredContent,
  );
  expect(secondAssessment.priorInteractions.length).toBeGreaterThan(0);
  expect(secondAssessment.interpretation).toContain(
    `Note: Developer @${userAlpha} previously inspected this area`,
  );
});

afterAll(async () => {
  await client?.close();
  await transport?.close();
  try {
    const alphaGraph = await selectGraph(`mem:${userAlpha}`);
    await alphaGraph.delete();
  } catch {
    // cleanup
  }
  try {
    const betaGraph = await selectGraph(`mem:${userBeta}`);
    await betaGraph.delete();
  } catch {
    // cleanup
  }
  await closeGraphClient();
});
