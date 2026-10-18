import { expect, it } from "vitest";
import { createLlmRouter } from "../src/router.js";
import { completionResponse, environment, urls } from "./provider-support.js";

it("uses one fallback after a transient failure and avoids retrying that provider in the run", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    { ...environment("openai"), LLM_FALLBACK_PROVIDER: "gemini" },
    async (input) => {
      calls.push(String(input));
      if (calls.length === 1)
        return new Response("unavailable", { status: 503 });
      return completionResponse(
        String(input).includes("generativelanguage") ? "gemini" : "openai",
      );
    },
  );
  await router.complete("first");
  await router.complete("second");
  expect(calls).toEqual([urls.openai, urls.gemini, urls.gemini]);
  expect(router.routeEvents).toEqual([
    { event: "selected", provider: "openai", purpose: "extract" },
    {
      event: "failed",
      provider: "openai",
      purpose: "extract",
      kind: "transient",
      status: 503,
      elapsedMs: expect.any(Number),
    },
    {
      event: "fallback",
      from: "openai",
      to: "gemini",
      purpose: "extract",
      kind: "transient",
      status: 503,
      elapsedMs: expect.any(Number),
    },
    { event: "selected", provider: "gemini", purpose: "extract" },
  ]);
});

it("walks ordered fallbacks once and pins the first available provider for the run", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    {
      ...environment("openai"),
      LLM_FALLBACK_PROVIDERS: "gemini,anthropic,openrouter",
      LLM_FALLBACK_ON_QUOTA: "true",
    },
    async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === urls.openai)
        return new Response("unavailable", { status: 503 });
      if (url === urls.gemini)
        return new Response(
          JSON.stringify({ error: { code: "insufficient_quota" } }),
          { status: 429 },
        );
      return completionResponse(
        url === urls.anthropic ? "anthropic" : "openrouter",
      );
    },
  );
  await router.complete("first");
  await router.complete("second");
  expect(calls).toEqual([
    urls.openai,
    urls.gemini,
    urls.anthropic,
    urls.anthropic,
  ]);
  expect(router.lastProvider).toBe("anthropic");
  expect(router.routeEvents).toContainEqual(
    expect.objectContaining({
      event: "fallback",
      from: "gemini",
      to: "anthropic",
      purpose: "extract",
      kind: "quota",
      status: 429,
    }),
  );
});

it("does not retry providers after the configured chain is exhausted", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    {
      ...environment("gemini"),
      LLM_FALLBACK_PROVIDERS: "openai,anthropic,openrouter",
      LLM_FALLBACK_ON_QUOTA: "true",
    },
    async (input) => {
      calls.push(String(input));
      return new Response("unavailable", { status: 503 });
    },
    { wait: async () => undefined },
  );
  await expect(router.complete("first")).rejects.toMatchObject({
    kind: "transient",
    status: 503,
  });
  await expect(router.complete("second")).rejects.toMatchObject({
    kind: "transient",
    status: 503,
  });
  expect(calls).toEqual([
    urls.gemini,
    urls.gemini,
    urls.gemini,
    urls.gemini,
    urls.openai,
    urls.anthropic,
    urls.openrouter,
  ]);
});

it("records safe nested transport causes without exposing error messages", async () => {
  const router = createLlmRouter(environment("openai"), async () => {
    const socketError = Object.assign(new Error("secret-bearing detail"), {
      code: "ECONNRESET",
    });
    throw Object.assign(new TypeError("fetch failed"), { cause: socketError });
  });
  await expect(router.complete("extract")).rejects.toMatchObject({
    kind: "transient",
  });
  expect(router.routeEvents).toContainEqual(
    expect.objectContaining({
      event: "failed",
      provider: "openai",
      purpose: "extract",
      kind: "transient",
      causeName: "Error",
      causeCode: "ECONNRESET",
    }),
  );
  expect(JSON.stringify(router.routeEvents)).not.toContain(
    "secret-bearing detail",
  );
});

