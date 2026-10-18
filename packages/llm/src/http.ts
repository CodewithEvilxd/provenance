import { z } from "zod";
import {
  ProviderFailure,
  providerCauseDetails,
  type ProviderName,
  type RateLimitWindow,
} from "./types.js";

const errorBody = z
  .object({
    error: z
      .object({
        code: z.union([z.string(), z.number()]).nullable().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
        message: z.string().optional(),
        metadata: z
          .object({
            provider_name: z.string().optional(),
            raw: z.unknown().optional(),
          })
          .passthrough()
          .optional(),
      })
      .optional(),
  })
  .passthrough();

export async function providerJson(
  provider: ProviderName,
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
  timeoutMs = 30_000,
) {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw transportFailure(provider, error, Date.now() - startedAt);
  }
  if (!response.ok) {
    let errorText: string;
    try {
      errorText = await response.text();
    } catch (error) {
      throw transportFailure(
        provider,
        error,
        Date.now() - startedAt,
        response.status,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(errorText);
    } catch {
      body = undefined;
    }
    throw responseFailure(
      provider,
      response.status,
      body,
      init,
      response.headers.get("retry-after") ?? undefined,
      Date.now() - startedAt,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    const cause = providerCauseDetails(error);
    const timedOut = isTimeout(cause);
    if (timedOut || !(error instanceof SyntaxError))
      throw transportFailure(
        provider,
        error,
        Date.now() - startedAt,
        response.status,
      );
    throw new ProviderFailure(
      provider,
      "malformed",
      "response was not JSON",
      response.status,
      error,
      { elapsedMs: Date.now() - startedAt },
    );
  }
  return body;
}

function isTimeout(cause: { causeName?: string; causeCode?: string }) {
  return (
    cause.causeName === "TimeoutError" ||
    cause.causeCode === "ETIMEDOUT" ||
    cause.causeCode === "UND_ERR_CONNECT_TIMEOUT"
  );
}

function transportFailure(
  provider: ProviderName,
  error: unknown,
  elapsedMs: number,
  status?: number,
) {
  const cause = providerCauseDetails(error);
  const timedOut = isTimeout(cause);
  return new ProviderFailure(
    provider,
    "transient",
    timedOut ? "request timed out" : "request failed",
    status,
    error,
    {
      ...(timedOut ? { causeName: "TimeoutError" } : cause),
      ...(cause.causeCode ? { causeCode: cause.causeCode } : {}),
      elapsedMs,
    },
  );
}

function responseFailure(
  provider: ProviderName,
  status: number,
  body: unknown,
  init: RequestInit,
  retryAfter?: string,
  elapsedMs?: number,
) {
  const details = errorBody.safeParse(body).data?.error;
  const providerMessage = details?.message?.slice(0, 300);
  const code = [details?.code, details?.type, details?.status, details?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const rateLimitWindow: RateLimitWindow | undefined =
    provider === "gemini" && status === 429
      ? /per[-_ ]?minute|requests?[_ ]per[_ ]minute|\brpm\b/i.test(code)
        ? "minute"
        : /per[-_ ]?day|requests?[_ ]per[_ ]day|\bdaily\b|day limit/i.test(code)
          ? "day"
          : undefined
      : undefined;
  const kind =
    status === 401 ||
    /invalid api key|api key not valid|invalid_api_key|unauthorized/.test(code)
      ? "invalid_key"
      : rateLimitWindow === "day" ||
          (/insufficient_quota|billing|credit|usage_limit|resource_exhausted/.test(
            code,
          ) &&
            rateLimitWindow !== "minute") ||
          status === 402
        ? "quota"
        : /unsupported|unknown_parameter/.test(code)
          ? "unsupported"
          : status === 403 && /permission|authentication/.test(code)
            ? "invalid_key"
            : status === 429
              ? "rate_limit"
              : status === 408 || status >= 500
                ? "transient"
                : "malformed";
  return new ProviderFailure(
    provider,
    kind,
    `request returned ${status}${details?.message ? `: ${redact(details.message, init)}` : ""}`,
    status,
    body,
    {
      ...(provider === "gemini" && status >= 500 && providerMessage
        ? { providerMessage }
        : {}),
      ...(provider === "gemini" && status === 429 && providerMessage
        ? { providerMessage }
        : {}),
      ...(status === 429 && retryAfter
        ? { retryAfter: retryAfter.slice(0, 100) }
        : {}),
      ...(rateLimitWindow ? { rateLimitWindow } : {}),
      ...(provider === "openrouter" && details?.metadata?.provider_name
        ? { upstreamProvider: details.metadata.provider_name.slice(0, 100) }
        : {}),
      ...(provider === "openrouter" && details?.metadata?.raw !== undefined
        ? {
            upstreamRaw: redact(String(details.metadata.raw), init).slice(
              0,
              200,
            ),
          }
        : {}),
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
    },
  );
}

function redact(message: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.forEach((secret) => {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  });
  return message
    .replace(
      /(authorization|x-api-key|x-goog-api-key)\s*[:=]\s*[^\s,;}]+/gi,
      "[redacted header]",
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

export function promptText(prompt: string, correction = "") {
  return correction
    ? `${prompt}\n\nValidation error to correct: ${correction}`
    : prompt;
}
