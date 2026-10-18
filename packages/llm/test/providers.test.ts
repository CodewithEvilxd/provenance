import { expect, it } from "vitest";
import { createLlmRouter } from "../src/router.js";
import { ProviderFailure } from "../src/types.js";
import {
  bodyOf,
  completionResponse,
  environment,
  headersOf,
  models,
  providerNames,
  urls,
} from "./provider-support.js";

it.each(providerNames)(
  "%s sends its own model, auth, and JSON request",
  async (provider) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const router = createLlmRouter(
      environment(provider),
      async (input, init) => {
        calls.push({ url: String(input), init });
        return completionResponse(provider);
      },
    );

    expect(JSON.parse(await router.complete("extract"))).toEqual({
      decisions: [],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(urls[provider]);
    expect(calls[0]?.init?.method).toBe("POST");
    const headers = headersOf(calls[0]?.init);
    expect(headers.get("content-type")).toBe("application/json");
    const body = bodyOf(calls[0]?.init);
    if (provider === "gemini") {
      expect(headers.get("x-goog-api-key")).toBe("offline-gemini-key");
      expect(body).toEqual({
        contents: [{ parts: [{ text: "extract" }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: "LOW" },
        },
      });
    } else {
      const apiKey =
        provider === "anthropic"
          ? "offline-anthropic-key"
          : provider === "openrouter"
            ? "offline-openrouter-key"
            : "offline-openai-key";
      expect(
        headers.get(provider === "anthropic" ? "x-api-key" : "authorization"),
      ).toBe(provider === "anthropic" ? apiKey : `Bearer ${apiKey}`);
      expect(body.model).toBe(models[provider]);
      expect(body.messages).toEqual([{ role: "user", content: "extract" }]);
      expect(body).not.toHaveProperty("response_format");
      if (provider === "anthropic") {
        expect(headers.get("anthropic-version")).toBe("2023-06-01");
        expect(body.max_tokens).toBe(2048);
      } else {
        expect(body.temperature).toBe(0);
        expect(
          provider === "openai" ? body.max_completion_tokens : body.max_tokens,
        ).toBe(2048);
      }
    }
  },
);

it("strips trailing CR characters from Gemini model and API key settings", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const router = createLlmRouter(
    {
      ...environment("gemini"),
      GEMINI_API_KEY: "offline-gemini-key\r\r",
      GEMINI_MODEL: `${models.gemini}\r`,
    },
    async (input, init) => {
      calls.push({ url: String(input), init });
      return completionResponse("gemini");
    },
  );

  await router.complete("extract");

  expect(calls[0]?.url).toBe(urls.gemini);
  expect(headersOf(calls[0]?.init).get("x-goog-api-key")).toBe(
    "offline-gemini-key",
  );
  expect(bodyOf(calls[0]?.init).generationConfig).toEqual({
    temperature: 0,
    maxOutputTokens: 2048,
    thinkingConfig: { thinkingLevel: "LOW" },
  });
});

it("rotates across configured Gemini API keys without exposing key values", async () => {
  const calls: RequestInit[] = [];
  const environmentWithKeys = {
    ...environment("gemini"),
    GEMINI_API_KEY: "offline-gemini-key-1",
    GEMINI_API_KEY_2: "offline-gemini-key-2",
    GEMINI_API_KEY_3: "offline-gemini-key-3",
    GEMINI_API_KEY_4: "offline-gemini-key-4",
  };
  const router = createLlmRouter(environmentWithKeys, async (_input, init) => {
    calls.push(init ?? {});
    return completionResponse("gemini");
  });

  await router.complete("offline check 1");
  await router.complete("offline check 2");
  await router.complete("offline check 3");
  await router.complete("offline check 4");

  expect(calls.map((call) => headersOf(call).get("x-goog-api-key"))).toEqual([
    "offline-gemini-key-1",
    "offline-gemini-key-2",
    "offline-gemini-key-3",
    "offline-gemini-key-4",
  ]);
});

it.each(providerNames)(
  "%s limits review output to 200 tokens",
  async (provider) => {
    const calls: RequestInit[] = [];
    const reviewer = providerNames.find((name) => name !== provider)!;
    const router = createLlmRouter(
      {
        ...environment(reviewer),
        LLM_PROVIDER: reviewer,
        LLM_REVIEW_PROVIDER: provider,
      },
      async (_input, init) => {
        calls.push(init ?? {});
        return completionResponse(provider);
      },
    );
    await router.complete("review", "", "review");
    const body = bodyOf(calls[0]);
    const tokenLimit =
      provider === "gemini"
        ? (body.generationConfig as Record<string, unknown>).maxOutputTokens
        : provider === "openai"
          ? body.max_completion_tokens
          : body.max_tokens;
    expect(tokenLimit).toBe(200);
  },
);

it.each(providerNames)(
  "%s preserves auth failure status and safe details",
  async (provider) => {
    const router = createLlmRouter(
      environment(provider),
      async () =>
        new Response(
          JSON.stringify(
            provider === "anthropic"
              ? {
                  type: "error",
                  error: {
                    type: "authentication_error",
                    message: "invalid API key",
                  },
                }
              : {
                  error: {
                    code: "invalid_api_key",
                    message: "invalid API key",
                  },
                },
          ),
          { status: 401 },
        ),
    );
    const failure = await router
      .complete("extract")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderFailure);
    expect(failure).toMatchObject({
      provider,
      kind: "invalid_key",
      status: 401,
    });
    expect(failure.message).toContain("invalid API key");
    expect(failure.message).not.toContain("offline-");
  },
);

