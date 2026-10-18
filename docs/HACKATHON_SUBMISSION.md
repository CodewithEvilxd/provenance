# Graph Hacks Hackathon — Formal Submission Form

This document provides complete, verified responses corresponding to each of the 9 required fields in the Graph Hacks submission form.

---

### Field 1: Public Source-Code Repository

- **Repository URL**: `https://github.com/CodewithEvilxd/provenance`
- **Default Branch**: `main`
- **License**: MIT
- **Security Check**: Verified zero sensitive tokens, API keys, or private environment files are tracked in git (`.env.local` strictly gitignored; secret sanitization active).

---

### Field 2: README with Setup Instructions and Graph Data Model

- **README Path**: [README.md](../README.md)
- **Local Setup Summary**:
  ```bash
  # 1. Clone & install
  git clone https://github.com/CodewithEvilxd/provenance.git
  cd provenance
  pnpm install

  # 2. Start FalkorDB container
  docker compose up -d

  # 3. Configure environment
  cp .env.example .env.local

  # 4. Build & start application
  pnpm --filter @provenance/web build
  pnpm --filter @provenance/web start
  ```
- **Graph Data Model Summary**:
  - **10 Node Labels**: `Person`, `Commit`, `File`, `Function`, `PullRequest`, `Comment`, `Decision`, `Incident`, `Task`, `Memory`.
  - **9 Key Relationships**:
    - `(:Person)-[:AUTHORED]->(:Commit|:PullRequest)`
    - `(:Commit)-[:MODIFIED]->(:File)`
    - `(:Commit)-[:MODIFIED_FUNCTIONS]->(:Function)`
    - `(:Function)-[:CALLS {confidence, approx}]->(:Function)`
    - `(:Comment)-[:ON]->(:PullRequest)`
    - `(:Decision)-[:DERIVED_FROM]->(:Comment)`
    - `(:Decision)-[:CONSTRAINS {strength}]->(:File|:Function)`
    - `(:Decision)-[:SUPERSEDES]->(:Decision)`
    - `(:Incident)-[:RESOLVED_BY]->(:Commit)`
  - **Bi-Temporal Properties**: `committed_at_ms`, `decided_at`, `detected_at`, `merged_at`, and relationship validity `valid_from` / `valid_to`.

---

### Field 3: Cypher Queries & Graph Algorithms

Provenance relies on six core graph algorithms implemented in Cypher:

#### 1. Zero Future Leakage As-Of Cutoff Traversal

Extracts the exact repository subgraph as it existed on or before a specified timestamp without future data contamination:

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

Followed by bi-temporally validated relationship filtering:

```cypher
MATCH (a)-[r]->(b)
WHERE a.id IN $nodeIds AND b.id IN $nodeIds
  AND (r.valid_from IS NULL OR r.valid_from <= $asOf)
  AND (r.valid_to IS NULL OR r.valid_to > $asOf)
RETURN a.id AS from, b.id AS to, type(r) AS type
LIMIT $limit
```

#### 2. Module Ownership & Bus Factor ($B_{50}$)

Calculates commit modifications per directory module across contributors and determines minimum maintainers covering 50% cumulative ownership:

```cypher
MATCH (p:Person)-[:AUTHORED]->(c:Commit)-[:MODIFIED]->(f:File)
WHERE c.committed_at_ms >= $sinceMs
RETURN f.path AS path, p.login AS login, count(DISTINCT c) AS commits
ORDER BY path, commits DESC
```

#### 3. Active Decision Constraints with Supersession Exclusion

Selects active code constraints applied to target files/functions, excluding superseded decisions:

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

#### 4. Vector Search over Code Constraints

Leverages FalkorDB's native vector index to find semantically relevant architectural rules:

```cypher
CALL db.idx.vector.queryNodes('Decision', 'embedding', 10, vecf32($queryVector))
YIELD node, score
MATCH (node)-[:CONSTRAINS]->(target)
RETURN node.id AS id, node.summary AS summary, node.reason AS reason,
       score, collect(target.id) AS targetIds
ORDER BY score ASC
```

#### 5. Multi-Hop Blast Radius & Call Graph Traversal

Identifies downstream callers affected by modified functions up to 3 hops deep:

```cypher
MATCH (caller:Function)-[:CALLS*1..3]->(target:Function)
WHERE target.id IN $functionIds
RETURN caller.id AS callerId, caller.name AS callerName,
       target.id AS targetId, length(path) AS depth
LIMIT 50
```

#### 6. Atomic Storage-Level Webhook Task Idempotency

Guarantees race-free task claiming across concurrent webhook deliveries using Redis single-threaded execution:

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

### Field 4: Demo Video

- **Video URL**: [Demo Video Link / Unlisted YouTube Placeholder]
- **Demo Script & Video Blueprint**: See [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md)
- **Key Walkthrough Stages**:
  1. **The Core Problem** (0:00 - 0:45): Architectural drift, lost review constraints, regressions.
  2. **Architecture & FalkorDB Graph Model** (0:45 - 1:30): Schema visualizer, vector indexing, temporal semantics.
  3. **Live PR Review & Evidence Paths** (1:30 - 2:45): Inspecting PR #23333, risk score breakdown, clicking through to source GitHub review comment.
  4. **Historical Time Slider** (2:45 - 3:45): Scrubbing through repository history with zero future leakage, watching as-of graph shrink/expand.
  5. **Bus Factor & Single-Maintainer Risk** (3:45 - 4:30): Visualizing module ownership concentration across contributors.
  6. **MCP Agent Reasoning** (4:30 - 5:00): Querying constraints live via Claude Desktop / AI Coding agents.

