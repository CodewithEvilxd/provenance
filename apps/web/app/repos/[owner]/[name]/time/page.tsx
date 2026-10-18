import RepoWorkspace from "../../../../../components/repo-workspace";

type PageProps = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryTimeSliderPage({ params }: PageProps) {
  const { owner, name } = await params;
  const repository = `${owner}/${name}`;
  return <RepoWorkspace repository={repository} defaultTab="time" />;
}
