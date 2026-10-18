import AskWorkspace from "../../../../../components/ask-workspace";

type AskPageProps = {
  params: Promise<{ owner: string; name: string }>;
  searchParams: Promise<{ functionId?: string }>;
};

export default async function AskPage({ params, searchParams }: AskPageProps) {
  const [{ owner, name }, query] = await Promise.all([params, searchParams]);
  const repository = `${owner}/${name}`;
  return (
    <AskWorkspace
      repository={repository}
      initialFunctionId={
        query.functionId ?? "fn:packages/vite/src/node/config.ts#resolveConfig"
      }
    />
  );
}
