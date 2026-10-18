# Provenance

<p align="center">
  <strong>Temporal Architectural Knowledge Graph & Change Risk Intelligence for Modern Software Systems</strong>
</p>

<p align="center">
  <a href="docs/PROGRESS.md"><img src="https://img.shields.io/badge/tests-155%20passed-10b981.svg?style=flat-square" alt="Tests"></a>
  <a href="tsconfig.base.json"><img src="https://img.shields.io/badge/typescript-5.x%20strict-3178c6.svg?style=flat-square" alt="TypeScript"></a>
  <a href="docker-compose.yml"><img src="https://img.shields.io/badge/database-FalkorDB%208.10-dc2626.svg?style=flat-square" alt="FalkorDB"></a>
  <a href="apps/web/package.json"><img src="https://img.shields.io/badge/web-Next.js%2016%20%7C%20React%2019-000000.svg?style=flat-square" alt="Next.js"></a>
  <a href="docs/eval.md"><img src="https://img.shields.io/badge/benchmark-81.0%25%20accuracy-6366f1.svg?style=flat-square" alt="Accuracy"></a>
  <a href="packages/mcp"><img src="https://img.shields.io/badge/mcp-10%20tools-8b5cf6.svg?style=flat-square" alt="MCP Tools"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-gray.svg?style=flat-square" alt="License"></a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [Core Capabilities](#core-capabilities)
  - [1. Pull Request Change Risk & Evidence Tracing](#1-pull-request-change-risk--evidence-tracing)
  - [2. Historical Time Slider & Bi-Temporal Scrubbing](#2-historical-time-slider--bi-temporal-scrubbing)
  - [3. Contributor Ownership & Bus Factor Heatmap](#3-contributor-ownership--bus-factor-heatmap)
  - [4. Model Context Protocol (MCP) Server for AI Coding Agents](#4-model-context-protocol-mcp-server-for-ai-coding-agents)
  - [5. GitHub Webhook with Storage-Level Atomic Idempotency](#5-github-webhook-with-storage-level-atomic-idempotency)
- [Graph Data Model](#graph-data-model)
  - [Schema Architecture](#schema-architecture)
  - [Node Labels](#node-labels)
  - [Relationships & Bi-Temporal Semantics](#relationships--bi-temporal-semantics)
- [GraphBLAS & Cypher Query Engine](#graphblas--cypher-query-engine)
- [Monorepo Architecture](#monorepo-architecture)
- [Historical Evaluation Benchmark](#historical-evaluation-benchmark)
- [Quickstart & Local Setup](#quickstart--local-setup)
- [Verification & Quality Suite](#verification--quality-suite)
- [Hackathon Submission Details](#hackathon-submission-details)
- [License](#license)

---

## Overview

**Provenance** is an architectural intelligence platform powered by **FalkorDB**. It indexes the entire engineering lifecycle of a repository—source code ASTs, git commit trees, pull request review threads, and historical incident postmortems—into a unified, bi-temporal property graph.

When a pull request is submitted, Provenance traverses the knowledge graph to detect violated design constraints, computes caller blast radii, flags single-maintainer operational fragility, and traces cryptographic evidence back to the original review comments where decisions were born.

---

## The Problem

1. **Erosion of Institutional Knowledge**: Engineering decisions documented in review comments ("_never mutate this config descriptor in place_") are forgotten as teams scale, leading to repeated regressions.
2. **Invisible Blast Radii**: A localized function edit often breaks callers 2–3 hops away in the AST call graph that the author was unaware of.
3. **Maintainer Concentration Risk**: Critical modules often depend on a single developer (Bus Factor = 1), creating unmonitored operational bottlenecks.
4. **Time Blindness & Evaluation Leakage**: Tools that evaluate past code using current state suffer from future information contamination. Historical assessments must be strictly bounded as-of change merge time.

---

## Core Capabilities

### 1. Pull Request Change Risk & Evidence Tracing

Evaluates changes across five weighted, mathematically normalized risk channels:

- **Constraint Violations**: Flags modifications to files/functions constrained by active architectural decisions.
- **Incident Affinity**: Traverses links to previous reverts, bug fixes, or regression issues affecting the same code surface.
- **Blast Radius**: Explores multi-hop downstream callers up to 3 hops deep in the AST call graph.
- **Author Familiarity**: Measures the author's historical commit recency and modification frequency in touched modules.
- **Change Surface**: Normalizes hunk size, touched file spread, and function count.

Every flagged decision links directly to its source GitHub comment URL for instant verification.

### 2. Historical Time Slider & Bi-Temporal Scrubbing

An interactive visual timeline scrubber (`/repos/[owner]/[name]/time`) allowing developers and auditors to explore the repository's exact state at any historical cutoff:

- **Zero Future Leakage**: Backend Cypher queries strictly enforce $t \le t_{cutoff}$ across commits, review decisions, and incidents. Future events never appear in historical views.
- **Interactive Visual Subgraph**: Renders an interactive `@xyflow/react` directed node graph showing relationships (commits, files, decisions, incidents) active as of the chosen cutoff.
- **Bi-Temporal Edges**: Edges enforce validity windows (`valid_from <= $asOf` AND `valid_to > $asOf`).

### 3. Contributor Ownership & Bus Factor Heatmap

Analyzes default-branch git history across normalized directory modules (`/repos/[owner]/[name]`):

- **Reproducible Metric**: Calculates individual contribution percentages: $S_i = (C_i / C_{total}) \times 100\%$.
- **Bus Factor ($B\_{50}$)**: Calculates the minimum number of human maintainers $k$ needed to account for at least 50% of cumulative module commits:
  $$B_{50} = \min \left\{ k \;\middle|\; \sum_{i=1}^k S_i \ge 50\% \right\}$$
- **Single-Maintainer Risk**: Categorizes modules into High Risk ($B_{50} = 1$ or top share $\ge 80\%$), Medium Risk ($B_{50} = 2$ or fragile secondary share $< 10\%$), and Low Risk ($B_{50} \ge 3$).
- **Automated Bot Filtering**: Separates automated bots (`dependabot[bot]`, `github-actions[bot]`, `renovate[bot]`) from human contributor pools.

### 4. Model Context Protocol (MCP) Server for AI Coding Agents

Exposes **10 native MCP tools** over stdio, allowing AI agents (Cursor, Claude Desktop, Gemini Code Assist) to query institutional knowledge before writing code:

- `search_decisions`: Vector and keyword search over extracted constraints.
- `explain_code_constraint`: Explains why a file or function has a specific architectural rule.
- `trace_decision_evidence`: Resolves the PR and review comment thread where a decision was minted.
- `assess_change_risk`: Evaluates a prospective patch against the graph.
- `record_developer_memory` & `my_context`: Cross-session developer topic memory.
- `record_task_handoff` & `get_task_handoff`: Multi-agent collaborative state handoffs.

### 5. GitHub Webhook with Storage-Level Atomic Idempotency

Receives real GitHub pull request webhooks (`/api/webhook/github`):

- **Constant-Time HMAC-SHA256**: Authenticates payloads via `crypto.timingSafeEqual` with zero secret exposure.
- **Storage-Level Idempotency**: Executes a single atomic Cypher `MERGE` query on FalkorDB's single-threaded Redis command loop, eliminating concurrency race conditions during simultaneous webhook deliveries.
- **Single Comment Policy**: Formats and updates a single sticky PR review comment containing risk score, signal breakdown, and decision evidence paths.

---

## Graph Data Model

### Schema Architecture

```
                  ┌──────────────┐
                  │    Person    │
                  └──────┬───────┘
                         │ AUTHORED / REVIEWED
                         ▼
┌──────────────┐  ON    ┌──────────────┐   INTRODUCED_BY   ┌──────────────┐
│   Comment    ├───────►│ PullRequest  ├──────────────────►│   Incident   │
└──────┬───────┘        └──────┬───────┘                   └──────▲───────┘
       │ DERIVED_FROM          │ CONTAINS                         │ RESOLVED_BY
       ▼                       ▼                                  │
┌──────────────┐  CONSTRAINS ┌──────────────┐                 ┌──────────────┐
│   Decision   ├────────────►│     File     │◄────────────────┤    Commit    │
└──────┬───────┘             └──────┬───────┘    MODIFIED     └──────────────┘
       │ SUPERSEDES                 │ IN
       ▼                            ▼
┌──────────────┐             ┌──────────────┐
│   Decision   │             │   Function   │◄─── CALLS ──────┘
└──────────────┘             └──────────────┘
```

### Node Labels

| Label         | Description                                       | Key Properties                                                     |
| :------------ | :------------------------------------------------ | :----------------------------------------------------------------- |
| `Person`      | Repository contributor, author, or reviewer       | `id`, `login`                                                      |
| `Commit`      | Git commit on default branch                      | `id` (SHA), `message`, `committed_at`, `committed_at_ms`           |
| `File`        | Source code file                                  | `id` (`file:<path>`), `path`                                       |
| `Function`    | AST parsed function definition                    | `id` (`fn:<file>:<name>:<line>`), `name`, `start_line`, `end_line` |
| `PullRequest` | Merged or open pull request                       | `id` (`pr:<number>`), `number`, `title`, `merged_at`               |
| `Comment`     | PR review discussion comment                      | `id` (`comment:review:<id>`), `url`, `body`, `created_at`          |
| `Decision`    | Extracted code constraint or architectural policy | `id`, `summary`, `reason`, `decided_at`, `embedding` (F32 vector)  |
| `Incident`    | Historical revert, regression bug, or hotfix      | `id`, `kind`, `detected_at`                                        |
| `Task`        | Webhook task execution state                      | `id` (`task:webhook:<repo>:<pr>:<sha>`), `status`, `claim_action`  |
| `Memory`      | Developer interaction memory node                 | `id`, `developer`, `topic`, `weight`                               |

### Relationships & Bi-Temporal Semantics

| Relationship Type    | Source $\to$ Target                     | Semantics & Properties                                   |
| :------------------- | :-------------------------------------- | :------------------------------------------------------- |
| `AUTHORED`           | `Person` $\to$ `Commit` / `PullRequest` | Authorship attribution                                   |
| `REVIEWED`           | `Person` $\to$ `PullRequest`            | Code review participation                                |
| `MODIFIED`           | `Commit` $\to$ `File`                   | File change attribution                                  |
| `MODIFIED_FUNCTIONS` | `Commit` $\to$ `Function`               | Precise AST function modification (`approx: true/false`) |
| `CALLS`              | `Function` $\to$ `Function`             | AST static call resolution (`confidence: number`)        |
| `ON`                 | `Comment` $\to$ `PullRequest`           | Review thread context                                    |
| `DERIVED_FROM`       | `Decision` $\to$ `Comment`              | Cryptographic evidence link to discussion                |
| `CONSTRAINS`         | `Decision` $\to$ `File` / `Function`    | Scope constraint rule (`strength: "hard" \| "soft"`)     |
| `SUPERSEDES`         | `Decision` $\to$ `Decision`             | Architectural rule override/evolution                    |
| `INTRODUCED_BY`      | `Incident` $\to$ `PullRequest`          | Regression root cause attribution                        |
| `RESOLVED_BY`        | `Incident` $\to$ `Commit`               | Fix or revert commit link                                |

---

## GraphBLAS & Cypher Query Engine

FalkorDB stores graph topology as sparse adjacency matrices, using GraphBLAS operations to execute traversals with extreme performance. Key queries powering Provenance:

### 1. As-Of Cutoff Traversal (Zero Future Leakage)

```cypher
MATCH (n)
WHERE (n:Commit AND n.committed_at_ms <= $asOfMs)
   OR (n:Decision AND n.decided_at <= $asOf)
   OR (n:Incident AND n.detected_at <= $asOf)
   OR (n:PullRequest AND n.merged_at <= $asOf)
   OR (n:File OR n:Function)
RETURN n.id AS id, labels(n)[0] AS label,
       coalesce(n.summary, n.name, n.path, n.id) AS text,
       coalesce(n.committed_at, n.decided_at, n.detected_at, n.merged_at) AS timestamp
ORDER BY timestamp DESC
LIMIT $limit
```

### 2. Module Ownership Concentration

```cypher
MATCH (p:Person)-[:AUTHORED]->(c:Commit)-[:MODIFIED]->(f:File)
WHERE c.committed_at_ms >= $sinceMs
RETURN f.path AS path, p.login AS login, count(DISTINCT c) AS commits
ORDER BY path, commits DESC
```

### 3. Active Decision Constraints (Supersession Pruning)

```cypher
MATCH (d:Decision)-[c:CONSTRAINS]->(target)
WHERE target.id IN $targetIds
  AND NOT (d)<-[:SUPERSEDES]-(:Decision)
  AND (d.decided_at IS NULL OR d.decided_at <= $cutoff)
OPTIONAL MATCH (d)-[:DERIVED_FROM]->(src:Comment)
RETURN d.id AS id, d.summary AS summary, d.reason AS reason,
       c.strength AS strength, target.id AS targetId,
       src.url AS sourceUrl, d.decided_at AS decidedAt
```

### 4. Native Vector Search over Code Constraints

```cypher
CALL db.idx.vector.queryNodes('Decision', 'embedding', 10, vecf32($queryVector))
YIELD node, score
MATCH (node)-[:CONSTRAINS]->(target)
RETURN node.id AS id, node.summary AS summary, node.reason AS reason,
       score, collect(target.id) AS targetIds
ORDER BY score ASC
```

### 5. Multi-Hop Blast Radius Exploration

```cypher
MATCH path = (caller:Function)-[:CALLS*1..3]->(target:Function)
WHERE target.id IN $functionIds
RETURN caller.id AS callerId, caller.name AS callerName,
       target.id AS targetId, length(path) AS depth
LIMIT 50
```

### 6. Atomic Storage-Level Webhook Task Claiming

```cypher
MERGE (t:Task {id: $id})
ON CREATE SET t.status = 'running', t.created_at = $now, t.updated_at = $now
ON MATCH SET
  t.claim_action = CASE
    WHEN t.status = 'failed' THEN 'retried'
    ELSE 'ignored'
  END,
  t.status = CASE
    WHEN t.status = 'failed' THEN 'running'
    ELSE t.status
  END,
  t.updated_at = CASE
    WHEN t.status = 'failed' THEN $now
    ELSE t.updated_at
  END
RETURN t.status AS status, t.claim_action AS action
```

---

## Monorepo Architecture

Provenance is structured as an organized TypeScript/pnpm monorepo:

```
provenance/
├── apps/
│   └── web/                   # Next.js 16 Web Dashboard (React 19, @xyflow/react)
│       ├── app/               # App Router pages and dynamic REST endpoints
│       │   ├── api/           # /api/review, /api/timeline, /api/ownership, /api/eval, /api/ask
│       │   ├── eval/          # Benchmark evaluation dashboard
│       │   └── repos/         # Repository workspace, PR reviews, time slider, bus factor
│       ├── components/        # UI components (time-slider, bus-factor, visual graph)
│       └── e2e/               # Playwright browser smoke test suites
├── packages/
│   ├── graph/                 # FalkorDB typed client, schema indexes, vector search, Cypher queries
│   ├── ingest/                # Octokit GitHub fetcher, Tree-sitter AST parser, call graph generator
│   ├── decisions/             # Decision extraction prompts, Zod validation, supersession linking
│   ├── agents/                # Change risk evaluator, timeline engine, ownership analyzer, webhook
│   ├── llm/                   # Multi-provider router (OpenAI, Gemini, Anthropic, OpenRouter)
│   └── mcp/                   # Model Context Protocol server exposing 10 agent reasoning tools
├── scripts/
│   ├── probe/                 # Low-level FalkorDB diagnostic probes (graph, vector, indexes)
│   ├── audit-code.ts          # Repository hygiene auditor (line limits, banned patterns)
│   ├── eval.ts                # Historical 21-PR evaluation harness CLI
│   ├── ingest.ts              # Repository ingestion CLI
│   └── extract-decisions.ts   # Batch decision extraction CLI
├── docs/                      # Complete specifications, hackathon submission, demo video script
├── tests/                     # Ground-truth corpus measurements and manifests
├── docker-compose.yml         # FalkorDB container definition (port 6379)
└── package.json               # Monorepo scripts and workspace dependencies
```

---

## Historical Evaluation Benchmark

To ensure risk assessments are mathematically grounded, Provenance includes a reproducible historical evaluation pipeline executed against 21 real pull requests from `vitejs/vite` as of their merge-time cutoffs:

| Metric                  |   Measured Value    | Standard Interpretation                                         |
| :---------------------- | :-----------------: | :-------------------------------------------------------------- |
| **Accuracy**            | **81.0%** (17 / 21) | Overall classification correctness across risky and clean PRs   |
| **Precision**           |  **87.5%** (7 / 8)  | Probability that a flagged PR is an actual verified regression  |
| **Recall**              | **70.0%** (7 / 10)  | Proportion of actual historical regression PRs correctly caught |
| **False Positive Rate** |  **9.1%** (1 / 11)  | Frequency of false alarms on clean documentation/test changes   |
| **F1 Score**            |      **0.778**      | Harmonic mean of precision and recall                           |

**Confusion Matrix**: True Positives = 7, False Positives = 1, True Negatives = 10, False Negatives = 3.

---

## Quickstart & Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v22 or higher
- [pnpm](https://pnpm.io/) v10 or higher
- [Docker Desktop](https://www.docker.com/)

### 1. Clone & Install

```bash
git clone https://github.com/CodewithEvilxd/provenance.git
cd provenance
pnpm install
```

### 2. Launch FalkorDB

Start the FalkorDB Docker container:

```bash
docker compose up -d
```

Verify connection and view graph version:

```bash
pnpm run probe:graph
```

### 3. Environment Configuration

Create your local environment file:

```bash
cp .env.example .env.local
```

_(Optionally provide provider API keys if you wish to run live LLM extraction. Offline evaluation and cached reviews work out-of-the-box without keys.)_

### 4. Launch Web Application

Build the Next.js production bundle:

```bash
pnpm --filter @provenance/web build
```

Start the application:

```bash
pnpm --filter @provenance/web start
```

Open [http://localhost:3000](http://localhost:3000) in your browser:

- **Bus Factor Heatmap**: `/repos/vitejs/vite`
- **Historical Time Slider**: `/repos/vitejs/vite/time`
- **PR Change Risk Review**: `/repos/vitejs/vite/pr/23333`
- **Historical PR Benchmark**: `/eval`

---

## Verification & Quality Suite

Run the repository's verification scripts:

```bash
# Unit & integration test suite (155 tests across 32 test files)
pnpm test

# Playwright E2E browser smoke tests
pnpm run test:e2e

# Strict TypeScript typechecking across all 7 workspace packages
pnpm run typecheck

# ESLint code style enforcement
pnpm run lint

# Prettier format compliance
pnpm run format:check

# Architectural code audit (function size <= 60 lines, files <= 300 lines)
pnpm run audit:code

# Historical PR evaluation benchmark (Precision 87.5%, Recall 70.0%)
pnpm run eval
```

---

## Hackathon Submission Details

- **Event**: Graph Hacks Hackathon
- **Track**: Developer Tools / Software Intelligence / Graph Agents
- **Primary Database**: FalkorDB 8.10.2
- **Formal Submission Form**: [docs/HACKATHON_SUBMISSION.md](docs/HACKATHON_SUBMISSION.md)
- **Demo Walkthrough Video Script**: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- **Phase 8 Feature Specification**: [docs/historical-slider-ownership.md](docs/historical-slider-ownership.md)

---

## License

MIT © 2026 Provenance Contributors. Distributed under the terms of the MIT License.
