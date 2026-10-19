import { analyzeRepositoryOwnership } from "@provenance/agents/ownership";
import { getDemoOwnership } from "@/lib/demo-data";
import RepoWorkspace from "@/components/repo-workspace";

type PageProps = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryOverviewPage({ params }: PageProps) {
  const { owner, name } = await params;
  const repository = `${owner}/${name}`;
  const graph = process.env.PROVENANCE_GRAPH ?? `repo:${repository}`;
  
  let initialOwnership = null;
  try {
    initialOwnership = await analyzeRepositoryOwnership(graph, repository);
  } catch {
    initialOwnership = getDemoOwnership(repository);
  }
  if (!initialOwnership) {
    initialOwnership = getDemoOwnership(repository);
  }

  return (
    <RepoWorkspace
      repository={repository}
      defaultTab="ownership"
      initialOwnership={initialOwnership}
    />
  );
}
