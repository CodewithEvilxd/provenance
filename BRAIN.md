# BRAIN: How Provenance Works

This file is the complete design of Provenance. SKILL.md tells you how to work and in what order. This file tells you what the system is, why each part exists, and exactly how each part behaves. Read it top to bottom once, then use it as the reference while building.

## 1. One-paragraph summary

Provenance converts a GitHub repository into a temporal knowledge graph stored in FalkorDB. The graph holds people, commits, pull requests, issues, review comments, files, functions, call relationships, incidents (changes that later caused regressions) and decisions (reasoned constraints extracted from discussions). On top of the graph, four cooperating agents answer why code is the way it is, what breaks if it changes, who knows it, and whether a new pull request is risky. Every answer carries a graph path as evidence, displayed as an animated trace in the web UI, posted as a pull request comment, and available to any coding agent through an MCP server.

## 2. The problem being solved

When a developer touches old code, three things are missing: the reason it was written that way, the blast radius of the change, and the right person to ask. `git blame` shows who and when, not why. Reviewers catch what they happen to remember. Knowledge lives in review threads and in the heads of a few people. Coding agents are worse: they edit code with zero knowledge of past incidents or decisions.

Provenance fixes this by making relationships first-class. The answer to "is it safe to change this function" is not in any single record. It is in the connections: function to callers, function to past changes, past changes to incidents, function to decisions, decisions to the comment that created them. A graph stores those connections directly so one traversal replaces dozens of lookups, and the traversal itself is the explanation.

## 3. Hackathon alignment

Event: Graph Hacks, WeMakeDevs and FalkorDB, online, Oct 15 to Oct 18, 2026. FalkorDB must be the context layer and the graph must shape agent behavior.

- Track 01, Agents That Act on Connected Data (primary): the Reviewer agent uses multi-hop traversal and graph algorithms as tools, selects tools through MCP, acts by commenting on PRs and gating risk, and returns explainable results with paths.
- Track 02, Agent Memory and Coordination: per-developer memory graphs (separate graph per user), persistent history, and a shared state graph used by multiple agents for handoff.
- Track 03, Company Brain: decisions extracted from discussions, traced to their source, with who-owns and who-knows queries and supersession so knowledge stays current.

Submission framing: Track 01 is primary. The README and video explicitly show the memory graph and the decision trace so reviewers of the other tracks see their angle.

## 4. System architecture

```
                         GitHub (REST, GraphQL, Webhooks)
                                      |
                                      v
   +----------------+        +------------------+        +-------------------+
   |  Ingestor      | -----> |   FalkorDB       | <----- |  Decision         |
   |  agent         |  MERGE |                  |        |  extractor (LLM)  |
   |  (Octokit,     |        |  repo:<o>/<n>    |        +-------------------+
   |  tree-sitter)  |        |  mem:<login>...  |
   +----------------+        |  state           |
          ^                  +------------------+
          | tasks                 ^   ^    ^
          |                       |   |    |
   +------+-------------------+   |   |    |
   |  Shared state graph      |   |   |    |
   |  (Task nodes, handoff)   |   |   |    |
   +------+-------------------+   |   |    |
          |                       |   |    |
   +------v------+   +------------+-+ | +--+-------------+
   | Archaeologist|  |  Reviewer    | | |  Memory agent   |
   | (why, who,   |  |  (blast      | | |  (per-developer |
   |  history)    |  |  radius,risk)| | |  graph)         |
   +------+-------+  +------+-------+ | +--+--------------+
          |                 |         |    |
          +--------+--------+---------+----+
                   |
        +----------v-----------+
        |  Named query layer   |   packages/graph (typed, tested Cypher)
        +----------+-----------+
                   |
     +-------------+--------------+------------------+
     |                            |                  |
 +---v-----------+       +--------v-------+   +------v--------+
 | Next.js web   |       |  MCP server    |   | GitHub webhook|
 | (UI + API)    |       |  (for coding   |   | (PR comment)  |
 | path animation|       |   agents)      |   +---------------+
 +---------------+       +----------------+
```

Graph naming in FalkorDB (one instance, many isolated graphs):

