import { existsSync } from "node:fs";
import {
  completionProvider,
  configuredModel,
  fallbackProviders,
  optionalProvider,
  providerKey,
  providerName,
} from "./provider-config.js";
import {
  ProviderFailure,
  type CompletionPurpose,
  type LlmRouteEvent,
  type LlmRouter,
  type ProviderName,
  providerCauseDetails,
} from "./types.js";

type Routing = {
  environment: NodeJS.ProcessEnv;
  fetcher: typeof fetch;
  primary: ProviderName;
  fallbacks: ProviderName[];
  reviewer: ProviderName | undefined;
  unavailable: Set<ProviderName>;
  lastFailure: ProviderFailure | undefined;
  routeEvents: LlmRouteEvent[];
  extractionProvider: ProviderName | undefined;
  lastProvider: ProviderName | undefined;
  maxDecisionTokens: number | undefined;
  wait?: (milliseconds: number) => Promise<void>;
};

export type LlmRouterOptions = {
  wait?: (milliseconds: number) => Promise<void>;
  maxDecisionTokens?: number;
};

export function createLlmRouter(
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  options: LlmRouterOptions = {},
): LlmRouter {
  if (environment === process.env && existsSync(".env.local"))
    process.loadEnvFile(".env.local");
  if (
    options.maxDecisionTokens !== undefined &&
    (!Number.isSafeInteger(options.maxDecisionTokens) ||
      options.maxDecisionTokens < 1 ||
      options.maxDecisionTokens > 4096)
  )
    throw new Error("maxDecisionTokens must be an integer from 1 to 4096");
  const primary = providerName(environment.LLM_PROVIDER, "LLM_PROVIDER");
  const fallbacks = fallbackProviders(environment);
  const reviewer = optionalProvider(environment.LLM_REVIEW_PROVIDER);
  if (fallbacks.includes(primary))
    throw new Error("LLM fallback providers must differ from LLM_PROVIDER");
  const routing: Routing = {
    environment,
    fetcher,
    primary,
    fallbacks,
    reviewer,
    unavailable: new Set(),
    lastFailure: undefined,
    routeEvents: [],
    extractionProvider: undefined,
    lastProvider: undefined,
    maxDecisionTokens: options.maxDecisionTokens,
    ...(options.wait ? { wait: options.wait } : {}),
  };
  return {
    primaryProvider: primary,
    primaryModel: configuredModel(primary, environment),
    ...(options.maxDecisionTokens === undefined
      ? {}
      : { maxDecisionTokens: options.maxDecisionTokens }),
    routeFor: (purpose) => {
      const provider = initialProvider(routing, purpose);
      return { provider, model: configuredModel(provider, environment) };
    },
    reviewEnabled: Boolean(reviewer),
    ...(reviewer ? { reviewProvider: reviewer } : {}),
    routeEvents: routing.routeEvents,
    get lastProvider() {
      return routing.lastProvider;
    },
    complete: (prompt, correction = "", purpose = "extract", maxTokens) =>
      routeCompletion(routing, prompt, correction, purpose, maxTokens),
  };
}

async function routeCompletion(
  routing: Routing,
  prompt: string,
  correction: string,
  purpose: CompletionPurpose,
  maxTokens?: number,
) {
  const selected = initialProvider(routing, purpose);
  if (purpose === "review" && selected === routing.extractionProvider)
    throw new Error(
      "LLM_REVIEW_PROVIDER must differ from the selected extraction provider",
    );
  routing.routeEvents.push({ event: "selected", provider: selected, purpose });
  return routeProviders(
    routing,
    selected,
    prompt,
    correction,
    purpose,
    maxTokens ??
      (purpose === "decision_check" ? routing.maxDecisionTokens : undefined),
  );
}

function initialProvider(routing: Routing, purpose: CompletionPurpose) {
  if (purpose === "review") {
    if (!routing.reviewer)
      throw new Error(
        "LLM_REVIEW_PROVIDER is required for second-provider review",
      );
    return routing.reviewer;
  }
  if (routing.unavailable.has(routing.primary)) {
    const available = [routing.primary, ...routing.fallbacks].find(
      (provider) =>
        !routing.unavailable.has(provider) &&
        Boolean(routing.environment[providerKey[provider]]),
    );
    if (available) return available;
    if (routing.lastFailure) throw routing.lastFailure;
  }
  return routing.primary;
}

