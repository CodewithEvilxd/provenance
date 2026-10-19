import demoReview23333Data from "./demo-review-23333.json";
import demoOwnershipViteData from "./demo-ownership-vite.json";
import demoTimelineViteData from "./demo-timeline-vite.json";
import evalReportData from "./eval-report.json";
import type { ReviewResult } from "@provenance/agents/reviewer";
import type { RepositoryOwnershipReport } from "@provenance/agents/ownership";
import type { TimelineReport } from "@provenance/agents/timeline";
import type { EvaluationReport } from "@provenance/agents/eval-types";

export function getDemoReview(repo: string, pr: number): ReviewResult | null {
  if (repo.toLowerCase() === "vitejs/vite" && pr === 23333) {
    return demoReview23333Data as unknown as ReviewResult;
  }
  return null;
}

export function getDemoOwnership(repo: string): RepositoryOwnershipReport | null {
  if (repo.toLowerCase() === "vitejs/vite") {
    return demoOwnershipViteData as unknown as RepositoryOwnershipReport;
  }
  return null;
}

export function getDemoTimeline(repo: string): TimelineReport | null {
  if (repo.toLowerCase() === "vitejs/vite") {
    return demoTimelineViteData as unknown as TimelineReport;
  }
  return null;
}

export function getDemoEvalReport(): EvaluationReport | null {
  return evalReportData as unknown as EvaluationReport;
}
