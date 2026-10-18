import { query } from "@provenance/graph/client";
import { z } from "zod";

export const taskStatusSchema = z.enum(["queued", "running", "done", "failed"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskArtifactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  ref: z.string(),
});

export const taskStateSchema = z.object({
  id: z.string(),
  type: z.string(),
  repo: z.string(),
  scope: z.string().nullable(),
  status: taskStatusSchema,
  payloadRef: z.string().nullable(),
  completedSteps: z.array(z.string()),
  remainingWork: z.string().nullable(),
  blockers: z.string().nullable(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  error: z.string().nullable(),
  agent: z.string().nullable(),
  dependencies: z.array(z.string()),
  artifacts: z.array(taskArtifactSchema),
});

export type TaskState = z.infer<typeof taskStateSchema>;

export type CreateTaskInput = {
  id: string;
  type: string;
  repo: string;
  scope?: string | undefined;
  payloadRef?: string | undefined;
  dependsOn?: string[] | undefined;
  status?: TaskStatus | undefined;
  remainingWork?: string | undefined;
  blockers?: string | undefined;
  createdAt?: number | undefined;
};

export type UpdateTaskInput = {
  status?: TaskStatus | undefined;
  completedSteps?: string[] | undefined;
  remainingWork?: string | undefined;
  blockers?: string | undefined;
  error?: string | undefined;
  agentName?: string | undefined;
  finishedAt?: number | undefined;
  artifact?:
    | {
        id?: string | undefined;
        kind: string;
        ref: string;
      }
    | undefined;
};

const graphName = "state";

export async function createTask(
  input: CreateTaskInput,
): Promise<{ id: string; created: boolean }> {
  const createdAt = input.createdAt ?? Date.now();
  const status = input.status ?? "queued";
  await query(
    graphName,
    "MERGE (t:Task {id: $id}) ON CREATE SET t.created_at = $createdAt SET t.type = $type, t.repo = $repo, t.scope = $scope, t.status = $status, t.payload_ref = $payloadRef, t.remaining_work = $remainingWork, t.blockers = $blockers, t.completed_steps = '[]'",
    {
      id: input.id,
      type: input.type,
      repo: input.repo,
      scope: input.scope ?? null,
      status,
      payloadRef: input.payloadRef ?? null,
      remainingWork: input.remainingWork ?? null,
      blockers: input.blockers ?? null,
      createdAt,
    },
  );
  for (const depId of input.dependsOn ?? []) {
    await query(
      graphName,
      "MATCH (t:Task {id: $id}) MERGE (dep:Task {id: $depId}) MERGE (t)-[:DEPENDS_ON]->(dep)",
      { id: input.id, depId },
    );
  }
  return { id: input.id, created: true };
}

export async function claimTask(
  agentName: string,
  taskType?: string,
): Promise<TaskState | null> {
  const startedAt = Date.now();
  const rows = await query<{
    id: string;
    type: string;
    repo: string;
    scope: string | null;
    status: string;
    payloadRef: string | null;
  }>(
    graphName,
    "MATCH (t:Task {status: 'queued'}) WHERE ($taskType IS NULL OR t.type = $taskType) WITH t LIMIT 1 SET t.status = 'running', t.started_at = $startedAt MERGE (a:Agent {name: $agentName}) MERGE (t)-[:ASSIGNED_TO]->(a) RETURN t.id AS id, t.type AS type, t.repo AS repo, t.scope AS scope, t.status AS status, t.payload_ref AS payloadRef",
    {
      agentName,
      taskType: taskType ?? null,
      startedAt,
    },
  );
  const claimed = rows[0];
  if (!claimed) return null;
  return getTask(claimed.id);
}

export type ClaimWebhookTaskInput = {
  id: string;
  type?: string | undefined;
  repo: string;
  scope?: string | undefined;
  remainingWork?: string | undefined;
  createdAt?: number | undefined;
};

export type ClaimWebhookTaskResult = {
  acquired: boolean;
  status: TaskStatus;
  action: "created" | "retried" | "rejected";
};

export async function claimWebhookTask(
  input: ClaimWebhookTaskInput,
): Promise<ClaimWebhookTaskResult> {
  const createdAt = input.createdAt ?? Date.now();
  const taskType = input.type ?? "pull_request_webhook";
  const rows = await query<{
    id: string;
    status: string;
    action: string;
  }>(
    graphName,
    "MERGE (t:Task {id: $id}) ON CREATE SET t.status = 'running', t.created_at = $createdAt, t.type = $taskType, t.repo = $repo, t.scope = $scope, t.remaining_work = $remainingWork, t.completed_steps = '[]', t.claim_action = 'created' ON MATCH SET t.claim_action = CASE WHEN t.status = 'failed' THEN 'retried' ELSE 'rejected' END, t.error = CASE WHEN t.status = 'failed' THEN null ELSE t.error END, t.finished_at = CASE WHEN t.status = 'failed' THEN null ELSE t.finished_at END, t.status = CASE WHEN t.status = 'failed' THEN 'running' ELSE t.status END RETURN t.id AS id, t.status AS status, t.claim_action AS action",
    {
      id: input.id,
      taskType,
      repo: input.repo,
      scope: input.scope ?? null,
      remainingWork: input.remainingWork ?? null,
      createdAt,
    },
  );
  const row = rows[0];
  const action = (row?.action ?? "rejected") as
    "created" | "retried" | "rejected";
  const status = taskStatusSchema.parse(row?.status ?? "queued");
  const acquired = action === "created" || action === "retried";
  return { acquired, status, action };
}

export async function updateTaskState(
  taskId: string,
  update: UpdateTaskInput,
): Promise<{ id: string; updated: boolean }> {
  const finishedAt =
    update.status === "done" || update.status === "failed"
      ? (update.finishedAt ?? Date.now())
      : null;
  await query(
    graphName,
    "MATCH (t:Task {id: $taskId}) SET t.status = CASE WHEN $status = 'failed' AND t.status = 'done' THEN t.status ELSE coalesce($status, t.status) END, t.completed_steps = coalesce($completedSteps, t.completed_steps), t.remaining_work = coalesce($remainingWork, t.remaining_work), t.blockers = coalesce($blockers, t.blockers), t.error = CASE WHEN $status = 'failed' AND t.status = 'done' THEN t.error ELSE coalesce($error, t.error) END, t.finished_at = CASE WHEN $status = 'failed' AND t.status = 'done' THEN t.finished_at WHEN $finishedAt IS NOT NULL THEN $finishedAt ELSE t.finished_at END",
    {
      taskId,
      status: update.status ?? null,
      completedSteps: update.completedSteps
        ? JSON.stringify(update.completedSteps)
        : null,
      remainingWork: update.remainingWork ?? null,
      blockers: update.blockers ?? null,
      error: update.error ?? null,
      finishedAt,
    },
  );
  if (update.agentName) {
    await query(
      graphName,
      "MATCH (t:Task {id: $taskId}) OPTIONAL MATCH (t)-[old:ASSIGNED_TO]->(:Agent) DELETE old WITH t MERGE (a:Agent {name: $agentName}) MERGE (t)-[:ASSIGNED_TO]->(a)",
      { taskId, agentName: update.agentName },
    );
  }
  if (update.artifact) {
    const artifactId =
      update.artifact.id ?? `artifact:${taskId}:${update.artifact.kind}`;
    await query(
      graphName,
      "MATCH (t:Task {id: $taskId}) MERGE (art:Artifact {id: $artifactId}) SET art.kind = $kind, art.ref = $ref MERGE (t)-[:PRODUCED]->(art)",
      {
        taskId,
        artifactId,
        kind: update.artifact.kind,
        ref: update.artifact.ref,
      },
    );
  }
  return { id: taskId, updated: true };
}

export async function getTask(taskId: string): Promise<TaskState | null> {
  const rows = await query<{
    id: string;
    type: string;
    repo: string;
    scope: string | null;
    status: string;
    payloadRef: string | null;
    completedSteps: string | null;
    remainingWork: string | null;
    blockers: string | null;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    error: string | null;
    agent: string | null;
    dependencies: string[];
    artifacts: { id: string; kind: string; ref: string }[];
  }>(
    graphName,
    "MATCH (t:Task {id: $taskId}) OPTIONAL MATCH (t)-[:ASSIGNED_TO]->(a:Agent) OPTIONAL MATCH (t)-[:DEPENDS_ON]->(dep:Task) OPTIONAL MATCH (t)-[:PRODUCED]->(art:Artifact) RETURN t.id AS id, t.type AS type, t.repo AS repo, t.scope AS scope, t.status AS status, t.payload_ref AS payloadRef, t.completed_steps AS completedSteps, t.remaining_work AS remainingWork, t.blockers AS blockers, t.created_at AS createdAt, t.started_at AS startedAt, t.finished_at AS finishedAt, t.error AS error, a.name AS agent, collect(DISTINCT dep.id) AS dependencies, collect(DISTINCT { id: art.id, kind: art.kind, ref: art.ref }) AS artifacts",
    { taskId },
  );
  const raw = rows[0];
  if (!raw || !raw.id) return null;
  let parsedSteps: string[] = [];
  try {
    if (raw.completedSteps) parsedSteps = JSON.parse(raw.completedSteps);
  } catch {
    parsedSteps = [];
  }
  return taskStateSchema.parse({
    id: String(raw.id),
    type: String(raw.type),
    repo: String(raw.repo),
    scope: raw.scope ? String(raw.scope) : null,
    status: taskStatusSchema.parse(raw.status),
    payloadRef: raw.payloadRef ? String(raw.payloadRef) : null,
    completedSteps: parsedSteps,
    remainingWork: raw.remainingWork ? String(raw.remainingWork) : null,
    blockers: raw.blockers ? String(raw.blockers) : null,
    createdAt: Number(raw.createdAt),
    startedAt: raw.startedAt ? Number(raw.startedAt) : null,
    finishedAt: raw.finishedAt ? Number(raw.finishedAt) : null,
    error: raw.error ? String(raw.error) : null,
    agent: raw.agent ? String(raw.agent) : null,
    dependencies: Array.isArray(raw.dependencies)
      ? raw.dependencies.filter(Boolean).map(String)
      : [],
    artifacts: Array.isArray(raw.artifacts)
      ? raw.artifacts
          .filter((art) => art && art.id && art.kind)
          .map((art) => ({
            id: String(art.id),
            kind: String(art.kind),
            ref: String(art.ref),
          }))
      : [],
  });
}