async function routeProviders(
  routing: Routing,
  selected: ProviderName,
  prompt: string,
  correction: string,
  purpose: CompletionPurpose,
  maxTokens?: number,
) {
  let provider = selected;
  let from = selected;
  let previous: ProviderFailure | undefined;
  while (true) {
    if (previous) {
      routing.routeEvents.push({
        event: "fallback",
        from,
        to: provider,
        purpose,
        kind: previous.kind,
        ...(previous.status === undefined ? {} : { status: previous.status }),
        ...(previous.providerMessage
          ? { providerMessage: previous.providerMessage }
          : {}),
        ...(previous.retryAfter ? { retryAfter: previous.retryAfter } : {}),
        ...(previous.rateLimitWindow
          ? { rateLimitWindow: previous.rateLimitWindow }
          : {}),
        ...failureRouteDetails(previous),
      });
    }
    try {
      const output = await completeWith(
        routing,
        provider,
        prompt,
        correction,
        purpose,
        maxTokens,
      );
      routing.lastProvider = provider;
      if (purpose === "extract") routing.extractionProvider = provider;
      return output;
    } catch (error) {
      if (!(error instanceof ProviderFailure)) throw error;
      recordFailure(routing, provider, purpose, error);
      if (!canFallback(error, routing.environment)) throw error;
      routing.unavailable.add(provider);
      routing.lastFailure = error;
      const next = nextProvider(routing, provider, purpose);
      if (!next) throw error;
      previous = error;
      from = provider;
      provider = next;
    }
  }
}

function nextProvider(
  routing: Routing,
  current: ProviderName,
  purpose: CompletionPurpose,
) {
  const providers = [routing.primary, ...routing.fallbacks];
  const index = providers.indexOf(current);
  return providers
    .slice(index + 1)
    .find(
      (provider) =>
        !routing.unavailable.has(provider) &&
        Boolean(routing.environment[providerKey[provider]]) &&
        !(purpose === "review" && provider === routing.extractionProvider),
    );
}

function recordFailure(
  routing: Routing,
  provider: ProviderName,
  purpose: CompletionPurpose,
  error: ProviderFailure,
) {
  routing.routeEvents.push({
    event: "failed",
    provider,
    purpose,
    kind: error.kind,
    ...(error.status === undefined ? {} : { status: error.status }),
    ...(error.providerMessage
      ? { providerMessage: error.providerMessage }
      : {}),
    ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    ...(error.rateLimitWindow
      ? { rateLimitWindow: error.rateLimitWindow }
      : {}),
    ...failureRouteDetails(error),
  });
}

function failureRouteDetails(error: ProviderFailure) {
  return {
    ...providerCauseDetails(error.cause),
    ...(error.causeName ? { causeName: error.causeName } : {}),
    ...(error.causeCode ? { causeCode: error.causeCode } : {}),
    ...(error.upstreamProvider
      ? { upstreamProvider: error.upstreamProvider }
      : {}),
    ...(error.upstreamRaw ? { upstreamRaw: error.upstreamRaw } : {}),
    ...(error.elapsedMs === undefined ? {} : { elapsedMs: error.elapsedMs }),
  };
}

function completeWith(
  routing: Routing,
  name: ProviderName,
  prompt: string,
  correction: string,
  purpose: CompletionPurpose,
  maxTokens?: number,
) {
  return completionProvider(
    name,
    routing.environment,
    routing.fetcher,
    (failure, attempt, retrying) => {
      routing.routeEvents.push({
        event: "rate_limit",
        provider: "gemini",
        purpose,
        status: failure.status ?? 429,
        attempt,
        retrying,
        providerMessage: failure.providerMessage ?? "",
        ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}),
        ...(failure.rateLimitWindow
          ? { rateLimitWindow: failure.rateLimitWindow }
          : {}),
      });
      process.stderr.write(`${JSON.stringify(routing.routeEvents.at(-1))}\n`);
    },
    (failure, attempt, retrying) => {
      routing.routeEvents.push({
        event: "retry",
        provider: "gemini",
        purpose,
        status: failure.status ?? 503,
        attempt,
        retrying,
        providerMessage: failure.providerMessage ?? "",
      });
      process.stderr.write(`${JSON.stringify(routing.routeEvents.at(-1))}\n`);
    },
    routing.wait,
  ).complete(prompt, correction, purpose, maxTokens);
}

function canFallback(error: ProviderFailure, environment: NodeJS.ProcessEnv) {
  if (error.provider === "gemini" && error.rateLimitWindow === "day")
    return true;
  if (error.kind === "transient" || error.kind === "rate_limit") return true;
  return error.kind === "quota" && environment.LLM_FALLBACK_ON_QUOTA === "true";
}