- `repo:<owner>/<name>` holds the repository knowledge graph. One graph per repository.
- `mem:<github_login>` holds one developer's memory graph.
- `state` holds the shared coordination graph for agent tasks.

## 5. Graph data model

All ids are stable strings so MERGE is idempotent.

### 5.1 Nodes

| Label | Id format | Key properties |
|---|---|---|
| Person | `person:<login>` | login, name, email_hash, first_seen, last_seen |
| Commit | `commit:<sha>` | sha, message, committed_at, additions, deletions, is_merge |
| PR | `pr:<number>` | number, title, body, state, created_at, merged_at, closed_at, base_branch, additions, deletions |
| Issue | `issue:<number>` | number, title, body, state, created_at, closed_at, labels (list) |
| Comment | `comment:<kind>:<github_id>` | body, created_at, kind (review, issue, commit), path, line, is_bot |
| File | `file:<path>` | path, language, first_seen, last_seen |
| Function | `fn:<path>#<qualified_name>` | name, qualified_name, path, start_line, end_line, signature_hash, valid_from, valid_to |
| Decision | `decision:<hash>` | summary, reason, scope_text, confidence, decided_at, status (active, superseded), embedding (vector) |
| Incident | `incident:<id>` | title, kind (revert, regression, hotfix), detected_at, severity_guess |

### 5.2 Edges

All edges may carry `valid_from` and `valid_to` (ISO timestamps or null for open ended). Edge-specific properties are listed.

```
(Person)-[:AUTHORED]->(Commit | PR | Issue | Comment)
(Person)-[:REVIEWED]->(PR)                       state (approved, changes_requested, commented)
(PR)-[:CONTAINS]->(Commit)
(Commit)-[:MODIFIED]->(File)                     additions, deletions
(Commit)-[:MODIFIED]->(Function)                 approx (boolean), lines_changed
(Function)-[:IN]->(File)
(Function)-[:CALLS]->(Function)                  confidence (0 to 1), valid_from, valid_to
(Comment)-[:ON]->(PR | Issue | Commit)
(PR)-[:FIXES]->(Issue)
(PR)-[:REVERTS]->(PR)
(PR)-[:MENTIONS]->(Issue | PR)
(Decision)-[:DERIVED_FROM]->(Comment | Issue | Commit | PR)
(Decision)-[:CONSTRAINS]->(Function | File)      strength (hard, soft)
(Decision)-[:SUPERSEDES]->(Decision)
(Incident)-[:CAUSED_BY]->(PR)
(Incident)-[:REPORTED_IN]->(Issue)
(Incident)-[:RESOLVED_BY]->(PR | Commit)
```

### 5.3 Why these choices

- Function level granularity is what makes blast radius meaningful. File-level graphs are too coarse.
- Incident is a first-class node so "this area has burned us before" is a traversal, not a guess.
- Decision is a first-class node, separate from Comment, because one decision may derive from several comments, and a decision has its own lifecycle (active or superseded).
- Temporal properties live on edges because relationships change over time (a function stops calling another, a decision gets superseded).

## 6. Ingestion pipeline (Ingestor)

### 6.1 Steps

1. Resolve the repo and default branch with Octokit.
2. Fetch commits (GraphQL for efficiency with history pagination), PRs with their commits, reviews and review comments, issues with comments. Cache every response on disk under `data/snapshots/<owner>__<name>/`.
3. MERGE Person, Commit, PR, Issue, Comment, File nodes and edges. Use batched `UNWIND $rows AS row MERGE ...` queries, 500 rows per batch.
4. Parse source with tree-sitter at HEAD to create Function nodes and CALLS edges.
5. Map commit hunks to functions to create MODIFIED edges.
6. Run incident detection.
7. Enqueue decision extraction tasks in the shared state graph.

### 6.2 Call graph construction

For each file, walk the syntax tree, collect function and method definitions with qualified names (class and method, or module and function), then collect call expressions inside each function body. Resolve a call:

- Same file, same scope name match: confidence 1.0.
- Imported symbol traced through the file's import statements to a defined function: confidence 0.9.
- Name-only match elsewhere in the repo and unique: confidence 0.6.
- Name-only match with several candidates: create edges to all with confidence divided by candidate count.
- Unresolvable (external library): no edge.

