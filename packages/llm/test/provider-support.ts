import type { ProviderName } from "../src/types.js";

export const completion = '{"decisions":[]}';
export const providerNames = [
  "openai",
  "gemini",
  "anthropic",
  "openrouter",
] as const;
export const models: Record<ProviderName, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.8-flash",
  anthropic: "claude-haiku-4-5-20251001",
  openrouter: "openai/gpt-4.1-mini",
};
export const urls: Record<ProviderName, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  anthropic: "https://api.anthropic.com/v1/messages",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export function environment(provider: ProviderName) {
  return {
    LLM_PROVIDER: provider,
    LLM_MIN_INTERVAL_MS: "0",
    OPENAI_API_KEY: "offline-openai-key",
    GEMINI_API_KEY: "offline-gemini-key",
    ANTHROPIC_API_KEY: "offline-anthropic-key",
    OPENROUTER_API_KEY: "offline-openrouter-key",
    OPENAI_MODEL: models.openai,
    GEMINI_MODEL: models.gemini,
    ANTHROPIC_MODEL: models.anthropic,
    OPENROUTER_MODEL: models.openrouter,
  };
}

export function completionResponse(provider: ProviderName) {
  const body =
    provider === "gemini"
      ? { candidates: [{ content: { parts: [{ text: completion }] } }] }
      : provider === "anthropic"
        ? { content: [{ type: "text", text: completion }] }
        : { choices: [{ message: { content: completion } }] };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

export function bodyOf(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

export function headersOf(init: RequestInit | undefined) {
  return new Headers(init?.headers);
}
