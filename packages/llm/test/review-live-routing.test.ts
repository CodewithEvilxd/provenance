import { expect, it } from "vitest";
import {
  parseReviewLiveOptions,
  REVIEW_LIVE_DEFAULTS,
} from "../../../scripts/review-live-options.js";
import { createLlmRouter } from "../src/router.js";

it("uses the live command defaults and flags to select a route without network access", () => {
  const defaults = parseReviewLiveOptions(["vitejs/vite", "22832"]);
  expect(defaults).toMatchObject({
    repo: "vitejs/vite",
    pr: 22832,
    ...REVIEW_LIVE_DEFAULTS,
  });

  const flagged = parseReviewLiveOptions([
    "vitejs/vite",
    "22832",
    "--provider",
    "openrouter",
    "--model",
    "chosen/model:free",
    "--max-tokens",
    "123",
  ]);
  expect(flagged).toMatchObject({
    provider: "openrouter",
    model: "chosen/model:free",
    maxTokens: 123,
  });

  let requested = false;
  const router = createLlmRouter(
    {
      LLM_PROVIDER: defaults.provider,
      OPENROUTER_MODEL: defaults.model,
      OPENROUTER_API_KEY: "offline-key",
      LLM_FALLBACK_PROVIDERS: "",
    },
    async () => {
      requested = true;
      throw new Error("Unexpected network access");
    },
    { maxDecisionTokens: defaults.maxTokens },
  );
  expect(router.routeFor("decision_check")).toEqual({
    provider: defaults.provider,
    model: defaults.model,
  });
  expect(router.maxDecisionTokens).toBe(REVIEW_LIVE_DEFAULTS.maxTokens);
  expect(router.reviewEnabled).toBe(false);
  expect(requested).toBe(false);
});