Blast radius queries filter on `confidence >= 0.5` by default, and the UI shows low-confidence edges dashed.

### 6.3 Incident detection heuristics

An Incident is created when any of these hold:

- A PR whose title or body matches a revert pattern (`Revert "..."`, `This reverts commit`) and which REVERTS an earlier PR. The incident is CAUSED_BY the reverted PR. kind = revert.
- An issue labeled `regression`, `bug`, `incident`, `hotfix` or whose body references "caused by #N" or "introduced in #N" or "broke after #N". The incident is CAUSED_BY the referenced PR. kind = regression.
- A PR labeled `hotfix` or titled with "hotfix" that FIXES an issue and touches functions modified within the previous 14 days by another PR. kind = hotfix, with CAUSED_BY pointing to that earlier PR.

Every Incident stores which heuristic produced it. The UI shows this. These are heuristics and are labeled as such.

### 6.4 Idempotency

Every write uses `MERGE (n:Label {id: $id}) SET n += $props`. Edges use `MERGE (a)-[r:TYPE]->(b) SET r += $props` with a deterministic key. Re-running ingestion changes nothing except newly arrived data. A test must assert equal counts after a second run.

## 7. Decision extraction

A Decision is a constraint or rationale a team agreed on, such as "do not cache here because data goes stale" or "rounding belongs in the payment layer".

### 7.1 Pre-filter (cheap, no LLM)

