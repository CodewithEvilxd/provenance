import { z } from "zod";
import { analyzeRepositoryOwnership } from "@provenance/agents/ownership";

const querySchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  sinceMs: z.coerce.number().int().positive().optional(),
  threshold: z.coerce.number().min(0.1).max(1.0).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = querySchema.parse(body);
    const graph = process.env.PROVENANCE_GRAPH ?? `repo:${input.repository}`;
    let report = null;
    try {
      report = await analyzeRepositoryOwnership(
        graph,
        input.repository,
        input.sinceMs,
        input.threshold,
      );
    } catch (err) {
      const { getDemoOwnership } = await import("@/lib/demo-data");
      const demo = getDemoOwnership(input.repository);
      if (demo) return Response.json(demo);
      throw err;
    }
    return Response.json(report);
  } catch (error) {
    const isValidation = error instanceof z.ZodError;
    return Response.json(
      {
        error: isValidation
          ? error.issues
          : error instanceof Error
            ? error.message
            : "Ownership analysis failed",
      },
      { status: isValidation ? 400 : 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repoParam = url.searchParams.get("repo");
  const sinceParam = url.searchParams.get("since");
  const thresholdParam = url.searchParams.get("threshold");
  return POST(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository: repoParam,
        sinceMs: sinceParam ? Number(sinceParam) : undefined,
        threshold: thresholdParam ? Number(thresholdParam) : undefined,
      }),
    }),
  );
}