it.each(providerNames)(
  "%s classifies quota and credit errors",
  async (provider) => {
    const router = createLlmRouter(
      environment(provider),
      async () =>
        new Response(
          JSON.stringify(
            provider === "anthropic"
              ? {
                  type: "error",
                  error: {
                    type: "billing_error",
                    message: "credit balance too low",
                  },
                }
              : provider === "gemini"
                ? {
                    error: {
                      status: "RESOURCE_EXHAUSTED",
                      message: "quota exhausted",
                    },
                  }
                : {
                    error: {
                      code: "insufficient_quota",
                      message: "quota exhausted",
                    },
                  },
          ),
          {
            status:
              provider === "openrouter"
                ? 402
                : provider === "anthropic"
                  ? 400
                  : 429,
          },
        ),
    );
    const failure = await router
      .complete("extract")
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ provider, kind: "quota" });
    expect(failure.status).toBe(
      provider === "openrouter" ? 402 : provider === "anthropic" ? 400 : 429,
    );
    expect(failure.message).toMatch(/quota|credit/i);
  },
);

it.each(providerNames)(
  "%s classifies rate limits and transient responses",
  async (provider) => {
    const rateLimited = createLlmRouter(
      environment(provider),
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "rate_limit", message: "slow down" },
          }),
          {
            status: 429,
          },
        ),
    );
    const rateFailure = await rateLimited
      .complete("extract")
      .catch((error: unknown) => error);
    expect(rateFailure).toMatchObject({
      provider,
      kind: "rate_limit",
      status: 429,
    });

    const unavailable = createLlmRouter(
      environment(provider),
      async () => new Response("service unavailable", { status: 503 }),
      { wait: async () => undefined },
    );
    const transientFailure = await unavailable
      .complete("extract")
      .catch((error: unknown) => error);
    expect(transientFailure).toMatchObject({
      provider,
      kind: "transient",
      status: 503,
    });
  },
);

it.each(providerNames)(
  "%s retains transient network causes",
  async (provider) => {
    const networkCause = new TypeError("socket connection refused");
    const router = createLlmRouter(environment(provider), async () => {
      throw networkCause;
    });
    const failure = await router
      .complete("extract")
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      provider,
      kind: "transient",
      cause: networkCause,
    });
    expect(failure.message).not.toContain("offline-");
  },
);

it.each(providerNames)(
  "%s rejects malformed JSON and unsupported options",
  async (provider) => {
    const malformed = createLlmRouter(
      environment(provider),
      async () => new Response("not json", { status: 200 }),
    );
    await expect(malformed.complete("extract")).rejects.toMatchObject({
      provider,
      kind: "malformed",
    });

    const unsupported = createLlmRouter(
      environment(provider),
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "unsupported_parameter",
              message: "response_format unsupported",
            },
          }),
          { status: 400 },
        ),
    );
    await expect(unsupported.complete("extract")).rejects.toMatchObject({
      provider,
      kind: "unsupported",
      status: 400,
    });
  },
);
