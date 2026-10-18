import { expect, it } from "vitest";
import {
  openrouterProvider,
  OPENROUTER_TIMEOUT_MS,
} from "../src/openrouter.js";
import { createLlmRouter } from "../src/router.js";
import { environment } from "./provider-support.js";

it("uses a 90 second request timeout and retries a free-model timeout once", async () => {
  let clock = 4000;
  const delays: number[] = [];
  let calls = 0;
  const provider = openrouterProvider(
    "offline-key",
    "poolside/laguna-s-2.1:free",
    async (_input, init) => {
      calls++;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(String(init?.body)).max_tokens).toBe(123);
      if (calls === 1) throw new DOMException("timed out", "TimeoutError");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
      );
    },
    {
      now: () => clock,
      wait: async (milliseconds) => {
        delays.push(milliseconds);
        clock += milliseconds;
      },
    },
  );
  expect(OPENROUTER_TIMEOUT_MS).toBe(90_000);
  await expect(
    provider.complete("check", "", "decision_check", 123),
  ).resolves.toBe("ok");
  expect(calls).toBe(2);
  expect(delays).toEqual([4000]);
});

it("retains TimeoutError after the single permitted free-model retry", async () => {
  let calls = 0;
  const provider = openrouterProvider(
    "offline-key",
    "poolside/laguna-s-2.1:free",
    async () => {
      calls++;
      throw new DOMException("timed out", "TimeoutError");
    },
    { wait: async () => undefined },
  );
  const failure = await provider
    .complete("check", "", "decision_check")
    .catch((error: unknown) => error);
  expect(calls).toBe(2);
  expect(failure).toMatchObject({
    causeName: "TimeoutError",
    kind: "transient",
    elapsedMs: expect.any(Number),
  });
});

it("does not retry a network failure and reports a timeout distinctly", async () => {
  let calls = 0;
  const provider = openrouterProvider(
    "offline-key",
    "poolside/laguna-s-2.1:free",
    async () => {
      calls++;
      throw new TypeError("network unavailable");
    },
    { wait: async () => undefined },
  );
  const failure = await provider
    .complete("check", "", "decision_check")
    .catch((error: unknown) => error);
  expect(calls).toBe(1);
  expect(failure).toMatchObject({
    causeName: "TypeError",
    elapsedMs: expect.any(Number),
  });
});

it("records timeout cause details and elapsed time in its route event", async () => {
  const inner = Object.assign(new Error("connect timed out"), {
    code: "UND_ERR_CONNECT_TIMEOUT",
  });
  const router = createLlmRouter(environment("openrouter"), async () => {
    throw new TypeError("fetch failed", { cause: inner });
  });
  await router.complete("check", "", "decision_check").catch(() => undefined);
  expect(router.routeEvents.at(-1)).toMatchObject({
    event: "failed",
    provider: "openrouter",
    causeName: "TimeoutError",
    causeCode: "UND_ERR_CONNECT_TIMEOUT",
    elapsedMs: expect.any(Number),
  });
});

it("surfaces safe OpenRouter upstream diagnostics in the failed route event", async () => {
  const credentials = environment("openrouter");
  const key = credentials.OPENROUTER_API_KEY;
  const router = createLlmRouter(
    credentials,
    async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "upstream rejected request",
            metadata: {
              provider_name: "Example upstream",
              raw: `authorization: Bearer ${key}; ${"x".repeat(300)}`,
            },
          },
        }),
        { status: 503 },
      ),
  );
  await router.complete("check", "", "decision_check").catch(() => undefined);
  const failure = router.routeEvents.find(({ event }) => event === "failed");
  expect(failure).toMatchObject({
    event: "failed",
    provider: "openrouter",
    upstreamProvider: "Example upstream",
    elapsedMs: expect.any(Number),
  });
  if (failure?.event === "failed") {
    expect(failure.upstreamRaw).toHaveLength(200);
    expect(failure.upstreamRaw).not.toContain(key);
    expect(failure.upstreamRaw).not.toMatch(/authorization\s*:/i);
  }
});
