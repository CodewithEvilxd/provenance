import { afterAll, expect, it } from "vitest";
import { closeGraphClient, selectGraph } from "@provenance/graph/client";
import {
  recallDeveloperContext,
  recordEpisode,
  recordPreference,
  recordWarning,
} from "../src/memory.js";
import {
  claimTask,
  createTask,
  getTask,
  updateTaskState,
} from "../src/state.js";

const devAlice = "dev-alice";
const devBob = "dev-bob";

it("stores and recalls isolated developer memory with topic strength", async () => {
  const episodeResult = await recordEpisode(devAlice, {
    kind: "code_inspection",
    summary: "Inspected ISR revalidation logic",
    topics: ["revalidation", "caching"],
    repo: "vercel/next.js",
  });
  expect(episodeResult.recorded).toBe(true);

  await recordWarning(devAlice, {
    decisionId: "decision:cache-revalidation-req",
    outcome: "acknowledged",
  });

  await recordPreference(devAlice, {
    key: "editor_preference",
    value: "strict_types",
  });

  const aliceContext = await recallDeveloperContext(devAlice, "revalidation");
  expect(aliceContext.relevantKnowledgeFound).toBe(true);
  expect(aliceContext.episodes).toHaveLength(1);
  expect(aliceContext.warnings).toHaveLength(1);
  expect(aliceContext.preferences).toHaveLength(1);
  expect(
    aliceContext.topics.find(({ name }) => name === "revalidation")?.strength,
  ).toBeGreaterThan(0);

  const bobContext = await recallDeveloperContext(devBob, "revalidation");
  expect(bobContext.relevantKnowledgeFound).toBe(false);
  expect(bobContext.episodes).toHaveLength(0);
  expect(bobContext.warnings).toHaveLength(0);
  expect(bobContext.preferences).toHaveLength(0);
});

it("manages task lifecycle and agent assignment through state graph", async () => {
  const taskId = "task:lifecycle-agent-verify-01";
  await createTask({
    id: taskId,
    type: "review_diff",
    repo: "vercel/next.js",
    scope: "packages/next/src/server/base-server.ts",
    status: "queued",
  });

  const initial = await getTask(taskId);
  expect(initial?.status).toBe("queued");
  expect(initial?.agent).toBeNull();

  const claimed = await claimTask("agent-worker-1", "review_diff");
  expect(claimed?.id).toBe(taskId);
  expect(claimed?.status).toBe("running");
  expect(claimed?.agent).toBe("agent-worker-1");

  await updateTaskState(taskId, {
    status: "done",
    completedSteps: ["Scanned AST", "Verified constraints"],
    artifact: {
      kind: "verification_report",
      ref: "report://verified-ok",
    },
  });

  const completed = await getTask(taskId);
  expect(completed?.status).toBe("done");
  expect(completed?.completedSteps).toHaveLength(2);
  expect(completed?.artifacts).toHaveLength(1);
  expect(completed?.artifacts[0]?.ref).toBe("report://verified-ok");
});

afterAll(async () => {
  try {
    const alice = await selectGraph(`mem:${devAlice}`);
    await alice.delete();
  } catch {
    // cleanup
  }
  try {
    const bob = await selectGraph(`mem:${devBob}`);
    await bob.delete();
  } catch {
    // cleanup
  }
  try {
    const state = await selectGraph("state");
    await state.delete();
  } catch {
    // cleanup
  }
  await closeGraphClient();
});
