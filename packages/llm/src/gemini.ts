import { z } from "zod";
import { providerJson, promptText } from "./http.js";
import {
  ProviderFailure,
  providerCauseDetails,
  outputTokenLimit,
  type CompletionPurpose,
  type CompletionProvider,
} from "./types.js";

const requestTimeoutMs = 120_000;
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createGeminiPacer(
  now: () => number = Date.now,
  wait: (milliseconds: number) => Promise<void> = delay,
) {
  let nextRequest = Promise.resolve();
  let lastRequestAt: number | undefined;
  return (minimumIntervalMs: number) => {
    const scheduled = nextRequest.then(async () => {
      if (lastRequestAt !== undefined) {
        const remaining = minimumIntervalMs - (now() - lastRequestAt);
        if (remaining > 0) await wait(remaining);
      }
      lastRequestAt = now();
    });
    nextRequest = scheduled.catch(() => undefined);
    return scheduled;
  };
}

const defaultPacer = createGeminiPacer();

export type GeminiProviderOptions = {
  minimumIntervalMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
  pace?: (minimumIntervalMs: number) => Promise<void>;
  onRateLimit?: (
    failure: ProviderFailure,
    attempt: number,
    retrying: boolean,
  ) => void;
  onRetry?: (
    failure: ProviderFailure,
    attempt: number,
    retrying: boolean,
  ) => void;
};

const completionBody = z.object({
  candidates: z.array(
    z.object({
      content: z.object({ parts: z.array(z.object({ text: z.string() })) }),
    }),
  ),
});

export function geminiProvider(
  apiKey: string,
  model: string,
  fetcher: typeof fetch,
  options: GeminiProviderOptions = {},
): CompletionProvider {
  return {
    name: "gemini",
    async complete(prompt, correction, purpose = "extract", maxTokens) {
      const body = await completeWithTimeoutRetry(
        model,
        apiKey,
        promptText(prompt, correction),
        fetcher,
        purpose,
        maxTokens,
        options,
      );
      const parsed = completionBody.safeParse(body);
      if (!parsed.success)
        throw new ProviderFailure(
          "gemini",
          "malformed",
          "completion text is missing",
        );
      const text = parsed.data.candidates[0]?.content.parts[0]?.text;
      if (!text)
        throw new ProviderFailure(
          "gemini",
          "malformed",
          "completion text is missing",
        );
      return text;
    },
  };
}

async function completeWithTimeoutRetry(
  model: string,
  apiKey: string,
  prompt: string,
  fetcher: typeof fetch,
  purpose: CompletionPurpose,
  maxTokens: number | undefined,
  options: GeminiProviderOptions,
) {
  let timeoutRetries = 0;
  let minuteRetries = 0;
  let serverRetries = 0;
  while (true) {
    try {
      await (options.pace ?? defaultPacer)(options.minimumIntervalMs ?? 6000);
      return await providerJson(
        "gemini",
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: outputTokenLimit(purpose, maxTokens),
              thinkingConfig: { thinkingLevel: "LOW" },
            },
          }),
        },
        fetcher,
        requestTimeoutMs,
      );
    } catch (error) {
      if (
        timeoutRetries === 0 &&
        error instanceof ProviderFailure &&
        (error.causeName === "TimeoutError" ||
          providerCauseDetails(error.cause).causeName === "TimeoutError" ||
          error.causeCode === "UND_ERR_CONNECT_TIMEOUT")
      ) {
        timeoutRetries++;
        continue;
      }
      if (error instanceof ProviderFailure && error.status === 429) {
        const retrying =
          error.rateLimitWindow === "minute" && minuteRetries < 2;
        options.onRateLimit?.(error, minuteRetries + 1, retrying);
        if (retrying) {
          minuteRetries++;
          await (options.wait ?? delay)(retryDelay(error.retryAfter));
          continue;
        }
      }
      if (error instanceof ProviderFailure && error.status === 503) {
        const waits = [5000, 15_000, 30_000];
        const retrying = serverRetries < waits.length;
        options.onRetry?.(error, serverRetries + 1, retrying);
        if (retrying) {
          await (options.wait ?? delay)(waits[serverRetries]!);
          serverRetries++;
          continue;
        }
      }
      throw error;
    }
  }
}

function retryDelay(value: string | undefined) {
  if (!value) return 65_000;
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Math.min(65_000, Math.max(0, milliseconds));
}
