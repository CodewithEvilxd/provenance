import { z } from "zod";
import { queryTimeline } from "@provenance/agents/timeline";

const timelineQuerySchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  asOf: z.string().optional(),
  asOfMs: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(300).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = timelineQuerySchema.parse(body);
    let report = null;
    try {
      report = await queryTimeline({
        repository: input.repository,
        asOf: input.asOf,
        asOfMs: input.asOfMs,
        nodeLimit: input.limit,
      });
    } catch (err) {
      const { getDemoTimeline } = await import("@/lib/demo-data");
      const demo = getDemoTimeline(input.repository);
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
            : "Timeline query failed",
      },
      { status: isValidation ? 400 : 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repoParam = url.searchParams.get("repo");
  const asOfParam = url.searchParams.get("asOf");
  const limitParam = url.searchParams.get("limit");
  const isMs = asOfParam && /^\d+$/.test(asOfParam);
  return POST(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository: repoParam,
        asOf: !isMs && asOfParam ? asOfParam : undefined,
        asOfMs: isMs ? Number(asOfParam) : undefined,
        limit: limitParam ? Number(limitParam) : undefined,
      }),
    }),
  );
}
