import {
  memoryContextSchema,
  recallDeveloperContext,
  recordEpisode,
  recordPreference,
  recordWarning,
} from "@provenance/agents/memory";
import { z } from "zod";

export const contextInput = z.object({
  login: z.string().trim().min(1).max(39),
  topic: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export const contextOutputSchema = memoryContextSchema;

export const recordMemoryInput = z.object({
  login: z.string().trim().min(1).max(39),
  kind: z.string().trim().min(1).max(50),
  summary: z.string().trim().min(1).max(500),
  topics: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  repo: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    .optional(),
});

export const recordMemoryOutputSchema = z.object({
  id: z.string(),
  recorded: z.boolean(),
});

export const recordWarningInput = z.object({
  login: z.string().trim().min(1).max(39),
  decisionId: z.string().trim().min(1).max(200),
  outcome: z.enum(["heeded", "dismissed"]),
  shownAt: z.number().optional(),
});

export const recordWarningOutputSchema = z.object({
  id: z.string(),
  recorded: z.boolean(),
});

export const recordPreferenceInput = z.object({
  login: z.string().trim().min(1).max(39),
  key: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(500),
});

export const recordPreferenceOutputSchema = z.object({
  id: z.string(),
  recorded: z.boolean(),
});

export async function getDeveloperContext(
  login: string,
  topic?: string,
  limit = 10,
) {
  return recallDeveloperContext(login, topic, limit);
}

export async function storeDeveloperEpisode(
  login: string,
  kind: string,
  summary: string,
  topics: string[] = [],
  repo?: string,
) {
  return recordEpisode(login, { kind, summary, topics, repo });
}

export async function storeDeveloperWarning(
  login: string,
  decisionId: string,
  outcome: "heeded" | "dismissed",
  shownAt?: number,
) {
  return recordWarning(login, { decisionId, outcome, shownAt });
}

export async function storeDeveloperPreference(
  login: string,
  key: string,
  value: string,
) {
  return recordPreference(login, { key, value });
}
