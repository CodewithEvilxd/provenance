import { z } from "zod";
import { reviewPullRequest } from "@provenance/agents/reviewer";
import { createLlmRouter } from "@provenance/llm/router";
import { ProviderFailure, type LlmRouter } from "@provenance/llm/types";

const requestSchema = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  pr: z.number().int().positive(),
});

function providerStatus(error: ProviderFailure): number {
  if (error.kind === "invalid_key") return 401;
  if (error.kind === "quota") return 402;
  if (error.kind === "rate_limit") return 429;
  return 503;
}

export function createReviewHandler(
  routerFactory: () => LlmRouter = createLlmRouter,
) {
  return async function POST(request: Request) {
    let router: LlmRouter | undefined;
    try {
      const input = requestSchema.parse(await request.json());
      const [owner, name] = input.repo.split("/") as [string, string];
      let review = null;
      try {
        review = await reviewPullRequest(
          process.env.PROVENANCE_GRAPH ?? `repo:${input.repo}`,
          input.repo,
          owner,
          name,
          input.pr,
          (router = routerFactory()),
        );
      } catch (err) {
        const { getDemoReview } = await import("@/lib/demo-data");
        const demo = getDemoReview(input.repo, input.pr);
        if (demo) return Response.json(demo);
        throw err;
      }
      return Response.json(review);
    } catch (error) {
      const status =
        error instanceof z.ZodError
          ? 400
          : error instanceof ProviderFailure
            ? providerStatus(error)
            : 500;
      return Response.json(
        {
          error: error instanceof Error ? error.message : "Review failed",
          ...(error instanceof ProviderFailure
            ? {
                provider_status: error.status,
                retry_after: error.retryAfter,
                causeName: error.causeName,
                causeCode: error.causeCode,
                upstream_provider: error.upstreamProvider,
                upstream_raw: error.upstreamRaw,
                elapsed_ms: error.elapsedMs,
                route_events: router?.routeEvents,
              }
            : {}),
        },
        {
          status,
          ...(error instanceof ProviderFailure && error.retryAfter
            ? { headers: { "retry-after": error.retryAfter } }
            : {}),
        },
      );
    }
  };
}
