import { analyzeRepositoryOwnership } from "@provenance/agents/ownership";
import RepoWorkspace from "../../../../components/repo-workspace";

type PageProps = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryOverviewPage({ params }: PageProps) {
  const { owner, name } = await params;
  const repository = `${owner}/${name}`;
  const graph = process.env.PROVENANCE_GRAPH ?? `repo:${repository}`;
  const initialOwnership = await analyzeRepositoryOwnership(graph, repository).catch(() => null);

  return (
    <RepoWorkspace
      repository={repository}
      defaultTab="ownership"
      initialOwnership={initialOwnership}
    />
  );
}
