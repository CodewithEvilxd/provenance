import Anthropic from "@anthropic-ai/sdk";
import {
  ProviderFailure,
  outputTokenLimit,
  type CompletionProvider,
} from "./types.js";

export function anthropicProvider(
  apiKey: string,
  model: string,
  fetcher: typeof fetch,
): CompletionProvider {
  const client = new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: 30_000,
    fetch: fetcher,
  });
  return {
    name: "anthropic",
    async complete(prompt, correction = "", purpose = "extract", maxTokens) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: outputTokenLimit(purpose, maxTokens),
          messages: [
            {
              role: "user",
              content: correction
                ? `${prompt}\n\nValidation error to correct: ${correction}`
                : prompt,
            },
          ],
        });
        const text = response.content.find((block) => block.type === "text");
        if (!text)
          throw new ProviderFailure(
            "anthropic",
            "malformed",
            "completion text is missing",
          );
        return text.text;
      } catch (error) {
        if (error instanceof ProviderFailure) throw error;
        throw anthropicFailure(error, apiKey);
      }
    },
  };
}

function anthropicFailure(error: unknown, apiKey: string) {
  if (!error || typeof error !== "object")
    return new ProviderFailure(
      "anthropic",
      "transient",
      "request failed",
      undefined,
      error,
    );
  const status =
    "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;
  const code = "error" in error ? JSON.stringify(error.error) : "";
  const detail =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "request failed";
  const networkFailure = /connection|network|timed out|fetch failed/i.test(
    `${code} ${detail}`,
  );
  const kind =
    status === 401 ||
    /invalid api key|unauthorized|authentication_error/i.test(code)
      ? "invalid_key"
      : /credit|billing|usage_limit|insufficient_quota/i.test(code)
        ? "quota"
        : status === 402
          ? "quota"
          : status === 429
            ? "rate_limit"
            : status === 403 && /permission|authentication/i.test(code)
              ? "invalid_key"
              : networkFailure ||
                  (typeof status === "number" &&
                    (status === 408 || status >= 500))
                ? "transient"
                : /unsupported|unknown_parameter/i.test(code)
                  ? "unsupported"
                  : "malformed";
  return new ProviderFailure(
    "anthropic",
    kind,
    redact(detail, apiKey),
    status,
    "cause" in error && error.cause !== undefined ? error.cause : error,
  );
}

function redact(message: string, apiKey: string) {
  return message.replaceAll(apiKey, "[redacted]").slice(0, 240);
}
