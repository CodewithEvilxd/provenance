import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runHistoricalEvaluation } from "@provenance/agents/eval";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const thresholdParam = url.searchParams.get("threshold");
  const threshold = thresholdParam ? Number(thresholdParam) : undefined;
  const refresh = url.searchParams.get("refresh") === "true";

  const candidate1 = resolve(
    process.cwd(),
    "tests/corpus-measurements/eval-report.json",
  );
  const candidate2 = resolve(
    process.cwd(),
    "../../tests/corpus-measurements/eval-report.json",
  );
  const reportPath = existsSync(candidate1) ? candidate1 : candidate2;

  if (!refresh) {
    try {
      const existing = await readFile(reportPath, "utf8");
      const parsed = JSON.parse(existing);
      return Response.json(parsed);
    } catch {
      const { getDemoEvalReport } = await import("@/lib/demo-data");
      const fallback = getDemoEvalReport();
      if (fallback) return Response.json(fallback);
    }
  }

  try {
    const report = await runHistoricalEvaluation({
      riskThreshold: threshold,
      outputPath: reportPath,
    });
    return Response.json(report);
  } catch (error) {
    const { getDemoEvalReport } = await import("@/lib/demo-data");
    const fallback = getDemoEvalReport();
    if (fallback) return Response.json(fallback);
    return Response.json(
      { error: error instanceof Error ? error.message : "Evaluation failed" },
      { status: 500 },
    );
  }
}