it("retries one Gemini timeout on Gemini before using fallback", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    {
      ...environment("gemini"),
      LLM_FALLBACK_PROVIDER: "openai",
    },
    async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === urls.gemini && calls.length === 1) {
        const connectError = Object.assign(new Error("connection timed out"), {
          name: "ConnectTimeoutError",
          code: "UND_ERR_CONNECT_TIMEOUT",
        });
        throw new TypeError("fetch failed", { cause: connectError });
      }
      if (url === urls.gemini) return completionResponse("gemini");
      return completionResponse("openai");
    },
  );

  await router.complete("extract");

  expect(calls).toEqual([urls.gemini, urls.gemini]);
});

it("uses quota fallback only when enabled", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    {
      ...environment("openai"),
      LLM_FALLBACK_PROVIDER: "gemini",
      LLM_FALLBACK_ON_QUOTA: "true",
    },
    async (input) => {
      calls.push(String(input));
      return calls.length === 1
        ? new Response(
            JSON.stringify({ error: { code: "insufficient_quota" } }),
            { status: 429 },
          )
        : completionResponse("gemini");
    },
  );
  await router.complete("extract");
  expect(calls).toEqual([urls.openai, urls.gemini]);
  expect(router.routeEvents.at(-1)).toMatchObject({
    event: "fallback",
    kind: "quota",
  });
});

it("keeps review distinct from the provider that actually extracted the decision", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    {
      ...environment("openai"),
      LLM_FALLBACK_PROVIDER: "gemini",
      LLM_REVIEW_PROVIDER: "gemini",
    },
    async (input) => {
      calls.push(String(input));
      return calls.length === 1
        ? new Response("unavailable", { status: 503 })
        : completionResponse("gemini");
    },
  );
  await router.complete("extract");
  await expect(router.complete("review", "", "review")).rejects.toThrow(
    "must differ from the selected extraction provider",
  );
  expect(calls).toEqual([urls.openai, urls.gemini]);
});

it("routes an optional second opinion through its distinct configured provider", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    { ...environment("openai"), LLM_REVIEW_PROVIDER: "anthropic" },
    async (input) => {
      calls.push(String(input));
      return completionResponse(calls.length === 1 ? "openai" : "anthropic");
    },
  );
  await router.complete("extract");
  await router.complete("review", "", "review");
  expect(calls).toEqual([urls.openai, urls.anthropic]);
  expect(router.lastProvider).toBe("anthropic");
});

it("does not fallback for invalid credentials or missing fallback keys", async () => {
  const calls: string[] = [];
  const invalidKey = createLlmRouter(
    { ...environment("openai"), LLM_FALLBACK_PROVIDER: "gemini" },
    async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ error: { code: "invalid_api_key" } }),
        { status: 401 },
      );
    },
  );
  await expect(invalidKey.complete("extract")).rejects.toMatchObject({
    kind: "invalid_key",
  });
  expect(calls).toHaveLength(1);

  const noFallbackKey = createLlmRouter(
    {
      LLM_PROVIDER: "openai",
      OPENAI_API_KEY: "offline-openai-key",
      LLM_FALLBACK_PROVIDER: "gemini",
    },
    async (input) => {
      calls.push(String(input));
      return new Response("unavailable", { status: 503 });
    },
  );
  await expect(noFallbackKey.complete("extract")).rejects.toMatchObject({
    status: 503,
  });
  expect(calls).toHaveLength(2);
});

it("does not use quota fallback unless explicitly enabled", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    {
      ...environment("openai"),
      LLM_FALLBACK_PROVIDER: "gemini",
      LLM_FALLBACK_ON_QUOTA: "false",
    },
    async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ error: { code: "insufficient_quota" } }),
        {
          status: 429,
        },
      );
    },
  );
  await expect(router.complete("extract")).rejects.toMatchObject({
    kind: "quota",
  });
  expect(calls).toEqual([urls.openai]);
  expect(router.routeEvents.at(-1)).toMatchObject({
    event: "failed",
    kind: "quota",
  });
});

