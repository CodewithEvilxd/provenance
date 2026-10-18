import { graphStep, query } from "../../graph/src/client.js";
import type { LlmRouter } from "../../llm/src/types.js";
import { cachedOutput } from "./cache.js";
import { embedText } from "./embedding.js";
import { supersessionPrompt } from "./prompt.js";
import { supersessionSchema } from "./schema.js";
import { completeJson } from "./validation.js";
import type { ExtractedDecision } from "./extract.js";

export const decisionSupersessionCandidatesQuery =
  "CALL db.idx.vector.queryNodes('Decision', 'embedding', 10, vecf32($embedding)) YIELD node, score MATCH (node)-[:CONSTRAINS]->(target) WHERE node.status = 'active' AND node.id <> $id WITH node, score, collect(target.id) AS targetIds ORDER BY score DESC RETURN node.id AS id, node.summary AS summary, node.reason AS reason, targetIds";

export async function supersedes(
  graph: string,
  repo: string,
  id: string,
  router: LlmRouter,
  decision: ExtractedDecision,
  targetIds: string[],
) {
  const candidates = await graphStep("find supersession candidates", () =>
    query<{
      id: string;
      summary: string;
      reason: string;
      targetIds: string[];
    }>(graph, decisionSupersessionCandidatesQuery, {
      embedding: embedText(`${decision.summary} ${decision.reason}`),
      id,
    }),
  );
  for (const older of candidates) {
    if (
      targetIds.length !== older.targetIds.length ||
      !targetIds.every((target) => older.targetIds.includes(target))
    )
      continue;
    const content = JSON.stringify([decision.summary, decision.reason, older]);
    const verdict = await cachedOutput(repo, content, () =>
      completeJson(
        router,
        supersessionPrompt(
          `${decision.summary}: ${decision.reason}`,
          `${older.summary}: ${older.reason}`,
        ),
        supersessionSchema,
      ),
    );
    if (!verdict.replaces) continue;
    await graphStep("write SUPERSEDES edge", () =>
      query(
        graph,
        "MATCH (newer:Decision {id: $id}), (older:Decision {id: $older}) MERGE (newer)-[edge:SUPERSEDES]->(older) SET edge.valid_from = newer.decided_at, edge.valid_to = null, older.status = 'superseded'",
        { id, older: older.id },
      ),
    );
  }
}
