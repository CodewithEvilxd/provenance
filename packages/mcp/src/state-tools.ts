import {
  claimTask,
  createTask,
  getTask,
  taskStateSchema,
  taskStatusSchema,
  updateTaskState,
} from "@provenance/agents/state";
import { z } from "zod";

export const recordTaskHandoffInput = z.object({
  taskId: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(50),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  scope: z.string().trim().max(200).optional(),
  status: taskStatusSchema.default("queued"),
  completedSteps: z.array(z.string().trim()).max(20).optional(),
  remainingWork: z.string().trim().max(1000).optional(),
  blockers: z.string().trim().max(1000).optional(),
  agentName: z.string().trim().max(100).optional(),
  dependsOn: z.array(z.string().trim()).max(10).optional(),
  artifact: z
    .object({
      kind: z.string().trim().min(1).max(50),
      ref: z.string().trim().min(1).max(500),
    })
    .optional(),
});

export const recordTaskHandoffOutputSchema = z.object({
  taskId: z.string(),
  recorded: z.boolean(),
  status: taskStatusSchema,
});

export const getTaskHandoffInput = z.object({
  taskId: z.string().trim().min(1).max(100),
});

export const getTaskHandoffOutputSchema = z.object({
  found: z.boolean(),
  task: taskStateSchema.nullable(),
});

export const claimTaskHandoffInput = z.object({
  agentName: z.string().trim().min(1).max(100),
  taskType: z.string().trim().min(1).max(50).optional(),
});

export const claimTaskHandoffOutputSchema = z.object({
  claimed: z.boolean(),
  task: taskStateSchema.nullable(),
});

export async function recordTaskHandoff(
  input: z.infer<typeof recordTaskHandoffInput>,
) {
  const existing = await getTask(input.taskId);
  if (!existing) {
    await createTask({
      id: input.taskId,
      type: input.type,
      repo: input.repo,
      scope: input.scope,
      status: input.status,
      remainingWork: input.remainingWork,
      blockers: input.blockers,
      dependsOn: input.dependsOn,
    });
  }
  await updateTaskState(input.taskId, {
    status: input.status,
    completedSteps: input.completedSteps,
    remainingWork: input.remainingWork,
    blockers: input.blockers,
    agentName: input.agentName,
    artifact: input.artifact,
  });
  return {
    taskId: input.taskId,
    recorded: true,
    status: input.status,
  };
}

export async function readTaskHandoff(taskId: string) {
  const task = await getTask(taskId);
  return {
    found: Boolean(task),
    task,
  };
}

export async function claimNextTask(agentName: string, taskType?: string) {
  const task = await claimTask(agentName, taskType);
  return {
    claimed: Boolean(task),
    task,
  };
}
