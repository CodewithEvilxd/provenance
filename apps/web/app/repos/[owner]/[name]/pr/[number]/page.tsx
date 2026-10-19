import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ReviewResult } from "@provenance/agents/reviewer";
import { reviewResultSchema } from "@provenance/agents/reviewer";
import ReviewWorkspace from "../../../../../../components/review-workspace";

type PageProps = {
  params: Promise<{ owner: string; name: string; number: string }>;
};

async function savedDemoReview(number: number): Promise<ReviewResult | null> {
  if (number !== 23333) return null;
  try {
    const c1 = resolve(process.cwd(), "docs/phase3-review-23333.json");
    const c2 = resolve(process.cwd(), "../../docs/phase3-review-23333.json");
    const filePath = existsSync(c1) ? c1 : c2;
    const json = await readFile(filePath, "utf8");
    const parsed = reviewResultSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export default async function PullRequestPage({ params }: PageProps) {
  const { owner, name, number: numberValue } = await params;
  const number = Number(numberValue);
  const repo = `${owner}/${name}`;
  const initial = Number.isSafeInteger(number)
    ? await savedDemoReview(number)
    : null;
  return <ReviewWorkspace initial={initial} repo={repo} pr={number} />;
}
