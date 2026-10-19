import { FalkorDB } from "falkordb";

type GraphParameter =
  null | string | number | boolean | GraphParameters | GraphParameter[];
export type GraphParameters = { [key: string]: GraphParameter };

export class GraphStepFailure extends Error {
  constructor(
    readonly step: string,
    cause: unknown,
  ) {
    super(`FalkorDB step failed: ${step}`, { cause });
    this.name = "GraphStepFailure";
  }
}

export async function graphStep<T>(step: string, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GraphStepFailure) throw error;
    throw new GraphStepFailure(step, error);
  }
}

const host = process.env.FALKORDB_HOST ?? "localhost";
const port = Number(process.env.FALKORDB_PORT ?? 6379);

let connection: ReturnType<typeof FalkorDB.connect> | undefined;

export async function selectGraph(graphName: string) {
  connection ??= FalkorDB.connect({
    host,
    port,
    ...(process.env.FALKORDB_PASSWORD
      ? { password: process.env.FALKORDB_PASSWORD }
      : {}),
  });
  return (await connection).selectGraph(graphName);
}

function withTimeout<T>(
  promise: Promise<T>,
  ms = 3500,
  label = "Operation timed out",
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export async function query<Row extends Record<string, unknown>>(
  graphName: string,
  cypher: string,
  params: GraphParameters = {},
): Promise<Row[]> {
  const execute = async () => {
    const graph = await selectGraph(graphName);
    const response = await graph.query<Row>(cypher, {
      params,
    });
    return response.data ?? [];
  };
  return withTimeout(execute(), 3500, `FalkorDB query on ${graphName}`);
}

export async function closeGraphClient() {
  if (!connection) return;
  await (await connection).close();
  connection = undefined;
}
