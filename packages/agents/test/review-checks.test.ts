import { describe, expect, it } from "vitest";
import type { ActiveDecisionRow } from "@provenance/graph/queries";
import { buildReviewChecks } from "../src/review-checks.js";

const decision: ActiveDecisionRow = {
  id: "decision:cache:1",
  summary: "Keep the cache bounded.",
  reason: "Unbounded entries can exhaust memory.",
  strength: "hard",
  confidence: 0.9,
  target: "fn:src/cache.ts#put",
  sources: ["comment:review:1"],
};
const fn = { id: decision.target, path: "src/cache.ts", start: 20, end: 30 };

describe("buildReviewChecks", () => {
  it("keeps only overlapping hunks and bounds all model input", () => {
    const unrelated = "@@ -100,2 +100,2 @@\n-old()\n+new()";
    const relevant = `@@ -24,2 +24,2 @@\n-${"x".repeat(5000)}\n+changed()`;
    const checks = buildReviewChecks(
      [{ ...decision, summary: "S".repeat(250), reason: "R".repeat(250) }],
      [{ filename: fn.path, patch: `${unrelated}\n${relevant}` }],
      [fn],
    );

    expect(checks).toHaveLength(1);
    expect(checks[0]?.hunk).not.toContain("old()");
    expect(checks[0]?.hunk.length).toBeLessThanOrEqual(4000);
    expect(checks[0]?.prompt).toContain("S".repeat(250));
    expect(checks[0]?.prompt).not.toContain("R".repeat(250));
    expect(checks[0]?.prompt.split("\n").slice(0, 3)).toEqual([
      "Check whether this diff violates the engineering decision.",
      'Return compact JSON only: {"violated": boolean, "evidence": "..."}; evidence must be at most 150 characters.',
      "If uncertain, set violated to false.",
    ]);
  });

  it("skips decisions with no changed constrained function or overlapping hunk", () => {
    expect(buildReviewChecks([decision], [], [fn])).toEqual([]);
    expect(
      buildReviewChecks(
        [decision],
        [{ filename: fn.path, patch: "@@ -100,1 +100,1 @@\n-old\n+new" }],
        [fn],
      ),
    ).toEqual([]);
    expect(
      buildReviewChecks(
        [decision],
        [{ filename: fn.path, patch: "@@ -24,1 +24,1 @@\n-old\n+new" }],
        [],
      ),
    ).toEqual([]);
  });

  it("accepts only cache-migration version 5 after the prompt change", async () => {
    const { extractionCacheInput } =
      await import("../../decisions/src/extract.js");
    expect(
      extractionCacheInput(
        { number: 1, title: "T", body: "", comments: [] },
        [],
      ),
    ).toContain('"version":5');
  });
});
