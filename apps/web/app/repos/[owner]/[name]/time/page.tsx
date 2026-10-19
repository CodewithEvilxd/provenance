import { queryTimeline } from "@provenance/agents/timeline";
import { getDemoTimeline } from "@/lib/demo-data";
import RepoWorkspace from "@/components/repo-workspace";

type PageProps = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryTimeSliderPage({ params }: PageProps) {
  const { owner, name } = await params;
  const repository = `${owner}/${name}`;
  const graph = process.env.PROVENANCE_GRAPH ?? `repo:${repository}`;

  let initialTimeline = null;
  try {
    initialTimeline = await queryTimeline(graph, repository);
  } catch {
    initialTimeline = getDemoTimeline(repository);
  }
  if (!initialTimeline) {
    initialTimeline = getDemoTimeline(repository);
  }

  return (
    <RepoWorkspace
      repository={repository}
      defaultTab="time"
      initialTimeline={initialTimeline}
    />
  );
}
