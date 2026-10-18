import { providerNames } from "../packages/llm/src/provider-config.js";
import type { ProviderName } from "../packages/llm/src/types.js";

export type ReviewLiveOptions = {
  repo: string;
  pr: number;
  dryRun: boolean;
  provider: ProviderName;
  model: string;
  maxTokens: number;
};

export const REVIEW_LIVE_DEFAULTS = {
  provider: "openrouter" as const,
  model: "nvidia/nemotron-3-super-120b-a12b:free",
  maxTokens: 200,
};

export function parseReviewLiveOptions(args: string[]): ReviewLiveOptions {
  const values = new Map<string, string>();
  const positional: string[] = [];
  let dryRun = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!arg?.startsWith("--")) {
      if (arg) positional.push(arg);
      continue;
    }
    const [flag, inlineValue] = arg.split(/=(.*)/s, 2);
    if (!flag || !["--provider", "--model", "--max-tokens"].includes(flag))
      throw new Error(`Unknown review:live option: ${flag ?? arg}`);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith("--"))
      throw new Error(`${flag} requires a value`);
    values.set(flag, value);
  }
  if (positional.length !== 2)
    throw new Error(
      "Usage: pnpm review:live -- owner/name PR [--dry-run] [--provider ID] [--model ID] [--max-tokens N]",
    );
  const [repo, prText] = positional;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error("Repository must use owner/name format");
  const pr = Number(prText);
  if (!Number.isSafeInteger(pr) || pr < 1)
    throw new Error("PR must be a positive integer");
  const providerValue =
    values.get("--provider") ?? REVIEW_LIVE_DEFAULTS.provider;
  if (!providerNames.includes(providerValue as ProviderName))
    throw new Error(`Unsupported provider: ${providerValue}`);
  const model = values.get("--model") ?? REVIEW_LIVE_DEFAULTS.model;
  if (!model.trim()) throw new Error("--model must not be empty");
  const maxTokens = Number(
    values.get("--max-tokens") ?? REVIEW_LIVE_DEFAULTS.maxTokens,
  );
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096)
    throw new Error("--max-tokens must be an integer from 1 to 4096");
  return {
    repo,
    pr,
    dryRun,
    provider: providerValue as ProviderName,
    model,
    maxTokens,
  };
}
