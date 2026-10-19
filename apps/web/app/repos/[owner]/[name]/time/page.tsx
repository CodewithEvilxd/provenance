import { queryTimeline } from "@provenance/agents/timeline";
import RepoWorkspace from "../../../../../components/repo-workspace";

type PageProps = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryTimeSliderPage({ params }: PageProps) {
  const { owner, name } = await params;
  const repository = `${owner}/${name}`;
  const graph = process.env.PROVENANCE_GRAPH ?? `repo:${repository}`;
  const initialTimeline = await queryTimeline(graph, repository).catch(() => null);

  return (
    <RepoWorkspace
      repository={repository}
      defaultTab="time"
      initialTimeline={initialTimeline}
    />
  );
}
