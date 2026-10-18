import { anthropicProvider } from "./anthropic.js";
import { geminiProvider, type GeminiProviderOptions } from "./gemini.js";
import { openaiProvider } from "./openai.js";
import { openrouterProvider } from "./openrouter.js";
import type { CompletionProvider, ProviderName } from "./types.js";

export const providerNames = [
  "openai",
  "gemini",
  "anthropic",
  "openrouter",
] as const;
const providers = providerNames;
export const providerKey: Record<ProviderName, string> = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};
const defaultModel: Record<ProviderName, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.8-flash",
  anthropic: "claude-haiku-4-5-20251001",
  openrouter: "openai/gpt-4.1-mini",
};
const geminiKeyCursors = new WeakMap<NodeJS.ProcessEnv, number>();

function nextGeminiApiKey(environment: NodeJS.ProcessEnv) {
  const keys = [1, 2, 3, 4]
    .map((index) =>
      environment[index === 1 ? "GEMINI_API_KEY" : `GEMINI_API_KEY_${index}`]
        ?.replace(/\r+$/, "")
        .trim(),
    )
    .filter((key): key is string => Boolean(key));
  if (keys.length === 0) return undefined;
  const cursor = geminiKeyCursors.get(environment) ?? 0;
  geminiKeyCursors.set(environment, cursor + 1);
  return keys[cursor % keys.length];
}

export function providerName(
  value: string | undefined,
  variable: string,
): ProviderName {
  const matched = providers.find((provider) => provider === value);
  if (matched) return matched;
  throw new Error(`${variable} must be one of: ${providers.join(", ")}`);
}

export function optionalProvider(value: string | undefined) {
  return value ? providerName(value, "provider route") : undefined;
}

export function fallbackProviders(environment: NodeJS.ProcessEnv) {
  const configured = environment.LLM_FALLBACK_PROVIDERS;
  if (
    configured !== undefined &&
    configured.trim() &&
    environment.LLM_FALLBACK_PROVIDER
  )
    throw new Error(
      "Set only one of LLM_FALLBACK_PROVIDER or LLM_FALLBACK_PROVIDERS",
    );
  const names =
    configured !== undefined
      ? configured.trim()
        ? configured.split(",").map((value) => value.trim())
        : []
      : environment.LLM_FALLBACK_PROVIDER
        ? [environment.LLM_FALLBACK_PROVIDER]
        : [];
  const providers = names.map((name) =>
    providerName(name, "LLM_FALLBACK_PROVIDERS"),
  );
  if (new Set(providers).size !== providers.length)
    throw new Error("LLM_FALLBACK_PROVIDERS must not contain duplicates");
  return providers;
}

export function configuredModel(
  name: ProviderName,
  environment: NodeJS.ProcessEnv,
) {
  return (
    environment[`${name.toUpperCase()}_MODEL`]?.replace(/\r+$/, "") ||
    defaultModel[name]
  );
}

export function completionProvider(
  name: ProviderName,
  environment: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
  onGeminiRateLimit?: GeminiProviderOptions["onRateLimit"],
  onGeminiRetry?: GeminiProviderOptions["onRetry"],
  wait?: GeminiProviderOptions["wait"],
): CompletionProvider {
  const geminiApiKey =
    name === "gemini" ? nextGeminiApiKey(environment) : undefined;
  const apiKey =
    geminiApiKey || environment[providerKey[name]]?.replace(/\r+$/, "");
  if (!apiKey) throw new Error(`${providerKey[name]} is required for ${name}`);
  const model = configuredModel(name, environment);
  if (name === "openai") return openaiProvider(apiKey, model, fetcher);
  if (name === "gemini") {
    const configuredInterval = environment.LLM_MIN_INTERVAL_MS;
    const minimumIntervalMs = configuredInterval
      ? Number(configuredInterval)
      : 12_500;
    if (!Number.isSafeInteger(minimumIntervalMs) || minimumIntervalMs < 0)
      throw new Error("LLM_MIN_INTERVAL_MS must be a non-negative integer");
    return geminiProvider(apiKey, model, fetcher, {
      minimumIntervalMs,
      ...(onGeminiRateLimit ? { onRateLimit: onGeminiRateLimit } : {}),
      ...(onGeminiRetry ? { onRetry: onGeminiRetry } : {}),
      ...(wait ? { wait } : {}),
    });
  }
  if (name === "anthropic") return anthropicProvider(apiKey, model, fetcher);
  return openrouterProvider(apiKey, model, fetcher);
}
