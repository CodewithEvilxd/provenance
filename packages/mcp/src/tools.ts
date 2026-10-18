import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  assessChangeRisk,
  assessOutputSchema,
  explainCodeConstraint,
  explainOutputSchema,
  searchDecisions,
  searchOutputSchema,
  traceDecisionEvidence,
  traceOutputSchema,
} from "./reasoning.js";
import {
  contextInput,
  contextOutputSchema,
  getDeveloperContext,
  recordMemoryInput,
  recordMemoryOutputSchema,
  storeDeveloperEpisode,
} from "./memory-tools.js";
import {
  getTaskHandoffInput,
  getTaskHandoffOutputSchema,
  readTaskHandoff,
  recordTaskHandoff,
  recordTaskHandoffInput,
  recordTaskHandoffOutputSchema,
} from "./state-tools.js";

const repository = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
const searchInput = z.object({
  repo: repository,
  query: z.string().trim().min(2).max(1000),
  path: z.string().min(1).max(500).optional(),
  limit: z.number().int().min(1).max(10).default(10),
});
const explainInput = z.object({
  repo: repository,
  target: z.string().trim().min(1).max(500),
});
const traceInput = z.object({
  repo: repository,
  decisionId: z.string().trim().min(1).max(200),
});
const riskInput = z.object({
  repo: repository,
  target: z.string().trim().min(1).max(500),
  changedFiles: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  authorLogin: z.string().trim().min(1).max(39).optional(),
  linesChanged: z.number().int().min(0).max(100000).optional(),
  proposedChange: z.string().trim().max(8000).optional(),
});

type ToolReply =
  | {
      structuredContent: Record<string, unknown>;
      content: { type: "text"; text: string }[];
    }
  | { isError: true; content: { type: "text"; text: string }[] };

export function createReasoningServer() {
  const server = new McpServer({ name: "provenance", version: "1.0.0" });
  registerDecisionTools(server);
  registerSafetyTools(server);
  registerMemoryTools(server);
  registerStateTools(server);
  return server;
}

function registerDecisionTools(server: McpServer) {
  server.registerTool(
    "search_decisions",
    {
      description:
        "Search active engineering decisions by semantic similarity and optional repository path.",
      inputSchema: searchInput.shape,
      outputSchema: searchOutputSchema,
    },
    ({ repo, query, path, limit }) =>
      toolReply("search_decisions", searchOutputSchema, () =>
        searchDecisions(`repo:${repo}`, query, path, limit),
      ),
  );
  server.registerTool(
    "explain_code_constraint",
    {
      description:
        "Explain active decisions constraining an indexed Function or File, with source evidence.",
      inputSchema: explainInput.shape,
      outputSchema: explainOutputSchema,
    },
    ({ repo, target }) =>
      toolReply("explain_code_constraint", explainOutputSchema, () =>
        explainCodeConstraint(`repo:${repo}`, target),
      ),
  );
  server.registerTool(
    "explain_why",
    {
      description:
        "Explain active decisions constraining an indexed Function or File, with full provenance path.",
      inputSchema: explainInput.shape,
      outputSchema: explainOutputSchema,
    },
    ({ repo, target }) =>
      toolReply("explain_why", explainOutputSchema, () =>
        explainCodeConstraint(`repo:${repo}`, target),
      ),
  );
  server.registerTool(
    "trace_decision_evidence",
    {
      description:
        "Trace a Decision to its real sources, constrained targets, PRs, commits and supersession links.",
      inputSchema: traceInput.shape,
      outputSchema: traceOutputSchema,
    },
    ({ repo, decisionId }) =>
      toolReply("trace_decision_evidence", traceOutputSchema, () =>
        traceDecisionEvidence(`repo:${repo}`, decisionId),
      ),
  );
}

function registerSafetyTools(server: McpServer) {
  server.registerTool(
    "assess_change_risk",
    {
      description:
        "Assess an indexed target using graph evidence. The score is a heuristic, not a probability.",
      inputSchema: riskInput.shape,
      outputSchema: assessOutputSchema,
    },
    ({ repo, target, changedFiles, authorLogin, linesChanged }) =>
      toolReply("assess_change_risk", assessOutputSchema, () =>
        assessChangeRisk(
          `repo:${repo}`,
          target,
          changedFiles,
          authorLogin,
          linesChanged,
        ),
      ),
  );
  server.registerTool(
    "check_change_safety",
    {
      description:
        "Check safety of touching a function before editing. Returns risk score, blast radius and decisions.",
      inputSchema: riskInput.shape,
      outputSchema: assessOutputSchema,
    },
    ({ repo, target, changedFiles, authorLogin, linesChanged }) =>
      toolReply("check_change_safety", assessOutputSchema, () =>
        assessChangeRisk(
          `repo:${repo}`,
          target,
          changedFiles,
          authorLogin,
          linesChanged,
        ),
      ),
  );
}

function registerMemoryTools(server: McpServer) {
  server.registerTool(
    "my_context",
    {
      description:
        "Retrieve a developer's isolated memory graph (episodes, known topics, preferences, warnings).",
      inputSchema: contextInput.shape,
      outputSchema: contextOutputSchema,
    },
    ({ login, topic, limit }) =>
      toolReply("my_context", contextOutputSchema, () =>
        getDeveloperContext(login, topic, limit),
      ),
  );
  server.registerTool(
    "record_developer_memory",
    {
      description:
        "Record an interaction episode with topics and repository context in a developer's memory graph.",
      inputSchema: recordMemoryInput.shape,
      outputSchema: recordMemoryOutputSchema,
    },
    ({ login, kind, summary, topics, repo }) =>
      toolReply("record_developer_memory", recordMemoryOutputSchema, () =>
        storeDeveloperEpisode(login, kind, summary, topics, repo),
      ),
  );
}

function registerStateTools(server: McpServer) {
  server.registerTool(
    "record_task_handoff",
    {
      description:
        "Record or update shared agent task state for multi-agent coordination without losing context.",
      inputSchema: recordTaskHandoffInput.shape,
      outputSchema: recordTaskHandoffOutputSchema,
    },
    (input) =>
      toolReply("record_task_handoff", recordTaskHandoffOutputSchema, () =>
        recordTaskHandoff(input),
      ),
  );
  server.registerTool(
    "get_task_handoff",
    {
      description:
        "Retrieve shared task state, completed steps, blockers, and dependencies.",
      inputSchema: getTaskHandoffInput.shape,
      outputSchema: getTaskHandoffOutputSchema,
    },
    ({ taskId }) =>
      toolReply("get_task_handoff", getTaskHandoffOutputSchema, () =>
        readTaskHandoff(taskId),
      ),
  );
}

async function toolReply<Output extends Record<string, unknown>>(
  name: string,
  schema: z.ZodType<Output>,
  run: () => Promise<unknown>,
): Promise<ToolReply> {
  try {
    return {
      structuredContent: schema.parse(await run()),
      content: [{ type: "text", text: `${name} completed` }],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Graph reasoning failed";
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