it("retries Gemini per-minute limits twice and records bounded provider details before fallback", async () => {
  const calls: string[] = [];
  const message = `Requests per minute limit reached. ${"x".repeat(400)}`;
  const router = createLlmRouter(
    {
      ...environment("gemini"),
      LLM_FALLBACK_PROVIDER: "openai",
    },
    async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === urls.gemini)
        return new Response(JSON.stringify({ error: { message } }), {
          status: 429,
          headers: { "retry-after": "0" },
        });
      return completionResponse("openai");
    },
  );
  await router.complete("extract");
  expect(calls).toEqual([urls.gemini, urls.gemini, urls.gemini, urls.openai]);
  const events = router.routeEvents.filter(
    (event) => event.event === "rate_limit",
  );
  expect(events).toHaveLength(3);
  expect(events[0]).toMatchObject({
    provider: "gemini",
    status: 429,
    attempt: 1,
    retrying: true,
    providerMessage: message.slice(0, 300),
    retryAfter: "0",
    rateLimitWindow: "minute",
  });
  expect(events.at(-1)).toMatchObject({ attempt: 3, retrying: false });
});

it("falls back immediately for a Gemini daily limit", async () => {
  const calls: string[] = [];
  const router = createLlmRouter(
    {
      ...environment("gemini"),
      LLM_FALLBACK_PROVIDER: "openai",
      LLM_FALLBACK_ON_QUOTA: "false",
    },
    async (input) => {
      const url = String(input);
      calls.push(url);
      return url === urls.gemini
        ? new Response(
            JSON.stringify({
              error: { message: "Daily request limit reached" },
            }),
            { status: 429 },
          )
        : completionResponse("openai");
    },
  );
  await router.complete("extract");
  expect(calls).toEqual([urls.gemini, urls.openai]);
  expect(router.routeEvents).toContainEqual(
    expect.objectContaining({
      event: "rate_limit",
      rateLimitWindow: "day",
      retrying: false,
    }),
  );
});

it("retries Gemini 503 responses on the 5, 15, and 30 second schedule before fallback", async () => {
  const calls: string[] = [];
  const waits: number[] = [];
  const message = `Google temporary failure ${"x".repeat(350)}`;
  const router = createLlmRouter(
    {
      ...environment("gemini"),
      LLM_FALLBACK_PROVIDER: "openai",
    },
    async (input) => {
      const url = String(input);
      calls.push(url);
      return url === urls.gemini
        ? new Response(JSON.stringify({ error: { message } }), {
            status: 503,
          })
        : completionResponse("openai");
    },
    { wait: async (milliseconds) => void waits.push(milliseconds) },
  );

  await router.complete("extract");

  expect(waits).toEqual([5000, 15_000, 30_000]);
  expect(calls).toEqual([
    urls.gemini,
    urls.gemini,
    urls.gemini,
    urls.gemini,
    urls.openai,
  ]);
  expect(router.routeEvents.filter((event) => event.event === "retry")).toEqual(
    [
      {
        event: "retry",
        provider: "gemini",
        purpose: "extract",
        status: 503,
        attempt: 1,
        retrying: true,
        providerMessage: message.slice(0, 300),
      },
      {
        event: "retry",
        provider: "gemini",
        purpose: "extract",
        status: 503,
        attempt: 2,
        retrying: true,
        providerMessage: message.slice(0, 300),
      },
      {
        event: "retry",
        provider: "gemini",
        purpose: "extract",
        status: 503,
        attempt: 3,
        retrying: true,
        providerMessage: message.slice(0, 300),
      },
      {
        event: "retry",
        provider: "gemini",
        purpose: "extract",
        status: 503,
        attempt: 4,
        retrying: false,
        providerMessage: message.slice(0, 300),
      },
    ],
  );
});
