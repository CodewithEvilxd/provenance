import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closeGraphClient, selectGraph } from "@provenance/graph/client";
import {
  getTaskHandoffOutputSchema,
  recordTaskHandoffOutputSchema,
} from "../src/state-tools.js";

const projectRoot = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const testRepo = "vercel/next.js";
const testScope =
  "test/production/app-dir/isr-cache-control-restart/custom/cache-handler.js";
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
    name: "provenance-state-test",
    version: "1.0.0",
  });
  await client.connect(transport);
});

it("records and retrieves agent task handoff state with evidence artifacts", async () => {
  const taskId = "task:isr-cache-investigation-42";
  const firstHandoff = await client.callTool({
    name: "record_task_handoff",
    arguments: {
      taskId,
      type: "investigate_cache_invalidation",
      repo: testRepo,
      scope: testScope,
      status: "running",
      agentName: "agent-alpha",
      completedSteps: [
        "Parsed custom cache-handler.js constraints",
        "Traced Redis revalidation requirements",
      ],
      remainingWork: "Verify downstream fetch patch in Next server",
      blockers: "Awaiting fetch patch review confirmation",
      artifact: {
        kind: "decision_evidence",
        ref: "decision:34997d842c6bda1d4d8780bacb5e7bd8d898be60c05c0dad2c6f0c4257dd6b17",
      },
    },
  });
  const firstRecorded = recordTaskHandoffOutputSchema.parse(
    firstHandoff.structuredContent,
  );
  expect(firstRecorded.recorded).toBe(true);
  expect(firstRecorded.status).toBe("running");

  const retrieval = await client.callTool({
    name: "get_task_handoff",
    arguments: { taskId },
  });
  const readTask = getTaskHandoffOutputSchema.parse(
    retrieval.structuredContent,
  );
  expect(readTask.found).toBe(true);
  expect(readTask.task?.id).toBe(taskId);
  expect(readTask.task?.status).toBe("running");
  expect(readTask.task?.agent).toBe("agent-alpha");
  expect(readTask.task?.artifacts).toHaveLength(1);
});

it("updates task handoff to receiving agent with completed steps", async () => {
  const taskId = "task:isr-cache-investigation-42";
  const secondHandoff = await client.callTool({
    name: "record_task_handoff",
    arguments: {
      taskId,
      type: "investigate_cache_invalidation",
      repo: testRepo,
      scope: testScope,
      status: "done",
      agentName: "agent-beta",
      completedSteps: [
        "Parsed custom cache-handler.js constraints",
        "Traced Redis revalidation requirements",
        "Verified fetch patch compatibility in Next server runtime",
      ],
      remainingWork: "None",
      blockers: "None",
    },
  });
  const secondRecorded = recordTaskHandoffOutputSchema.parse(
    secondHandoff.structuredContent,
  );
  expect(secondRecorded.status).toBe("done");

  const updatedRetrieval = await client.callTool({
    name: "get_task_handoff",
    arguments: { taskId },
  });
  const updatedTask = getTaskHandoffOutputSchema.parse(
    updatedRetrieval.structuredContent,
  );
  expect(updatedTask.task?.status).toBe("done");
  expect(updatedTask.task?.agent).toBe("agent-beta");
  expect(updatedTask.task?.completedSteps).toHaveLength(3);
});

it("ensures repeated task handoff records are idempotent without duplicating tasks", async () => {
  const taskId = "task:idempotency-verification-99";
  const payload = {
    taskId,
    type: "decision_audit",
    repo: testRepo,
    scope: testScope,
    status: "queued" as const,
    agentName: "audit-agent",
    completedSteps: ["Initial queue entry"],
  };

  const first = await client.callTool({
    name: "record_task_handoff",
    arguments: payload,
  });
  const firstParsed = recordTaskHandoffOutputSchema.parse(
    first.structuredContent,
  );
  const second = await client.callTool({
    name: "record_task_handoff",
    arguments: payload,
  });
  const secondParsed = recordTaskHandoffOutputSchema.parse(
    second.structuredContent,
  );
  expect(firstParsed.taskId).toBe(secondParsed.taskId);

  const check = await client.callTool({
    name: "get_task_handoff",
    arguments: { taskId },
  });
  const parsedCheck = getTaskHandoffOutputSchema.parse(check.structuredContent);
  expect(parsedCheck.found).toBe(true);
  expect(parsedCheck.task?.id).toBe(taskId);
});

it("safely handles non-existent task IDs with empty result", async () => {
  const nonExistent = await client.callTool({
    name: "get_task_handoff",
    arguments: { taskId: "task:non-existent-task-id-0000" },
  });
  const parsed = getTaskHandoffOutputSchema.parse(
    nonExistent.structuredContent,
  );
  expect(parsed.found).toBe(false);
  expect(parsed.task).toBeNull();
});

it("rejects invalid handoff inputs schema gracefully", async () => {
  const invalid = await client.callTool({
    name: "record_task_handoff",
    arguments: {
      taskId: "",
      type: "invalid",
      repo: "not-a-valid-repo-format",
    },
  });
  expect(invalid.isError).toBe(true);
});

afterAll(async () => {
  await client?.close();
  await transport?.close();
  try {
    const stateGraph = await selectGraph("state");
    await stateGraph.delete();
  } catch {
    // cleanup
  }
  await closeGraphClient();
});
