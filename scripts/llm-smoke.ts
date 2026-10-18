import { existsSync } from "node:fs";
import { z } from "zod";
import { createLlmRouter } from "../packages/llm/src/router.js";
import {
  ProviderFailure,
  providerCauseDetails,
} from "../packages/llm/src/types.js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const provider = process.env.LLM_PROVIDER ?? "unconfigured";
if (process.env.LLM_LIVE_SMOKE !== "true") {
  process.stdout.write(
    `${JSON.stringify({ component: "llm", status: "not_tested", reason: "Set LLM_LIVE_SMOKE=true to enable one live provider request" })}\n`,
  );
} else {
  const environment = {
    ...process.env,
    LLM_FALLBACK_PROVIDER: undefined,
    LLM_REVIEW_PROVIDER: undefined,
  };
  try {
    const router = createLlmRouter(environment);
    const completion = await router.complete(
      'Return only this JSON object: {"ok":true}',
    );
    z.object({ ok: z.literal(true) })
      .strict()
      .parse(JSON.parse(completion));
    process.stdout.write(
      `${JSON.stringify({ component: "llm", status: "success", provider: router.lastProvider, routeEvents: router.routeEvents })}\n`,
    );
  } catch (error) {
    const failure = error instanceof ProviderFailure ? error : undefined;
    process.stderr.write(
      `${JSON.stringify({ component: "llm", status: "failed", provider, ...(failure ? { kind: failure.kind, httpStatus: failure.status, ...providerCauseDetails(failure.cause) } : { message: error instanceof Error ? error.message : "Provider smoke test failed" }) })}\n`,
    );
    process.exitCode = 1;
  }
}
