import type { GroundTruthItem } from "./eval-types.js";

export const HISTORICAL_EVALUATION_DATASET: GroundTruthItem[] = [
  {
    repo: "vitejs/vite",
    pr: 22832,
    title: "fix(hmr): handle circular import with boundary",
    merged_at: "2026-07-17T11:12:16Z",
    ground_truth_risk: "high",
    is_risky: true,
    label_source: "incident:regression:issue:23197",
    label_rationale:
      "Introduced HMR circular dependency regression requiring rollback in issue #23197",
  },
  {
    repo: "vitejs/vite",
    pr: 22992,
    title: "fix(hmr): preserve environment snapshot during server restart",
    merged_at: "2026-07-24T05:49:23Z",
    ground_truth_risk: "high",
    is_risky: true,
    label_source: "core-runtime:hmr-blast-radius",
    label_rationale:
      "Touches core HMR environment lifecycle state affecting all active dev clients",
  },
  {
    repo: "vitejs/vite",
    pr: 23029,
    title:
      "fix(importAnalysis): interop imports injected into optimized dep files by plugins",
    merged_at: "2026-07-28T11:41:33Z",
    ground_truth_risk: "high",
    is_risky: true,
    label_source: "optimizer:dependency-interop-breakage",
    label_rationale:
      "Changes importAnalysis plugin traversal affecting optimized dependency compilation",
  },
  {
    repo: "vitejs/vite",
    pr: 23158,
    title: "fix(server): use a random port when port is 0",
    merged_at: "2026-08-06T13:01:24Z",
    ground_truth_risk: "medium",
    is_risky: true,
    label_source: "server:network-binding-change",
    label_rationale:
      "Modifies HTTP server port binding behavior affecting downstream test runners",
  },
  {
    repo: "vitejs/vite",
    pr: 23172,
    title: "refactor: remove HmrUrl concept",
    merged_at: "2026-08-21T09:07:38Z",
    ground_truth_risk: "high",
    is_risky: true,
    label_source: "hmr:protocol-breaking-change",
    label_rationale:
      "Removes fundamental HmrUrl abstraction across server and client transforms",
  },
  {
    repo: "vitejs/vite",
    pr: 23256,
    title: "fix(config): close bundles when generation fails",
    merged_at: "2026-08-21T04:02:44Z",
    ground_truth_risk: "medium",
    is_risky: true,
    label_source: "bundler:resource-leak-prevention",
    label_rationale:
      "Alters rollup bundle lifecycle and error disposal in build generation",
  },
  {
    repo: "vitejs/vite",
    pr: 23333,
    title: "feat(devtools): enable dev server integration",
    merged_at: "2026-09-07T05:29:06Z",
    ground_truth_risk: "high",
    is_risky: true,
    label_source: "server:middleware-interception",
    label_rationale:
      "Injects devtools middleware hooks directly into server request pipeline",
  },
  {
    repo: "vitejs/vite",
    pr: 23387,
    title: "fix(html): don't inline preload link targets (fix #13355)",
    merged_at: "2026-09-04T10:12:06Z",
    ground_truth_risk: "medium",
    is_risky: true,
    label_source: "html-plugin:preload-injection",
    label_rationale:
      "Changes script/asset preload tag generation for HTML template entrypoints",
  },
  {
    repo: "vitejs/vite",
    pr: 23463,
    title: "feat(bundled-dev): support import.meta.hot.acceptExports",
    merged_at: "2026-10-08T10:46:53Z",
    ground_truth_risk: "high",
    is_risky: true,
    label_source: "hmr:client-api-extension",
    label_rationale:
      "Expands client-side HMR API contract with partial module accept semantics",
  },
  {
    repo: "vitejs/vite",
    pr: 23646,
    title:
      "perf(module-runner): skip cloning call sites that have no source map",
    merged_at: "2026-10-08T03:03:16Z",
    ground_truth_risk: "medium",
    is_risky: true,
    label_source: "module-runner:stack-trace-transformation",
    label_rationale:
      "Alters Node module runner stack frame capture and error presentation",
  },
  {
    repo: "vitejs/vite",
    pr: 21802,
    title: "docs: fix grammer in environment API page",
    merged_at: "2026-10-01T01:59:37Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "documentation-only-change",
    label_rationale:
      "Fixes typos in markdown documentation; zero code modifications",
  },
  {
    repo: "vitejs/vite",
    pr: 22964,
    title: "refactor: use named regex constants over inline literals",
    merged_at: "2026-08-17T06:51:25Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "isolated-refactor:zero-behavior-change",
    label_rationale:
      "Extracts regex literals to named module constants with no logic changes",
  },
  {
    repo: "vitejs/vite",
    pr: 22974,
    title: "docs(config): rewrite VS Code debugging section",
    merged_at: "2026-07-24T06:03:34Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "documentation-only-change",
    label_rationale:
      "Updates configuration guide markdown for editor debugging",
  },
  {
    repo: "vitejs/vite",
    pr: 23042,
    title: "feat(cli): support naming the CPU profile via --profile [name]",
    merged_at: "2026-08-21T09:07:57Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "cli-flag:isolated-diagnostic-option",
    label_rationale:
      "Adds optional diagnostic command line flag; does not affect dev/build execution",
  },
  {
    repo: "vitejs/vite",
    pr: 23077,
    title:
      "test(bundled-dev): wait for first bundle and client before assertions",
    merged_at: "2026-07-28T07:42:49Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "test-stability-enhancement",
    label_rationale:
      "Modifies end-to-end test suite assertion wait timing with zero production changes",
  },
  {
    repo: "vitejs/vite",
    pr: 23078,
    title: "test(bundled-dev): enable assets playgrounds",
    merged_at: "2026-08-04T09:14:27Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "test-suite-expansion",
    label_rationale:
      "Enables existing playground test cases without framework modifications",
  },
  {
    repo: "vitejs/vite",
    pr: 23079,
    title: "test(bundled-dev): enable css playgrounds",
    merged_at: "2026-08-04T09:15:36Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "test-suite-expansion",
    label_rationale: "Unblocks playground tests in CI with zero runtime effect",
  },
  {
    repo: "vitejs/vite",
    pr: 23080,
    title: "test(bundled-dev): enable sourcemap playgrounds",
    merged_at: "2026-08-06T11:24:34Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "test-suite-expansion",
    label_rationale: "Enables sourcemap validation tests in test directory",
  },
  {
    repo: "vitejs/vite",
    pr: 23116,
    title: "ci: setup PR-driven release",
    merged_at: "2026-08-21T04:18:48Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "ci-workflow-automation",
    label_rationale:
      "Modifies GitHub Actions workflow configuration in .github directory",
  },
  {
    repo: "vitejs/vite",
    pr: 23222,
    title: "docs: correct the type of server.middlewareMode",
    merged_at: "2026-08-11T07:46:33Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "documentation-only-change",
    label_rationale:
      "Corrects TypeScript type description in markdown documentation table",
  },
  {
    repo: "vitejs/vite",
    pr: 23311,
    title: "ci: set up bot workflow and ai policy",
    merged_at: "2026-08-21T15:31:30Z",
    ground_truth_risk: "low",
    is_risky: false,
    label_source: "ci-workflow-automation",
    label_rationale:
      "Configures PR triage automation workflow in repository metadata",
  },
];

export function validateGroundTruthDataset(
  dataset: GroundTruthItem[] = HISTORICAL_EVALUATION_DATASET,
): { valid: boolean; errors: string[]; items: GroundTruthItem[] } {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const item of dataset) {
    const key = `${item.repo}#${item.pr}`;
    if (seen.has(key)) {
      errors.push(`Duplicate PR in dataset: ${key}`);
    }
    seen.add(key);

    const parsedTime = Date.parse(item.merged_at);
    if (Number.isNaN(parsedTime)) {
      errors.push(`Invalid cutoff timestamp for PR ${key}: ${item.merged_at}`);
    }
    if (!item.label_source || item.label_source.trim().length === 0) {
      errors.push(`Missing label_source for PR ${key}`);
    }
    if (!item.label_rationale || item.label_rationale.trim().length === 0) {
      errors.push(`Missing label_rationale for PR ${key}`);
    }
  }

  return { valid: errors.length === 0, errors, items: dataset };
}