Keep a comment only if all of these hold: author is not a bot, body has at least 15 words, and it matches at least one rationale cue (because, so that, instead of, do not, don't, must, should, avoid, never, rather than, trade-off, workaround, hack, legacy, deprecated, breaks, regression). Group kept comments by PR or issue thread. Also consider PR bodies and commit messages that match cues.

### 7.2 LLM extraction

Input: one thread (PR title, body, relevant comments in order, with file path and line when known). All text is placed inside a delimited data block and the model is told it is untrusted data. Output is validated JSON:

```json
{
  "decisions": [
    {
      "summary": "short imperative statement of the decision",
      "reason": "why it was decided, in one or two sentences",
      "scope": {
        "files": ["path"],
        "functions": ["qualified_name"],
        "free_text": "area described in words if no exact symbol"
      },
      "strength": "hard or soft",
      "source_comment_ids": ["comment:review:123"],
      "confidence": 0.0,
      "supersedes_hint": "summary of an earlier decision this overrides, or null"
    }
  ]
}
```

Rules enforced in code:

- Drop decisions with confidence below 0.6.
- Every decision must reference at least one source comment id that exists in the input. Drop otherwise.
- Resolve scope to graph nodes: match function names against Function nodes touched in that PR first, then files in the PR. If nothing resolves, attach CONSTRAINS to the files in the PR with strength soft.
- Compute `id` as a hash of normalized summary plus source ids.
- Embed `summary + " " + reason` and store the vector on the node.

### 7.3 Supersession

For each new Decision, vector search existing active Decisions with the same constrained node set. If similarity is high and the LLM confirms the newer one contradicts or replaces the older (narrow yes or no question), create `(new)-[:SUPERSEDES]->(old)` and set old status to superseded. Only active decisions are shown by default.

### 7.4 Embeddings and vector index

Create a vector index on `Decision.embedding` with the dimension of the chosen embedding model and cosine similarity. Verify the exact index creation and query procedure syntax in the FalkorDB docs and a probe script first. Fuzzy questions follow this path: embed the question, vector search top-k Decisions, then traverse from those Decisions to constrained functions, source comments and related incidents. This hybrid of vector entry and graph traversal is the core retrieval pattern.

### 7.5 Time safety

Each Decision has `decided_at` equal to the timestamp of its latest source comment. When building as-of snapshots, only decisions whose `decided_at` is at or before the cutoff are included, and extraction used only comments at or before the cutoff. For the evaluation, decisions must be extracted per snapshot cutoff or filtered strictly by `decided_at`, with extraction text restricted to pre-cutoff comments.

## 8. Named queries

All queries live as `.cypher` files in `packages/graph/cypher/` with typed wrappers. The following are the required set. Adjust syntax after probing FalkorDB, but keep names, parameters and return shapes stable.

### 8.1 blast_radius

Purpose: callers of a changed function up to N hops with hop distance and call confidence.

```cypher
// params: $fn (string id), $maxHops (int, default 3), $minConf (float, default 0.5)
MATCH p = (c:Function {id: $fn})<-[:CALLS*1..3]-(caller:Function)
WHERE all(r IN relationships(p) WHERE r.confidence >= $minConf)
  AND caller.valid_to IS NULL
RETURN caller.id AS id, caller.qualified_name AS name, caller.path AS path,
       length(p) AS hops,
       reduce(conf = 1.0, r IN relationships(p) | conf * r.confidence) AS path_confidence
ORDER BY hops ASC, path_confidence DESC
LIMIT 200
```

Note: the variable length bound cannot always be a parameter in Cypher. If so, generate one query file per allowed value or validate and interpolate a whitelisted integer.

### 8.2 incident_history

Purpose: past incidents tied to a function or its direct callers.

```cypher
// params: $fns (list of function ids)
MATCH (f:Function) WHERE f.id IN $fns
MATCH (f)<-[:MODIFIED]-(c:Commit)<-[:CONTAINS]-(pr:PR)<-[:CAUSED_BY]-(i:Incident)
RETURN f.id AS fn, i.id AS incident, i.title AS title, i.kind AS kind,
       i.detected_at AS at, pr.number AS pr
ORDER BY i.detected_at DESC
```

### 8.3 active_decisions

Purpose: current decisions constraining given functions or their files.

```cypher
// params: $fns (list), $files (list)
MATCH (d:Decision {status: 'active'})-[k:CONSTRAINS]->(t)
WHERE (t:Function AND t.id IN $fns) OR (t:File AND t.path IN $files)
MATCH (d)-[:DERIVED_FROM]->(src)
RETURN d.id AS id, d.summary AS summary, d.reason AS reason, d.strength AS strength,
       d.confidence AS confidence, t.id AS target, collect(src.id) AS sources
```

### 8.4 why_trace

Purpose: the full explanation chain for one function, including superseded history.

```cypher
// params: $fn
MATCH (f:Function {id: $fn})<-[:CONSTRAINS]-(d:Decision)-[:DERIVED_FROM]->(src)
OPTIONAL MATCH (d)-[:SUPERSEDES]->(older:Decision)
OPTIONAL MATCH (src)-[:ON]->(pr:PR)
OPTIONAL MATCH (author:Person)-[:AUTHORED]->(src)
RETURN d, src, pr, author, older
ORDER BY d.decided_at DESC
```

### 8.5 who_knows

Purpose: rank people by recency-weighted involvement with a function, its file and its callers.

```cypher
// params: $fn, $now (epoch ms), $halfLifeDays (default 120)
MATCH (f:Function {id: $fn})
OPTIONAL MATCH (f)<-[:MODIFIED]-(c:Commit)<-[:AUTHORED]-(p:Person)
WITH p, c, $now AS now
WHERE p IS NOT NULL
WITH p, sum( 0.5 ^ ((now - c.committed_at_ms) / ($halfLifeDays * 86400000.0)) ) AS score,
     count(c) AS commits
RETURN p.login AS login, score, commits
ORDER BY score DESC
LIMIT 5
```

Combine with reviewers: add REVIEWED edges on PRs that touched the function with weight 0.5 of an authored commit.

### 8.6 reviewer_rank

Purpose: suggest reviewers for a PR by aggregating who_knows across its changed functions, excluding the author. Optionally use PageRank over a Person to Function bipartite projection as a tie-breaker. If graph algorithm procedures are used (PageRank, connected components, community detection, shortest path), verify names such as `algo.pageRank` in the FalkorDB docs for the installed version first.

### 8.7 path_for_evidence

Purpose: return the exact nodes and edges for a finding so the UI can animate it. Each finding type has a path builder:

- Incident finding: `(PR)-[:CONTAINS]->(Commit)-[:MODIFIED]->(Function)<-[:MODIFIED]-(Commit2)<-[:CONTAINS]-(PR2)<-[:CAUSED_BY]-(Incident)`.
- Decision finding: `(PR)-[:CONTAINS]->(Commit)-[:MODIFIED]->(Function)<-[:CONSTRAINS]-(Decision)-[:DERIVED_FROM]->(Comment)`.
- Blast finding: `(Function)<-[:CALLS*1..3]-(Caller)`.

Return paths as arrays of `{nodes: [...], edges: [...]}` with display labels and source text snippets.

### 8.8 as_of subgraph

Purpose: restrict any query to a moment in time. See section 12.

### 8.9 ownership_concentration

Purpose: for each module or directory, the share of commits by the top contributor over the last 12 months. Flag modules where one person has 80 percent or more, or where the second contributor has under 10 percent. Optionally add connected components or community detection to cluster modules by shared contributors.

## 9. Risk scoring

The score is a transparent weighted sum so it can be explained. It lives in `packages/agents/src/risk.ts` and returns the score and every component.

Inputs for a PR: changed functions F, blast radius B (distinct callers within 3 hops), incidents I touching F or direct callers, active decisions D constraining F, violations V among D, author familiarity A.

Components, each normalized to 0 to 1:

- blast = min(1, ln(1 + |B|) / ln(1 + 40))
- history = min(1, weighted incident count / 3), where an incident on a changed function counts 1.0, on a direct caller 0.5, and older than 24 months counts half
- decisions = 1.0 if any hard decision violated, 0.6 if any soft violated, else 0.2 if decisions exist but none violated, else 0
- familiarity = 1 minus min(1, author who_knows score for these functions / 5), so unfamiliar authors raise risk
- size = min(1, lines changed / 800)

Weights: blast 0.25, history 0.30, decisions 0.25, familiarity 0.10, size 0.10.

score = 100 * sum(weight * component).

Bands: under 30 low, 30 to 59 medium, 60 and above high. Overrides: a hard decision violation forces at least medium and an incident on a directly changed function within 12 months forces at least medium. The UI shows the formula and each component bar. Note in the UI that weights are hand-set heuristics, and in the evaluation report show how performance varies with the threshold.

## 10. Agents

All agents are plain TypeScript modules with an LLM used only where reasoning or language is needed. They share state through the `state` graph and read and write through the named query layer.

### 10.1 Ingestor

Triggered by CLI, API or webhook. Pulls GitHub data, writes the graph, creates Task nodes for decision extraction. Reports progress counts to the state graph so the UI can show real progress.

### 10.2 Archaeologist

Handles natural language questions. Pipeline: classify intent (why, who_knows, history, safety), resolve entities (function, file, line) with the question text plus optional context from the MCP call or UI selection, optionally do vector search over Decisions for fuzzy phrasing, run the matching named queries, then ask the LLM to compose a grounded answer from returned rows only, with each claim tagged by the source node id it came from. Output: answer text, claims with node ids, and the path set. If no evidence exists, say so plainly instead of guessing.

Tool list available to the LLM for planning (these are the MCP tools too): `why_trace`, `who_knows`, `blast_radius`, `incident_history`, `active_decisions`, `search_decisions`, `recent_changes`.

### 10.3 Reviewer

Handles pull requests. Pipeline: load PR files and hunks, map hunks to changed functions, run blast_radius, incident_history, active_decisions, run decision violation checks in parallel with the LLM (narrow yes or no with evidence, cached), compute risk, compute reviewer suggestions, personalize using the author's memory graph, build paths, render a PR comment and a structured JSON result.

Result shape:

```json
{
  "pr": 123,
  "risk": { "score": 72, "band": "high", "components": { "blast": 0.6, "history": 0.9, "decisions": 1.0, "familiarity": 0.4, "size": 0.2 } },
  "reasons": ["short plain-language reason with node ids"],
  "changed_functions": ["fn:..."],
  "blast_radius": [{ "id": "fn:...", "hops": 2, "confidence": 0.81 }],
  "incidents": [{ "id": "incident:...", "pr": 212, "kind": "regression" }],
  "decisions": [{ "id": "decision:...", "summary": "...", "violated": true, "evidence": "..." }],
  "reviewers": [{ "login": "...", "score": 3.4 }],
  "paths": [{ "kind": "incident", "nodes": [], "edges": [] }]
}
```

### 10.4 Memory agent and per-developer graphs

Each developer has an isolated graph `mem:<github_login>`. This demonstrates FalkorDB multigraph isolation and agent memory types.

Schema in the memory graph:

```
(Dev {login})
(Episode {id, at, kind, summary})                    episodic memory: each interaction
(Topic {id, name})                                   semantic memory: modules and concepts the dev works with
(Preference {id, key, value})                        procedural memory: how this dev likes to work
(Warning {id, decision_id, shown_at, outcome})       warnings shown and what happened

(Dev)-[:HAD]->(Episode)
(Episode)-[:ABOUT]->(Topic)
(Dev)-[:KNOWS {strength, last_touched}]->(Topic)
(Dev)-[:PREFERS]->(Preference)
(Dev)-[:WAS_WARNED]->(Warning)
```

Behavior:

- Write an Episode on every MCP call, ask query and PR review view, linked to Topics (module names, function names).
- Update KNOWS strength with decay over time and increase on repeated work.
- Record whether a warning was heeded (PR later changed to resolve the violation) or dismissed.
- The Reviewer and Archaeologist read the memory graph first: skip explaining modules the dev knows well, re-surface warnings they dismissed earlier if the same decision is relevant again, and mention prior related questions.
- Memory stays private to the dev: only the dev's own MCP session and UI session read it.

### 10.5 Shared state graph and coordination

Graph `state` holds work items so agents hand off through the graph and not through memory in a process.

```
(Task {id, type, status, payload_ref, created_at, started_at, finished_at, error})
(Agent {name})
(Task)-[:ASSIGNED_TO]->(Agent)
(Task)-[:DEPENDS_ON]->(Task)
(Task)-[:PRODUCED]->(Artifact {kind, ref})
```

Task types: ingest_repo, extract_decisions, review_pr, answer_question. Status transitions: queued, running, done, failed. Claiming a task uses an atomic compare-and-set in a single Cypher query (`MATCH (t:Task {status:'queued'}) WITH t LIMIT 1 SET t.status='running', ...`) so concurrent workers do not double-claim. A PR event creates `ingest_repo` (incremental) then `extract_decisions` then `review_pr` with DEPENDS_ON edges. Workers poll `state`. The UI has a small activity panel that reads this graph live.

## 11. MCP server

Package `packages/mcp`. Uses `@modelcontextprotocol/sdk`. Transport stdio by default. Tools return structured content plus a short text summary, and always include `paths`.

| Tool | Inputs | Returns |
|---|---|---|
| `explain_why` | repo, path, optional line or function | active decisions with reasons, source comments, authors, superseded history, paths |
| `check_change_safety` | repo, path, function, optional proposed_diff | risk score and components, blast radius list, incidents, decisions with violation checks, paths |
| `who_knows` | repo, path or function | ranked people with scores and evidence commits |
| `recent_decisions` | repo, module or path, limit | newest active decisions in that area |
| `search_decisions` | repo, query text | vector plus graph results with sources |
| `review_pr` | repo, pr_number | full ReviewResult |
| `my_context` | login | the caller's memory summary: recent topics, open warnings |

The user identity for memory comes from an environment variable `PROVENANCE_USER` in stdio mode. Document in README how to register the server in Claude Code and Codex configuration. Include a recommended instruction line users can add to their agent config: "Before editing any function in an indexed repo, call check_change_safety and respect hard decisions."

## 12. Time travel and evaluation

### 12.1 As-of snapshots

Because nodes and edges carry timestamps, a snapshot at time T is a filtered view: nodes with creation time at or before T, edges with `valid_from <= T and (valid_to is null or valid_to > T)`, Decisions with `decided_at <= T`, Incidents with `detected_at <= T`. Implement two strategies:

1. Query-time filtering: each named query accepts an optional `$asOf` and adds predicates. Use for the time slider.
2. Materialized snapshot: copy a filtered graph into `snap:<repo>:<pr>` for the evaluation so queries run without extra predicates. If graph copy is too slow, fall back to query-time filtering and prove correctness with a test.

Important subtlety: Function nodes and CALLS edges are parsed at HEAD. For historical correctness in the evaluation, either parse the repo at the PR's base commit for the changed files and their neighbors, or accept HEAD call edges filtered by file existence at that time and label this limitation in the results. Prefer parsing at the base commit for the changed files, since that gives correct function boundaries.

### 12.2 Evaluation protocol

1. Choose a larger well-known repo with a rich review history. Select 10 to 20 PRs that were reverted or later linked to regression issues (positives). Select an equal number of ordinary merged PRs with comparable size that were not reverted within 90 days (negatives).
2. For each PR, build the as-of snapshot at its merge time (use the PR creation time to be stricter).
3. Run the Reviewer in no-memory mode. Record score and band.
4. Compute for threshold bands: true positives, false positives, false negatives, true negatives, precision, recall, false alarm rate. Report at the default high threshold and show the full curve across thresholds.
5. Publish a table on the `/eval` page plus the raw JSON. State sample size and limitations (heuristic incident labels, small sample, selection bias).
6. Leakage check: a test inserts a marker future comment and asserts it does not appear in a snapshot and did not influence extraction.

Present results honestly. A result such as 6 of 12 reverted PRs flagged high with 2 of 12 normal PRs falsely flagged is a fine and credible outcome.

## 13. Bus factor and ownership (stretch)

Compute per module: share of commits and review activity by the top contributor over a trailing window, number of contributors with at least 10 percent share, and recency of the top contributor's last activity. Flag a module as a bus-factor risk when one person has at least 80 percent and nobody else has more than 10 percent, or the top person has been inactive for over 6 months. Optionally use community detection to find clusters of files edited by the same people and report clusters with a single member. Show as a heatmap on the repo overview page: module tiles colored by risk with tooltips listing evidence.

## 14. Web application specification

### 14.1 Pages

- Landing page: one-sentence pitch, a live-looking demo strip of a path animation, a "try on the demo repo" button, short explanation of the three questions it answers.
- Repos list: ingested repos with counts (commits, PRs, functions, decisions, incidents) and ingestion status from the state graph.
- Repo overview: summary stats, risk heatmap by module, bus factor flags, recent decisions list, recent high-risk PRs.
- PR review page (hero): left column verdict panel, right column PathGraph. Details below.
- Ask page: chat interface scoped to a repo; each assistant message shows claims with clickable source chips and a mini PathGraph for evidence.
- Eval page: table of evaluated PRs with scores and labels, summary metrics, threshold curve chart.
- Time page (stretch): slider over repo history that re-renders the overview and a chosen function's neighborhood as of that date.
- Activity panel (drawer): live view of Task nodes in the shared state graph, and a view of the current user's memory graph.

### 14.2 PR review page detail

Verdict panel:

- Risk gauge with number, band label and component bars with plain explanations.
- Three top reasons in plain sentences, each linked to a path (click a reason to play its path).
- Decisions at stake: card per decision with summary, reason, status (violated, respected), source link.
- Suggested reviewers with a one-line evidence each.
- Blast radius summary: count by hop, modules affected.

PathGraph (React Flow):

- Node shapes and colors per label: PR and Commit as rounded rectangles, Function as rectangles, Incident with a red border, Decision with an accent border, Comment as a note shape, Person as a circle.
- Edge labels show the relation name. CALLS edges below 0.7 confidence are dashed.
- Layout computed with dagre, left to right.
- "Play path" button: dims all nodes and edges, then reveals the selected path edge by edge every 600 ms with a glowing stroke and auto-pan to the active node. Pause and replay controls. Each step shows a caption in a bar under the graph, for example "Changed function getCartTotal was modified in PR 212".
- Clicking any node opens a side drawer with the node's source text (comment body, commit message, PR description), author, date and a link to GitHub.
- Cap at 150 nodes with a "show more" control that expands collapsed groups.

### 14.3 API routes

All inputs validated with zod. All responses typed.

- `POST /api/ingest` body `{repo}` creates tasks, returns task id.
- `GET /api/ingest/status?repo=` returns progress from the state graph.
- `POST /api/review` body `{repo, pr}` or `{repo, diff}` returns ReviewResult.
- `POST /api/ask` body `{repo, question, context?, user?}` returns answer, claims, paths.
- `GET /api/graph/subgraph?repo=&center=&hops=&asOf=` returns nodes and edges for the canvas.
- `GET /api/eval?repo=` returns evaluation results.
- `POST /api/webhook/github` verifies the signature, handles pull_request events.

## 15. GitHub webhook behavior

On `pull_request` opened, reopened or synchronize: create tasks (incremental ingest, review). When done, post or update a single comment identified by a hidden marker `<!-- provenance-review -->`. Comment content: risk band and score, the three top reasons, decisions at stake with links, suggested reviewers, and a link to the dashboard path page. Keep it under 250 words. Do not comment on draft PRs unless configured. Provide a dry-run flag that prints the comment instead of posting, used in development and demo fallback.

## 16. Demo script (2 to 3 minutes)

Pre-ingested demo repo, everything cached, backup recording ready.

1. 0:00 to 0:20. Problem. Show `git blame` on a function: it says who, not why. State that agents edit code blind.
2. 0:20 to 0:50. Open the repo overview. Show node counts and the graph in FalkorDB Browser for one second to prove the graph is real.
3. 0:50 to 1:40. Open the risky PR. Show risk 70 plus, press play on the path: PR to Function to earlier PR to Incident, then Function to Decision to the original review comment. Click the comment node to read the real text. Say the sentence: every claim has a path.
4. 1:40 to 2:05. In a terminal, a coding agent (Claude Code or Codex) calls `check_change_safety` through MCP before editing and changes its plan because of a hard decision.
5. 2:05 to 2:25. Open the activity drawer: show the developer's memory graph and the shared state graph with tasks handed between agents.
6. 2:25 to 2:50. Evaluation page: honest numbers with sample size.
7. 2:50 to 3:00. Close: Provenance gives agents and developers the reason behind the code.

## 17. Blog post outline (side prize)

Title idea: "Git blame tells you who. We built the graph that tells you why." Sections: the problem with blame; the idea of putting engineering context in a graph; the schema and why decisions are nodes; how a vector hit becomes a graph traversal; temporal edges and time travel; risk scoring and why it is a transparent formula; per-developer graphs and shared state for agents; evaluation results and what they do not prove; how to run it; what we would build next. Write in a human, direct voice with real code snippets and real screenshots. Publish to Medium or Hashnode and link in the submission.

## 18. Data and demo repo selection

Pick two repositories:

- Development repo: small, 200 to 500 commits, active review culture, TypeScript or JavaScript. Used to build and test quickly.
- Demo and evaluation repo: larger and well known, with visible reverts and review discussions. Ingest only a window (for example the last 18 months, or a subset of directories) to stay inside GitHub rate limits (about 5000 requests per hour with a token). Use GraphQL to reduce calls and the disk cache to never refetch.

Choose a demo PR in advance: one that was later reverted or linked to a regression and has a review comment stating a rationale. Verify the full path exists in the graph before the demo is scripted around it.

## 19. Failure handling

- GitHub rate limit: back off, resume from the cache, show progress in the UI.
- LLM failure: retry once, then skip the item and record an error on the Task. The product still works with decisions it has.
- FalkorDB down: UI shows a clear message and the command to start it.
- No evidence for a question: answer that nothing was found and suggest which data is missing. Never fabricate a path.
- Large blast radius: show the top nodes by hop and confidence and a count of the rest.

## 20. Glossary

- Blast radius: the set of functions that call a changed function, directly or through up to three hops.
- Decision: a reasoned constraint extracted from human discussion, linked to code and to its source text.
- Incident: a change that was reverted or later associated with a regression.
- Path: the ordered nodes and edges that justify a finding.
- As-of snapshot: the graph as it existed at a past moment.
- Hard decision: a constraint stated as a rule (never, must). Soft decision: a preference or a trade-off.
