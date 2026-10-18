# Provenance MCP server

Run the server from the repository root with `pnpm mcp`. It uses the standard input/output (stdio) MCP transport and connects to FalkorDB graphs. Docker FalkorDB must be running on `localhost:6379` (or configured via environment variables).

Configure `FALKORDB_HOST`, `FALKORDB_PORT`, and, when needed, `FALKORDB_PASSWORD` in the process environment or root `.env.local`. The server reads `.env.local` before loading the graph client.

Register it in an MCP client with command `pnpm`, arguments `["mcp"]`, and the repository root as the working directory. The graph name for repository `owner/name` is `repo:owner/name`.

## MCP Tools Reference

The server exposes 10 structured tools covering provenance graph reasoning, isolated developer memory, and multi-agent task handoff:

| Tool                      | Purpose                                                                                   | Key Inputs                                                                                                          | Evidence / Result                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `search_decisions`        | Vector-search indexed decisions, optionally scoped by file path                           | `repo`, `query`, `path`, `limit`                                                                                    | Decision summaries, real source comments, URLs, and constrained targets                              |
| `explain_code_constraint` | Find active decisions constraining an indexed File or Function                            | `repo`, `target`                                                                                                    | Decision rationale, source comments, target nodes, and graph paths                                   |
| `explain_why`             | Shortcut alias to explain why code constraints exist for a target                         | `repo`, `target`                                                                                                    | Verified decision rationale and graph evidence                                                       |
| `trace_decision_evidence` | Follow a Decision node through its complete graph evidence                                | `repo`, `decisionId`                                                                                                | Source comments, PRs, commits, targets, and both directions of `SUPERSEDES`                          |
| `assess_change_risk`      | Heuristic graph risk evaluation for proposed changes                                      | `repo`, `target`, `changedFiles`, `authorLogin`, `linesChanged`                                                     | Risk components, blast radius, incidents, reviewer familiarity, evidence paths, and missing coverage |
| `check_change_safety`     | Change safety assessment that connects to developer memory for tracking prior inspections | `repo`, `target`, `changedFiles`, `authorLogin`, `linesChanged`                                                     | Graph risk score, prior developer interactions, and missing coverage                                 |
| `my_context`              | Recall isolated developer memories and topic knowledge                                    | `login`, `topic`, `limit`                                                                                           | Developer-scoped episodes, topic familiarity strength (0.0–1.0), warnings, and preferences           |
| `record_developer_memory` | Record verified developer interaction episode                                             | `login`, `kind`, `summary`, `topics`, `repo`                                                                        | Deterministic episode ID, idempotently merged into `mem:<login>`                                     |
| `record_task_handoff`     | Record or update shared task-state for agent handoff                                      | `taskId`, `type`, `repo`, `scope`, `status`, `completedSteps`, `remainingWork`, `blockers`, `agentName`, `artifact` | Idempotent task record updated in `state` graph                                                      |
| `get_task_handoff`        | Retrieve shared task state to resume work across agent sessions                           | `taskId`                                                                                                            | Full task state including status, assigned agent, completed steps, blockers, and artifacts           |

## Developer Memory Isolation

Developer memory is partitioned strictly by developer login into dedicated graphs named `mem:<github_login>`.

- **Entity Schema**:
  - `(:Dev {login})`
  - `(:Episode {id, kind, summary, repo, at})`
  - `(:Topic {id, name})`
  - `(:Warning {id, decision_id, outcome, shown_at})`
  - `(:Preference {id, key, value})`
- **Relationship Schema**:
  - `(:Dev)-[:HAD]->(:Episode)-[:ABOUT]->(:Topic)`
  - `(:Dev)-[k:KNOWS]->(:Topic)` with knowledge strength scaling (`0.2` on first encounter, increments up to `1.0` maximum) and `last_touched` timestamp
  - `(:Dev)-[:WAS_WARNED]->(:Warning)`
  - `(:Dev)-[:PREFERS]->(:Preference)`
- **Idempotency**: Repeated writes for the same interaction produce deterministic hashed IDs and merge via Cypher `MERGE`, preventing duplicate nodes or edges.
- **Privacy & Security**: Credentials, API tokens, and secret keys must never be passed to memory tools. Memory graphs are completely isolated; queries for `dev-alpha` never return data from `dev-beta`.

## Shared Agent-Handoff State Graph

The shared state graph lives in the `state` graph and coordinates autonomous or pair-programming coding agents without context loss.

- **Entity Schema**:
  - `(:Task {id, type, repo, scope, status, payload_ref, remaining_work, blockers, completed_steps, created_at, started_at, finished_at, error})`
  - `(:Agent {name})`
  - `(:Artifact {id, kind, ref})`
- **Relationship Schema**:
  - `(:Task)-[:ASSIGNED_TO]->(:Agent)`: Tracks current agent ownership; reassigned atomically on handoff.
  - `(:Task)-[:DEPENDS_ON]->(:Task)`: Expresses task dependency chains.
  - `(:Task)-[:PRODUCED]->(:Artifact)`: Links verification reports, diffs, or decision evidence produced during the task.
- **Statuses**: `queued` -> `running` -> `done` (or `failed`).
- **Resumption**: A receiving agent calls `get_task_handoff` with the `taskId`, inspecting `completedSteps`, `blockers`, `remainingWork`, and linked artifacts to resume execution without repeating already verified steps.

## Coding Agent Configuration

### Claude Code (`~/.claude.json` or project MCP config)

Add to your MCP servers block:

```json
{
  "mcpServers": {
    "provenance": {
      "command": "pnpm",
      "args": ["mcp"],
      "cwd": "/absolute/path/to/provenance-for-graph-hacks"
    }
  }
}
```

### Generic Stdio MCP Client

- **Command**: `pnpm` (or `node node_modules/tsx/dist/cli.mjs packages/mcp/src/server.ts`)
- **Working Directory**: Project root
- **Transport**: `stdio`
- **Environment**: Ensure `FALKORDB_HOST` and `FALKORDB_PORT` point to the running FalkorDB instance.
