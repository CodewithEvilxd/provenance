# Provenance

> **Temporal Architectural Knowledge Graph & Change Risk Intelligence for Software Systems**

[![Tests](https://img.shields.io/badge/tests-155%20passed-brightgreen.svg)](docs/PROGRESS.md)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](tsconfig.base.json)
[![Database](https://img.shields.io/badge/graph-FalkorDB%208.10-red.svg)](docker-compose.yml)
[![Accuracy](https://img.shields.io/badge/historical%20eval-81.0%25%20acc-success.svg)](docs/eval.md)

Provenance captures the architectural evolution of a codebase in **FalkorDB** to prevent regressions before code merges. It links pull requests, code call graphs, developer discussions, historical incidents, and engineering constraints into a unified knowledge graph.

Built for the **Graph Hacks Hackathon**.

---

## The Problem

Modern code review is fragmented:

1. **Lost Constraints**: Critical architectural decisions documented in PR review comments get forgotten as teams grow.
2. **Hidden Blast Radii**: Simple function modifications trigger regressions 3-4 hops away in the call graph.
3. **Single-Maintainer Fragility**: Concentrated code ownership leaves modules vulnerable to high bus-factor risk.
4. **Time Blindness**: Historical evaluations frequently suffer from temporal data leakage by evaluating changes with future information.

## What Provenance Does

Provenance monitors repository health and pull requests in real time:

- **Change Risk Assessment**: Evaluates incoming pull requests against active architectural decisions, prior revert incidents, author familiarity, and AST call graphs.
- **Historical Time Slider**: Interactive scrubber that renders the exact state of code, review decisions, and incident history as of any historical timestamp with **zero future information leakage**.
- **Contributor Ownership & Bus Factor**: Computes empirical module ownership concentration ($B_{50}$) and flags single-maintainer fragility.
- **MCP Server for Coding Agents**: Exposes 10 Model Context Protocol tools allowing AI assistants (Claude Desktop, Cursor, Gemini) to query code constraints, verify change safety, and trace decision provenance.
- **Idempotent Webhook Handler**: Processes GitHub PR webhooks using atomic FalkorDB queries to prevent concurrent duplicate reviews.

---

## Graph Data Model

Provenance is powered by **FalkorDB**, representing codebase architecture as a multi-layered, bi-temporal property graph:

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

| Label         | Description                                       | Primary Key / Key Properties                                 |
| :------------ | :------------------------------------------------ | :----------------------------------------------------------- |
| `Person`      | Repository contributor or reviewer                | `id` (e.g., `person:antfu`), `login`                         |
| `Commit`      | Git commit on default branch                      | `id` (SHA), `committed_at`, `committed_at_ms`                |
| `File`        | Source code file path                             | `id` (e.g., `file:packages/vite/src/node/server.ts`), `path` |
| `Function`    | AST parsed function definition                    | `id`, `name`, `start_line`, `end_line`                       |
| `PullRequest` | Pull request metadata                             | `id` (e.g., `pr:23333`), `number`, `merged_at`               |
| `Comment`     | PR review comment thread                          | `id`, `url`, `body`, `created_at`                            |
| `Decision`    | Extracted code constraint or architectural policy | `id`, `summary`, `decided_at`, `embedding` (vector)          |
| `Incident`    | Reverts, regression issues, or bug reports        | `id`, `kind`, `detected_at`                                  |
| `Task`        | Webhook task execution state                      | `id` (deterministic key), `status`                           |
| `Memory`      | Agent developer interaction memory                | `id`, `developer`, `topic`, `weight`                         |

### Key Relationship Types

- `(:Person)-[:AUTHORED]->(:Commit|:PullRequest)`
- `(:Commit)-[:MODIFIED]->(:File)`
- `(:Commit)-[:MODIFIED_FUNCTIONS]->(:Function)`
- `(:Function)-[:CALLS {confidence, approx}]->(:Function)`
- `(:Comment)-[:ON]->(:PullRequest)`
- `(:Decision)-[:DERIVED_FROM]->(:Comment)`
- `(:Decision)-[:CONSTRAINS {strength}]->(:File|:Function)`
- `(:Decision)-[:SUPERSEDES]->(:Decision)`
- `(:Incident)-[:RESOLVED_BY]->(:Commit)`

---

## Core Graph Algorithms & Cypher Queries

### 1. Zero Future Leakage As-Of Cutoff Traversal

Extracts the exact repository subgraph on or before a given timestamp:

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

Edges are bounded bi-temporally:

```cypher
MATCH (a)-[r]->(b)
WHERE a.id IN $nodeIds AND b.id IN $nodeIds
  AND (r.valid_from IS NULL OR r.valid_from <= $asOf)
  AND (r.valid_to IS NULL OR r.valid_to > $asOf)
RETURN a.id AS from, b.id AS to, type(r) AS type
LIMIT $limit
```

### 2. Module Ownership & Bus Factor ($B_{50}$)

Calculates code modifications per module across contributors:

```cypher
MATCH (p:Person)-[:AUTHORED]->(c:Commit)-[:MODIFIED]->(f:File)
WHERE c.committed_at_ms >= $sinceMs
RETURN f.path AS path, p.login AS login, count(DISTINCT c) AS commits
ORDER BY path, commits DESC
```

The bus factor $B_{50}$ represents the minimum number of maintainers $k$ needed to cover at least $50\%$ cumulative ownership:
$$B_{50} = \min \left\{ k \;\middle|\; \sum_{i=1}^k S_i \ge 50\% \right\}$$

### 3. Active Decision Constraints with Temporal Filtering

Surfaces active decisions constraining changed files as of the review cutoff:

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

### 4. Vector Similarity Search over Code Constraints

Searches semantic architectural constraints using FalkorDB's native vector index:

```cypher
CALL db.idx.vector.queryNodes('Decision', 'embedding', 10, vecf32($queryVector))
YIELD node, score
MATCH (node)-[:CONSTRAINS]->(target)
RETURN node.id AS id, node.summary AS summary, node.reason AS reason,
       score, collect(target.id) AS targetIds
ORDER BY score ASC
```

### 5. Atomic Storage-Level Idempotency for Webhook Tasks

Leverages FalkorDB's single-threaded Redis execution loop to guarantee atomic task claiming:

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

## Quickstart & Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v22 or higher
- [pnpm](https://pnpm.io/) v10 or higher
- [Docker](https://www.docker.com/) and Docker Compose

### 1. Clone & Install

```bash
git clone https://github.com/CodewithEvilxd/provenance.git
cd provenance
pnpm install
```

### 2. Start FalkorDB

Launch the FalkorDB container (exposes Redis protocol on port 6379):

```bash
docker compose up -d
```

Verify connection:

```bash
pnpm run probe:graph
```

### 3. Configure Environment

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

### 4. Build & Run Application

Run the Next.js production build:

```bash
pnpm --filter @provenance/web build
```

Start the web dashboard:

```bash
pnpm --filter @provenance/web start
```

Visit [http://localhost:3000](http://localhost:3000) to explore:

- `/repos/vitejs/vite` — Contributor ownership & bus factor heatmap
- `/repos/vitejs/vite/time` — Historical time slider with interactive subgraph
- `/repos/vitejs/vite/pr/23333` — Full pull request change-risk review
- `/eval` — 21-PR historical benchmark and confusion matrix

---

## Testing & Verification Suite

Run all validation checks matching the continuous integration harness:

```bash
# Unit & integration tests (155 tests across 32 test files)
pnpm test

# Playwright E2E browser smoke tests (Edge/Chromium)
pnpm run test:e2e

# Strict TypeScript typechecking across all 7 workspace packages
pnpm run typecheck

# ESLint code hygiene
pnpm run lint

# Prettier format check
pnpm run format:check

# Architectural code audit (line length, function size, forbidden patterns)
pnpm run audit:code

# Historical PR evaluation benchmark (Precision: 87.5%, Recall: 70.0%)
pnpm run eval
```

---

## Hackathon Submission Details

- **Track**: Developer Tools / Software Intelligence / Graph Agents
- **Primary Database**: FalkorDB 8.10.2 (Graph Database + Vector Search)
- **Detailed Submission Form**: See [docs/HACKATHON_SUBMISSION.md](docs/HACKATHON_SUBMISSION.md)
- **Demo Walkthrough Video Script**: See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- **Feature Documentation**: See [docs/historical-slider-ownership.md](docs/historical-slider-ownership.md)

---

## License

MIT © 2026 Provenance Contributors.
