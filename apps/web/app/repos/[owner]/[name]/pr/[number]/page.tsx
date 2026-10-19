import { getDemoReview } from "@/lib/demo-data";
import ReviewWorkspace from "@/components/review-workspace";

type PageProps = {
  params: Promise<{ owner: string; name: string; number: string }>;
};

export default async function PullRequestPage({ params }: PageProps) {
  const { owner, name, number: numberValue } = await params;
  const number = Number(numberValue);
  const repo = `${owner}/${name}`;
  const initial = Number.isSafeInteger(number)
    ? getDemoReview(repo, number)
    : null;
  return <ReviewWorkspace initial={initial} repo={repo} pr={number} />;
}
