import { createHash } from "node:crypto";
import { query } from "@provenance/graph/client";
import { z } from "zod";

export const episodeRecordSchema = z.object({
  id: z.string(),
  kind: z.string(),
  summary: z.string(),
  repo: z.string().nullable(),
  at: z.number(),
  topics: z.array(z.string()),
});
export const topicRecordSchema = z.object({
  name: z.string(),
  strength: z.number(),
  lastTouched: z.number(),
});
export const warningRecordSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  outcome: z.enum(["heeded", "dismissed"]),
  shownAt: z.number(),
});
export const preferenceRecordSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
});

export const memoryContextSchema = z.object({
  login: z.string(),
  episodes: z.array(episodeRecordSchema),
  topics: z.array(topicRecordSchema),
  warnings: z.array(warningRecordSchema),
  preferences: z.array(preferenceRecordSchema),
  relevantKnowledgeFound: z.boolean(),
});

export type EpisodeRecord = z.infer<typeof episodeRecordSchema>;
export type TopicRecord = z.infer<typeof topicRecordSchema>;
export type WarningRecord = z.infer<typeof warningRecordSchema>;
export type PreferenceRecord = z.infer<typeof preferenceRecordSchema>;
export type MemoryContext = z.infer<typeof memoryContextSchema>;

export type RecordEpisodeInput = {
  id?: string | undefined;
  kind: string;
  summary: string;
  repo?: string | undefined;
  topics?: string[] | undefined;
  at?: number | undefined;
};

export type RecordWarningInput = {
  id?: string | undefined;
  decisionId: string;
  outcome: "heeded" | "dismissed";
  shownAt?: number | undefined;
};

export type RecordPreferenceInput = {
  key: string;
  value: string;
};

function deterministicId(prefix: string, seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  return `${prefix}:${hash}`;
}

export async function recordEpisode(
  login: string,
  input: RecordEpisodeInput,
): Promise<{ id: string; recorded: boolean }> {
  const graphName = `mem:${login}`;
  const timestamp = input.at ?? Date.now();
  const episodeId =
    input.id ??
    deterministicId(
      "episode",
      `${login}:${input.kind}:${input.summary}:${input.repo ?? ""}`,
    );
  await query(
    graphName,
    "MERGE (d:Dev {login: $login}) MERGE (e:Episode {id: $id}) SET e.kind = $kind, e.summary = $summary, e.repo = $repo, e.at = $at MERGE (d)-[:HAD]->(e)",
    {
      login,
      id: episodeId,
      kind: input.kind,
      summary: input.summary,
      repo: input.repo ?? null,
      at: timestamp,
    },
  );
  for (const topic of input.topics ?? []) {
    const trimmed = topic.trim();
    if (!trimmed) continue;
    const topicId = deterministicId("topic", trimmed.toLowerCase());
    await query(
      graphName,
      "MERGE (d:Dev {login: $login}) MERGE (e:Episode {id: $episodeId}) MERGE (t:Topic {id: $topicId}) SET t.name = $topic MERGE (e)-[:ABOUT]->(t) MERGE (d)-[k:KNOWS]->(t) ON CREATE SET k.strength = 0.2, k.last_touched = $at ON MATCH SET k.strength = CASE WHEN k.strength >= 1.0 THEN 1.0 ELSE round((k.strength + 0.1) * 100) / 100 END, k.last_touched = $at",
      {
        login,
        episodeId,
        topicId,
        topic: trimmed,
        at: timestamp,
      },
    );
  }
  return { id: episodeId, recorded: true };
}

export async function recordWarning(
  login: string,
  input: RecordWarningInput,
): Promise<{ id: string; recorded: boolean }> {
  const graphName = `mem:${login}`;
  const timestamp = input.shownAt ?? Date.now();
  const warningId =
    input.id ??
    deterministicId(
      "warning",
      `${login}:${input.decisionId}:${input.outcome}:${timestamp}`,
    );
  await query(
    graphName,
    "MERGE (d:Dev {login: $login}) MERGE (w:Warning {id: $id}) SET w.decision_id = $decisionId, w.outcome = $outcome, w.shown_at = $shownAt MERGE (d)-[:WAS_WARNED]->(w)",
    {
      login,
      id: warningId,
      decisionId: input.decisionId,
      outcome: input.outcome,
      shownAt: timestamp,
    },
  );
  return { id: warningId, recorded: true };
}

export async function recordPreference(
  login: string,
  input: RecordPreferenceInput,
): Promise<{ id: string; recorded: boolean }> {
  const graphName = `mem:${login}`;
  const prefId = deterministicId("pref", input.key.toLowerCase().trim());
  await query(
    graphName,
    "MERGE (d:Dev {login: $login}) MERGE (p:Preference {id: $id}) SET p.key = $key, p.value = $value MERGE (d)-[:PREFERS]->(p)",
    {
      login,
      id: prefId,
      key: input.key,
      value: input.value,
    },
  );
  return { id: prefId, recorded: true };
}

