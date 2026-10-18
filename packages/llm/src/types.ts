export type ProviderName = "openai" | "gemini" | "anthropic" | "openrouter";
export type CompletionPurpose = "extract" | "review" | "decision_check";

export type ProviderFailureKind =
  | "invalid_key"
  | "rate_limit"
  | "quota"
  | "transient"
  | "malformed"
  | "unsupported";

export type RateLimitWindow = "minute" | "day";
export type ProviderFailureDetails = {
  providerMessage?: string;
  retryAfter?: string;
  rateLimitWindow?: RateLimitWindow;
  causeName?: string;
  causeCode?: string;
  upstreamProvider?: string;
  upstreamRaw?: string;
  elapsedMs?: number;
};

export function providerCauseDetails(cause: unknown): {
  causeName?: string;
  causeCode?: string;
} {
  let current = cause;
  let deepest: Error | undefined;
  while (current instanceof Error) {
    deepest = current;
    current = current.cause;
  }
  if (!deepest) return {};
  const code =
    "code" in deepest && typeof deepest.code === "string"
      ? deepest.code.match(/^[A-Z0-9_-]{1,40}$/)?.[0]
      : undefined;
  return {
    causeName: deepest.name.slice(0, 40),
    ...(code ? { causeCode: code } : {}),
  };
}

export class ProviderFailure extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly kind: ProviderFailureKind,
    message: string,
    readonly status?: number,
    cause?: unknown,
    details: ProviderFailureDetails = {},
  ) {
    super(`${provider} ${kind}: ${message}`, { cause });
    this.name = "ProviderFailure";
    this.providerMessage = details.providerMessage;
    this.retryAfter = details.retryAfter;
    this.rateLimitWindow = details.rateLimitWindow;
    this.causeName = details.causeName;
    this.causeCode = details.causeCode;
    this.upstreamProvider = details.upstreamProvider;
    this.upstreamRaw = details.upstreamRaw;
    this.elapsedMs = details.elapsedMs;
  }

  readonly providerMessage: string | undefined;
  readonly retryAfter: string | undefined;
  readonly rateLimitWindow: RateLimitWindow | undefined;
  readonly causeName: string | undefined;
  readonly causeCode: string | undefined;
  readonly upstreamProvider: string | undefined;
  readonly upstreamRaw: string | undefined;
  readonly elapsedMs: number | undefined;
}

export type LlmRouteEvent =
  | { event: "selected"; provider: ProviderName; purpose: CompletionPurpose }
  | {
      event: "failed";
      provider: ProviderName;
      purpose: CompletionPurpose;
      kind: ProviderFailureKind;
      status?: number;
      causeName?: string;
      causeCode?: string;
      providerMessage?: string;
      retryAfter?: string;
      rateLimitWindow?: RateLimitWindow;
      upstreamProvider?: string;
      upstreamRaw?: string;
      elapsedMs?: number;
    }
  | {
      event: "fallback";
      from: ProviderName;
      to: ProviderName;
      purpose: CompletionPurpose;
      kind: ProviderFailureKind;
      status?: number;
      causeName?: string;
      causeCode?: string;
      providerMessage?: string;
      retryAfter?: string;
      rateLimitWindow?: RateLimitWindow;
      upstreamProvider?: string;
      upstreamRaw?: string;
      elapsedMs?: number;
    }
  | {
      event: "rate_limit";
      provider: "gemini";
      purpose: CompletionPurpose;
      status: number;
      attempt: number;
      retrying: boolean;
      providerMessage: string;
      retryAfter?: string;
      rateLimitWindow?: RateLimitWindow;
    }
  | {
      event: "retry";
      provider: "gemini";
      purpose: CompletionPurpose;
      status: number;
      attempt: number;
      retrying: boolean;
      providerMessage: string;
    };

export type CompletionProvider = {
  name: ProviderName;
  complete(
    prompt: string,
    correction?: string,
    purpose?: CompletionPurpose,
    maxTokens?: number,
  ): Promise<string>;
};

export function outputTokenLimit(
  purpose: CompletionPurpose,
  maxTokens?: number,
) {
  return (
    maxTokens ??
    (purpose === "review" || purpose === "decision_check" ? 200 : 2048)
  );
}

export type LlmRouter = {
  primaryProvider: ProviderName;
  primaryModel: string;
  routeFor(purpose: CompletionPurpose): {
    provider: ProviderName;
    model: string;
  };
  maxDecisionTokens?: number;
  reviewEnabled: boolean;
  reviewProvider?: ProviderName;
  lastProvider?: ProviderName | undefined;
  routeEvents: LlmRouteEvent[];
  complete(
    prompt: string,
    correction?: string,
    purpose?: CompletionPurpose,
    maxTokens?: number,
  ): Promise<string>;
};
