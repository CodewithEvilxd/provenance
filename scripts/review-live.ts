import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { parseReviewLiveOptions } = await import("./review-live-options.js");
let options: ReturnType<typeof parseReviewLiveOptions> | undefined;
try {
  options = parseReviewLiveOptions(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Invalid review:live options"}\n`,
  );
  process.exitCode = 2;
}
if (options) {
  const { repo, pr, dryRun, provider, model, maxTokens } = options;
  if (!dryRun) {
    process.env.LLM_PROVIDER = provider;
    process.env[`${provider.toUpperCase()}_MODEL`] = model;
    process.env.LLM_FALLBACK_PROVIDERS = "";
  }
  process.env.GITHUB_CACHE_ONLY = String(dryRun);
  process.env.PROVENANCE_GRAPH = `repo:${repo}`;
  const { activeDecisions } = await import("../packages/graph/src/queries.js");
  const { closeGraphClient } = await import("../packages/graph/src/client.js");
  const { pullFiles } =
    await import("../packages/ingest/src/github-discussions.js");
  const { buildReviewChecks } =
    await import("../packages/agents/src/review-checks.js");
  const { changedFunctions, reviewResultSchema } =
    await import("../packages/agents/src/reviewer.js");
  const graph = `repo:${repo}`;
  const [owner, name] = repo.split("/") as [string, string];
  try {
    const files = await pullFiles(owner, name, pr);
    const changed = await changedFunctions(graph, files);
    const decisions = await activeDecisions(
      graph,
      changed.map(({ id }) => id),
      files.map(({ filename }) => filename),
    );
    const checks = buildReviewChecks(decisions, files, changed);
    const unique = new Map(
      checks.map((check) => [
        JSON.stringify([check.decision.id, check.hunk]),
        check,
      ]),
    );

    const uniqueDecisions = [
      ...new Map(decisions.map((decision) => [decision.id, decision])).values(),
    ];
    process.stdout.write(
      `PR #${pr}: ${changed.length} changed Functions; ${uniqueDecisions.length} unique active Decisions.\n`,
    );
    for (const decision of uniqueDecisions) {
      const likelyNit =
        /\b(documentation|docs?|naming|rename|wording|typo|style|spelling)\b/i.test(
          `${decision.summary} ${decision.reason}`,
        );
      process.stdout.write(
        `Decision ${decision.id} [${decision.strength}]: ${decision.summary}${likelyNit ? " [possible documentation/naming nit; inspect source]" : ""}\n`,
      );
    }
    process.stdout.write(
      `Decision checks to run: ${unique.size}${dryRun ? " (dry run; no external requests)" : ""}\n`,
    );
    let totalCharacters = 0;
    for (const [index, check] of [...unique.values()].entries()) {
      totalCharacters += check.prompt.length;
      process.stdout.write(
        `Check ${index + 1}: ${check.decision.id}; input characters=${check.prompt.length}\n`,
      );
    }
    process.stdout.write(`Total input characters: ${totalCharacters}\n`);
    if (!dryRun) {
      const { createLlmRouter } = await import("../packages/llm/src/router.js");
      const { providerKey } =
        await import("../packages/llm/src/provider-config.js");
      const router = createLlmRouter(process.env, fetch, {
        maxDecisionTokens: maxTokens,
      });
      if (router.primaryProvider !== provider)
        throw new Error(
          `Live review must use the ${provider} primary provider`,
        );
      if (!router.primaryModel.trim())
        throw new Error(
          `${provider.toUpperCase()}_MODEL is required before live review`,
        );
      if (!process.env[providerKey[provider]]?.trim())
        throw new Error(`${providerKey[provider]} is required in .env.local`);
      const route = router.routeFor("decision_check");
      if (!route.provider || !route.model.trim())
        throw new Error("Provider and model must be configured before review");
      for (const [index] of [...unique.values()].entries())
        process.stdout.write(
          `Check ${index + 1} route: provider=${route.provider}; model=${route.model}; max_tokens=${maxTokens}\n`,
        );
      const { createReviewHandler } =
        await import("../apps/web/app/api/review/route.js");
      const POST = createReviewHandler(() => router);
      const requestStartedAt = Date.now();
      const response = await POST(
        new Request("http://localhost/api/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo, pr }),
        }),
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const failureBody =
          typeof body === "object" && body !== null
            ? (body as {
                provider_status?: number;
                retry_after?: string;
                elapsed_ms?: number;
              })
            : undefined;
        const details = {
          endpointStatus: response.status,
          status: failureBody?.provider_status ?? response.status,
          retryAfter:
            response.headers.get("retry-after") ??
            failureBody?.retry_after ??
            null,
          elapsedMs: failureBody?.elapsed_ms ?? Date.now() - requestStartedAt,
          body,
        };
        process.stderr.write(`${JSON.stringify(details)}\n`);
        throw new Error(`Review endpoint returned HTTP ${response.status}`);
      }
      const result = reviewResultSchema.parse(body);
      const outputPath = join(
        process.cwd(),
        "docs",
        `phase3-review-${pr}.json`,
      );
      mkdirSync(join(process.cwd(), "docs"), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(
        `Risk: ${result.risk.score} (${result.risk.band})\n`,
      );
      process.stdout.write(
        `Components: ${JSON.stringify(result.risk.components)}\n`,
      );
      process.stdout.write(`Evidence status: ${result.evidence_status}\n`);
      for (const decision of result.decisions) {
        process.stdout.write(
          `Decision ${decision.id} [${decision.strength}]: ${decision.summary}\nVerdict: available=${decision.available}; violated=${decision.violated}; model=${decision.model_id ?? "none"}; evidence=${decision.evidence}\n`,
        );
      }
      for (const [index, path] of result.paths.entries()) {
        process.stdout.write(
          `Path ${index + 1} (${path.kind}) ends at ${path.nodes.at(-1)?.label ?? "<empty>"}\n`,
        );
      }
      process.stdout.write(`Validated response saved to ${outputPath}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Review run failed"}\n`,
    );
    process.exitCode = 1;
  } finally {
    await closeGraphClient();
  }
}
