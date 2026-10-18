import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeGraphClient, selectGraph } from "@provenance/graph/client";
import { getTask, updateTaskState } from "../src/state.js";
import { processPullRequestWebhook } from "../src/webhook.js";
import {
  buildTestPayload,
  buildTestReview,
  verifyGraphRecord,
} from "./webhook-test-helpers.js";

describe("Webhook PR opened processing and idempotency", () => {
  it("processes PR opened, updates graph metadata and prevents duplicate rerun", async () => {
    const payload = buildTestPayload("opened", 201, "sha-201-initial");
    const graphPrefix = "test-webhook-repo";
    const graphName = `${graphPrefix}:${payload.repository.full_name}`;
    let runs = 0;
    let comments = 0;

    const options = {
      graphNamePrefix: graphPrefix,
      publishComment: true,
      reviewRunner: async () => {
        runs += 1;
        return buildTestReview();
      },
      commentPublisher: async () => {
        comments += 1;
        return { id: 88201, action: "created" as const };
      },
    };

    const outcome = await processPullRequestWebhook(
      payload,
      "del-001",
      options,
    );
    expect(outcome.status).toBe("ok");
    expect(outcome.taskId).toBe(
      "task:webhook:vercel/next.js:201:sha-201-initial",
    );
    expect(runs).toBe(1);
    expect(comments).toBe(1);

    const taskRecord = await getTask(outcome.taskId!);
    expect(taskRecord?.status).toBe("done");
    await verifyGraphRecord(graphName, 201, "sha-201-initial");

    const duplicate = await processPullRequestWebhook(
      payload,
      "del-002",
      options,
    );
    expect(duplicate.status).toBe("already_processed");
    expect(runs).toBe(1);
    expect(comments).toBe(1);
  });
});

describe("Webhook PR synchronize handling", () => {
  it("processes PR synchronize event with updated head commit sha", async () => {
    const payload = buildTestPayload("synchronize", 201, "sha-201-updated");
    const graphPrefix = "test-webhook-repo";
    const graphName = `${graphPrefix}:${payload.repository.full_name}`;
    let runs = 0;

    const outcome = await processPullRequestWebhook(payload, "del-003", {
      graphNamePrefix: graphPrefix,
      publishComment: false,
      reviewRunner: async () => {
        runs += 1;
        return buildTestReview();
      },
    });

    expect(outcome.status).toBe("ok");
    expect(outcome.taskId).toBe(
      "task:webhook:vercel/next.js:201:sha-201-updated",
    );
    expect(runs).toBe(1);
    await verifyGraphRecord(graphName, 201, "sha-201-updated");
  });
});

describe("Webhook in-progress concurrency guards", () => {
  it("blocks concurrent duplicate delivery when task is in running state", async () => {
    const payload = buildTestPayload("opened", 301, "sha-301-running");
    const graphPrefix = "test-webhook-repo";
    const taskId = `task:webhook:vercel/next.js:301:sha-301-running`;

    await processPullRequestWebhook(payload, "del-concurrent-01", {
      graphNamePrefix: graphPrefix,
      publishComment: false,
      reviewRunner: async () => {
        const concurrentOutcome = await processPullRequestWebhook(
          payload,
          "del-concurrent-02",
          { graphNamePrefix: graphPrefix },
        );
        expect(concurrentOutcome.status).toBe("already_processed");
        expect(concurrentOutcome.reason).toBe(
          "Webhook event is currently processing",
        );
        return buildTestReview();
      },
    });

    const finalTask = await getTask(taskId);
    expect(finalTask?.status).toBe("done");
  });
});

describe("Webhook simultaneous delivery guards", () => {
  it("handles simultaneous duplicate deliveries with Promise.all and executes review once", async () => {
    const payload = buildTestPayload("opened", 302, "sha-302-simultaneous");
    const graphPrefix = "test-webhook-repo";
    let runs = 0;
    let comments = 0;

    const options = {
      graphNamePrefix: graphPrefix,
      publishComment: true,
      reviewRunner: async () => {
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return buildTestReview();
      },
      commentPublisher: async () => {
        comments += 1;
        return { id: 88302, action: "created" as const };
      },
    };

    const [outcome1, outcome2] = await Promise.all([
      processPullRequestWebhook(payload, "del-sim-01", options),
      processPullRequestWebhook(payload, "del-sim-02", options),
    ]);

    const statuses = [outcome1.status, outcome2.status].sort();
    expect(statuses).toEqual(["already_processed", "ok"]);
    expect(runs).toBe(1);
    expect(comments).toBe(1);

    const taskId = `task:webhook:vercel/next.js:302:sha-302-simultaneous`;
    const finalTask = await getTask(taskId);
    expect(finalTask?.status).toBe("done");
  });
});