export async function recallDeveloperContext(
  login: string,
  topicQuery?: string,
  limit = 10,
): Promise<MemoryContext> {
  const graphName = `mem:${login}`;
  try {
    const episodes = await fetchEpisodes(graphName, login, topicQuery, limit);
    const topics = await fetchTopics(graphName, login, topicQuery, limit);
    const warnings = await fetchWarnings(graphName, login, limit);
    const preferences = await fetchPreferences(graphName, login, limit);
    const relevantKnowledgeFound = Boolean(
      episodes.length || (topicQuery && topics.length),
    );
    return memoryContextSchema.parse({
      login,
      episodes,
      topics,
      warnings,
      preferences,
      relevantKnowledgeFound,
    });
  } catch {
    return memoryContextSchema.parse({
      login,
      episodes: [],
      topics: [],
      warnings: [],
      preferences: [],
      relevantKnowledgeFound: false,
    });
  }
}

async function fetchEpisodes(
  graphName: string,
  login: string,
  topicQuery: string | undefined,
  limit: number,
): Promise<EpisodeRecord[]> {
  const rows = topicQuery
    ? await query<{
        id: string;
        kind: string;
        summary: string;
        repo: string | null;
        at: number;
        topics: string[];
      }>(
        graphName,
        "MATCH (d:Dev {login: $login})-[:HAD]->(e:Episode)-[:ABOUT]->(t:Topic) WHERE toLower(t.name) CONTAINS toLower($topicQuery) WITH e, collect(DISTINCT t.name) AS topics RETURN e.id AS id, e.kind AS kind, e.summary AS summary, e.repo AS repo, e.at AS at, topics ORDER BY e.at DESC LIMIT $limit",
        { login, topicQuery, limit },
      )
    : await query<{
        id: string;
        kind: string;
        summary: string;
        repo: string | null;
        at: number;
        topics: string[];
      }>(
        graphName,
        "MATCH (d:Dev {login: $login})-[:HAD]->(e:Episode) OPTIONAL MATCH (e)-[:ABOUT]->(t:Topic) WITH e, collect(DISTINCT t.name) AS topics RETURN e.id AS id, e.kind AS kind, e.summary AS summary, e.repo AS repo, e.at AS at, topics ORDER BY e.at DESC LIMIT $limit",
        { login, limit },
      );
  return rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    summary: String(row.summary),
    repo: row.repo ? String(row.repo) : null,
    at: Number(row.at),
    topics: Array.isArray(row.topics)
      ? row.topics.filter(Boolean).map(String)
      : [],
  }));
}

async function fetchTopics(
  graphName: string,
  login: string,
  topicQuery: string | undefined,
  limit: number,
): Promise<TopicRecord[]> {
  const rows = topicQuery
    ? await query<{ name: string; strength: number; last_touched: number }>(
        graphName,
        "MATCH (d:Dev {login: $login})-[k:KNOWS]->(t:Topic) WHERE toLower(t.name) CONTAINS toLower($topicQuery) RETURN t.name AS name, k.strength AS strength, k.last_touched AS last_touched ORDER BY k.strength DESC LIMIT $limit",
        { login, topicQuery, limit },
      )
    : await query<{ name: string; strength: number; last_touched: number }>(
        graphName,
        "MATCH (d:Dev {login: $login})-[k:KNOWS]->(t:Topic) RETURN t.name AS name, k.strength AS strength, k.last_touched AS last_touched ORDER BY k.strength DESC LIMIT $limit",
        { login, limit },
      );
  return rows.map((row) => ({
    name: String(row.name),
    strength: Number(row.strength),
    lastTouched: Number(row.last_touched),
  }));
}

async function fetchWarnings(
  graphName: string,
  login: string,
  limit: number,
): Promise<WarningRecord[]> {
  const rows = await query<{
    id: string;
    decision_id: string;
    outcome: string;
    shown_at: number;
  }>(
    graphName,
    "MATCH (d:Dev {login: $login})-[:WAS_WARNED]->(w:Warning) RETURN w.id AS id, w.decision_id AS decision_id, w.outcome AS outcome, w.shown_at AS shown_at ORDER BY w.shown_at DESC LIMIT $limit",
    { login, limit },
  );
  return rows.map((row) => ({
    id: String(row.id),
    decisionId: String(row.decision_id),
    outcome: row.outcome === "heeded" ? "heeded" : "dismissed",
    shownAt: Number(row.shown_at),
  }));
}

async function fetchPreferences(
  graphName: string,
  login: string,
  limit: number,
): Promise<PreferenceRecord[]> {
  const rows = await query<{ id: string; key: string; value: string }>(
    graphName,
    "MATCH (d:Dev {login: $login})-[:PREFERS]->(p:Preference) RETURN p.id AS id, p.key AS key, p.value AS value ORDER BY p.key ASC LIMIT $limit",
    { login, limit },
  );
  return rows.map((row) => ({
    id: String(row.id),
    key: String(row.key),
    value: String(row.value),
  }));
}