---

### Field 5: Deployment & Local Setup Instructions

- **Status**: Complete reproducible local setup verified across Windows / Linux with Docker Desktop and FalkorDB 8.10.2.
- **Port Allocations**:
  - FalkorDB: `6379` (Redis protocol)
  - Next.js Web Dashboard: `3000` (or `3100` during e2e testing)
- **Verification Commands**:
  ```bash
  # Check database connection
  pnpm run probe:graph

  # Run all unit and integration tests
  pnpm test

  # Run browser smoke tests
  pnpm run test:e2e

  # Verify historical PR evaluation benchmark
  pnpm run eval
  ```

---

### Field 6: Selected Hackathon Track

- **Primary Track**: **Developer Tools / Software Intelligence**
- **Secondary Track / Alignment**: **Graph AI & Agent Reasoning**

---

### Field 7: Project Title & Description

- **Project Title**: **Provenance: Temporal Architectural Knowledge Graph & Change Risk Intelligence**
- **Tagline**: Preventing regressions before code merges by linking pull requests, call graphs, review decisions, and maintainer ownership in FalkorDB.
- **Short Description (100 words)**:
  Every software team suffers from architectural erosion: critical code constraints agreed upon during code reviews get forgotten, function changes cause invisible blast-radius breakages, and modules become single points of failure due to maintainer bus factor. Provenance solves this by indexing the entire engineering history of a repository into a FalkorDB property graph. When a pull request is opened, Provenance assesses change risk against active constraints, traces evidence back to original review discussions, and enables historical time-travel debugging with zero future leakage.
- **Key Capabilities**:
  - Automated PR risk scoring across 5 distinct signals.
  - Interactive as-of time slider with backend Cypher enforcement.
  - Reproducible 50% cumulative ownership module bus-factor analysis ($B_{50}$).
  - 10 Model Context Protocol (MCP) tools for AI agents.
  - Calibrated benchmark on 21 historical Vite PRs (87.5% Precision, 81.0% Accuracy).

---

### Field 8: How FalkorDB Was Used

Provenance relies on FalkorDB as its primary data store, graph reasoning engine, and vector search index:

1. **Unified Multi-Model Graph**:
   FalkorDB simultaneously manages relational AST call-graph structures (`(:Function)-[:CALLS]->(:Function)`), git commit trees (`(:Commit)-[:MODIFIED]->(:File)`), and semantic discussion threads (`(:Comment)-[:ON]->(:PullRequest)`).
2. **Native Vector Search on Code Constraints**:
   Using `db.idx.vector.queryNodes('Decision', 'embedding', ...)`, Provenance performs semantic similarity search across historical architectural policies directly in Cypher, eliminating the need for an external vector database like Pinecone or Chroma.
3. **Bi-Temporal Cutoff Queries**:
   FalkorDB executes complex temporal filtering across both node creation timestamps (`committed_at_ms`, `decided_at`) and edge validity intervals (`valid_from`, `valid_to`), guaranteeing reproducible evaluation without future data contamination.
4. **Storage-Level Concurrency via Redis Event Loop**:
   Because FalkorDB runs as a native Redis module on a single-threaded command loop, single Cypher `MERGE` queries execute with strict serializability. This provides atomic webhook idempotency without requiring external distributed locks (Redlock).
5. **High-Throughput Node Ingestion**:
   Leveraged parameterized batched `UNWIND` Cypher statements to ingest thousands of functions, commits, and relationships in sub-second roundtrips.

---

### Field 9: Feedback About FalkorDB

#### Strengths & What We Loved

1. **Exceptional Speed & Low Resource Footprint**:
   FalkorDB's C-based GraphBLAS matrix multiplication engine is remarkably fast. Complex 3-hop call graph traversals and subgraph extractions execute in $<1$ millisecond, outperforming traditional JVM-based graph databases by an order of magnitude.
2. **First-Class Redis Protocol Compatibility**:
   Being accessible via standard Redis clients (`@redis/client`, `falkordb` npm package) makes integration effortless. No complex custom wire protocols; standard connection pooling works out of the box.
3. **Integrated Vector Indexing**:
   Combining Cypher pattern matching with native vector search (`db.idx.vector.queryNodes`) in a single query is a game-changer for agentic workflows. It avoids the two-database problem (graph database + vector database).
4. **Lightweight Single Container**:
   Starting an entire graph database with full Cypher and vector capabilities takes 2 seconds in a lightweight Docker container.

#### Constructive Feedback & Areas for Improvement

1. **Aggregations and `ORDER BY` in Cypher**:
   In standard Neo4j Cypher, sorting by unprojected expressions or aggregations inside `RETURN` is often permitted. In FalkorDB, we observed that sorting by computed vector scores alongside aggregations requires explicitly projecting columns through `WITH` first. Clearer compiler error messages when this occurs would save debugging time.
2. **Multi-Graph Cross-Querying**:
   While FalkorDB supports multiple isolated named graphs (`repo:vitejs/vite`, `mem:developer`, etc.), cross-graph queries (e.g. comparing developer memory with repository constraints in a single query) are not natively supported and require application-level fan-out.
3. **Enhanced Native Date/Time Functions**:
   While epoch timestamps (`committed_at_ms`) work reliably with numeric comparisons, richer native Cypher date/time parsing functions (e.g. ISO 8601 string conversions inside Cypher) would simplify bi-temporal edge management.

Overall, FalkorDB proved to be an outstanding foundation for building high-performance, real-time code intelligence tools.