describe("Webhook task retries", () => {
  it("allows retrying a failed task with identical commit head", async () => {
    const payload = buildTestPayload("opened", 303, "sha-303-retry");
    const graphPrefix = "test-webhook-repo";
    const taskId = `task:webhook:vercel/next.js:303:sha-303-retry`;
    let runs = 0;

    await expect(
      processPullRequestWebhook(payload, "del-retry-01", {
        graphNamePrefix: graphPrefix,
        publishComment: false,
        reviewRunner: async () => {
          runs += 1;
          throw new Error("Temporary network timeout");
        },
      }),
    ).rejects.toThrow("Temporary network timeout");

    const failedTask = await getTask(taskId);
    expect(failedTask?.status).toBe("failed");
    expect(failedTask?.error).toBe("Temporary network timeout");
    expect(runs).toBe(1);

    const retryOutcome = await processPullRequestWebhook(
      payload,
      "del-retry-02",
      {
        graphNamePrefix: graphPrefix,
        publishComment: false,
        reviewRunner: async () => {
          runs += 1;
          return buildTestReview();
        },
      },
    );

    expect(retryOutcome.status).toBe("ok");
    expect(runs).toBe(2);
    const retriedTask = await getTask(taskId);
    expect(retriedTask?.status).toBe("done");
    expect(retriedTask?.error).toBeNull();
  });
});

describe("Webhook failure handling and secret sanitization", () => {
  it("marks task as failed when metadata refresh fails", async () => {
    const payload = buildTestPayload("opened", 404, "sha-404-meta-fail");
    const taskId = `task:webhook:vercel/next.js:404:sha-404-meta-fail`;

    await expect(
      processPullRequestWebhook(payload, "del-meta-01", {
        graphNamePrefix: "test-webhook-repo",
        publishComment: false,
        reviewRunner: async () => buildTestReview(),
        metadataRefresher: async () => {
          throw new Error("Metadata refresh database failure");
        },
      }),
    ).rejects.toThrow("Metadata refresh database failure");

    const failedTask = await getTask(taskId);
    expect(failedTask?.status).toBe("failed");
    expect(failedTask?.error).toBe("Metadata refresh database failure");
  });

  it("marks task as failed and sanitizes tokens in error messages", async () => {
    const payload = buildTestPayload("opened", 401, "sha-401-fail");
    const taskId = `task:webhook:vercel/next.js:401:sha-401-fail`;
    const token =
      "github_pat_SANITIZATION_REGRESSION_TEST_KEY_9876543210_token";

    await expect(
      processPullRequestWebhook(payload, "del-fail-001", {
        graphNamePrefix: "test-webhook-repo",
        publishComment: false,
        token,
        reviewRunner: async () => {
          throw new Error(`Upstream API failed for token ${token}`);
        },
      }),
    ).rejects.toThrow();

    const failedTask = await getTask(taskId);
    expect(failedTask?.status).toBe("failed");
    expect(failedTask?.error).toContain("[REDACTED]");
    expect(failedTask?.error).not.toContain(token);
  });
});

describe("Webhook failure safeguards", () => {
  it("marks task as failed when comment publishing fails", async () => {
    const payload = buildTestPayload("opened", 402, "sha-402-comment-fail");
    const graphPrefix = "test-webhook-repo";
    const taskId = `task:webhook:vercel/next.js:402:sha-402-comment-fail`;

    await expect(
      processPullRequestWebhook(payload, "del-cfail-01", {
        graphNamePrefix: graphPrefix,
        publishComment: true,
        reviewRunner: async () => buildTestReview(),
        commentPublisher: async () => {
          throw new Error("GitHub API rate limit exceeded");
        },
      }),
    ).rejects.toThrow("GitHub API rate limit exceeded");

    const failedTask = await getTask(taskId);
    expect(failedTask?.status).toBe("failed");
  });

  it("preserves completed status and does not overwrite with failed", async () => {
    const payload = buildTestPayload("opened", 403, "sha-403-preserve-done");
    const taskId = `task:webhook:vercel/next.js:403:sha-403-preserve-done`;

    const outcome = await processPullRequestWebhook(payload, "del-done-01", {
      graphNamePrefix: "test-webhook-repo",
      publishComment: false,
      reviewRunner: async () => buildTestReview(),
    });
    expect(outcome.status).toBe("ok");

    await updateTaskState(taskId, { status: "failed", error: "late error" });
    const checkTask = await getTask(taskId);
    expect(checkTask?.status).toBe("done");
  });
});

async function cleanupGraphs() {
  try {
    await (await selectGraph("test-webhook-repo:vercel/next.js")).delete();
  } catch (error) {
    void error;
  }
  try {
    await (await selectGraph("state")).delete();
  } catch (error) {
    void error;
  }
}

beforeAll(cleanupGraphs);
afterAll(async () => {
  await cleanupGraphs();
  await closeGraphClient();
});
