# SKILL: Build Provenance

This file tells you, the coding agent, how to work on this project. Read it fully first. Then read BRAIN.md, which explains what Provenance is, how every part works, the graph schema, the queries, the agents, the MCP tools and the UI. SKILL.md is the "how you behave and what you build in what order". BRAIN.md is the "what the system is".

If the two files ever disagree, BRAIN.md wins on design and SKILL.md wins on process.

## 1. Mission

Build Provenance: a Next.js web application plus Node services that turn any GitHub repository into a temporal knowledge graph in FalkorDB, and then let agents answer three questions with a visible graph path as proof:

1. Why is this code the way it is?
2. What breaks if I change this?
3. Who actually knows this part of the system?

It is built for the Graph Hacks hackathon (WeMakeDevs and FalkorDB, Oct 15 to Oct 18, 2026). The primary track is Track 01, Agents That Act on Connected Data. The memory and decision-tracing parts also cover Track 02 (Agent Memory and Coordination) and Track 03 (Company Brain). The graph must shape what the agent does. A graph that sits on the side and is only displayed is a failure.

Deadline is hard. Working software that demos cleanly beats broad software that is half broken. Every decision below is made with that in mind.

## 2. Operating rules

1. Work in vertical slices. Each phase in section 6 ends with something that runs end to end and can be shown. Never leave the repo in a state where the app does not start.
2. Freeze the schema early. The graph schema in BRAIN.md section 5 and the Cypher files in `packages/graph/cypher/` are the contract between all parts. Do not rename labels, edge types or properties without updating BRAIN.md and every consumer in the same commit.
3. Agents never write free-form Cypher against the database at runtime. They call named, tested, parameterized queries from `packages/graph/src/queries/`. This is both a reliability and a safety rule. The only Cypher that takes user input must use parameters, never string concatenation.
4. Every answer the system produces must carry a path: the list of nodes and edges that justify it. If a query cannot return a path, it is not finished.
5. Ingestion is idempotent. Use MERGE with stable ids. Running ingestion twice must produce an identical graph.
6. Every edge that represents a fact in time carries `valid_from` and `valid_to` (nullable). Time travel and the evaluation depend on it.
7. No data leakage in evaluation. When building a historical snapshot, nothing dated after the cutoff may exist in the graph, including decisions extracted from later comments.
8. Do not invent facts about FalkorDB. If you are unsure of a procedure name or syntax, read the official docs at https://docs.falkordb.com and the client README at https://github.com/FalkorDB/falkordb-ts, then write a tiny script in `scripts/probe/` that proves the syntax against the running container before relying on it.
9. Never commit secrets. Tokens go in `.env.local`, which is git-ignored. Provide `.env.example`.
10. No emoji anywhere: not in code, comments, UI copy, commit messages or docs. Plain, direct language.
11. Keep the UI honest. If a number is a heuristic, label it as a heuristic. If an evaluation shows 5 of 10, show 5 of 10.
12. Prefer boring, well-known libraries over clever ones. Time is the scarcest resource.

## 3. Tech stack (fixed, do not swap)

- Language: TypeScript everywhere, strict mode on.
- Monorepo: pnpm workspaces.
- Web app: Next.js (App Router), React, Tailwind CSS, shadcn/ui for primitives.
- Graph visualization: React Flow (preferred for animated path highlighting) with dagre or elk for layout. Cytoscape is the fallback only if React Flow performance is a problem on large subgraphs.
- Backend services: Node.js 20 plus, running as route handlers in Next.js for the API and as standalone workers (tsx) for ingestion and agents.
- Graph database: FalkorDB, run locally with `docker run -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest`. Use the official `falkordb` npm client. FalkorDB Browser is available on port 3000 of that container for debugging.
- GitHub data: Octokit (`@octokit/rest`, `@octokit/graphql`, `@octokit/webhooks`).
- Code parsing: tree-sitter via `tree-sitter` and the language packages (`tree-sitter-typescript`, `tree-sitter-javascript`, `tree-sitter-python`). Start with TypeScript and JavaScript only.
- LLM: use the Anthropic SDK (`@anthropic-ai/sdk`) for decision extraction and agent reasoning, behind a thin interface `packages/llm` so the provider can be swapped. Embeddings: behind the same interface; use whichever embedding provider has a key available, defaulting to a local fallback if none (see BRAIN.md section 7).
- MCP: `@modelcontextprotocol/sdk`, stdio transport for local use and streamable HTTP for hosted use.
- Validation: zod for every boundary (API input, LLM JSON output, webhook payloads).
- Tests: vitest. Playwright only for one smoke test of the demo flow.
- Lint and format: eslint plus prettier, run in CI script `pnpm check`.

## 4. Repository layout

Create exactly this structure. Add files as needed but keep the top level stable.

```
provenance/
  SKILL.md
  BRAIN.md
  README.md
  .env.example
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  apps/
    web/                      Next.js app (UI plus API routes)
      app/
        (marketing)/page.tsx          landing page
        repos/page.tsx                list of ingested repos
        repos/[owner]/[name]/page.tsx repo overview (heatmap, bus factor)
        repos/[owner]/[name]/pr/[number]/page.tsx  PR review view with path animation
        repos/[owner]/[name]/ask/page.tsx          chat "why" view
        repos/[owner]/[name]/time/page.tsx         time slider (stretch)
        eval/page.tsx                 evaluation results page
        api/
          ingest/route.ts
          ask/route.ts
          review/route.ts
          graph/subgraph/route.ts
          webhook/github/route.ts
          eval/route.ts
      components/
        graph/PathGraph.tsx           React Flow canvas with animated path
        graph/NodeCard.tsx
        risk/RiskGauge.tsx
        chat/AskPanel.tsx
        ui/                           shadcn primitives
      lib/
  packages/
    graph/                    FalkorDB client wrapper, schema, queries
      cypher/                 .cypher files, one per named query
      src/
        client.ts
        schema.ts             index and constraint creation
        queries/              typed wrappers around cypher files
        temporal.ts           snapshot and as-of helpers
    ingest/                   GitHub plus tree-sitter ingestion
      src/github.ts
      src/parse.ts
      src/load.ts
      src/incidents.ts
    decisions/                LLM decision extraction
      src/extract.ts
      src/prompt.ts
      src/schema.ts
    agents/
      src/archaeologist.ts
      src/reviewer.ts
      src/memory.ts
      src/ingestor.ts
      src/state.ts            shared coordination graph
      src/risk.ts             risk scoring
    llm/                      provider interface, embeddings
    mcp/                      MCP server exposing the tools
    eval/                     historical evaluation harness
  scripts/
    seed-demo.ts              ingest the demo repo end to end
    probe/                    small scripts that verify FalkorDB syntax
  data/
    snapshots/                cached GitHub API responses for the demo repo
  docs/
    blog.md
    demo-script.md
```

## 5. Environment

`.env.example` must contain at least:

```
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_PASSWORD=
GITHUB_TOKEN=
GITHUB_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
EMBEDDING_PROVIDER=openai_or_voyage_or_local
EMBEDDING_API_KEY=
DEMO_REPO=owner/name
MCP_TRANSPORT=stdio
```

Commands that must exist in the root `package.json`:

- `pnpm dev` starts the web app.
- `pnpm db:up` starts FalkorDB through docker compose.
- `pnpm db:schema` creates indexes and the vector index.
- `pnpm ingest -- owner/name` runs ingestion for a repo.
- `pnpm extract:decisions -- owner/name` runs decision extraction.
- `pnpm seed:demo` runs db:schema, ingest, extract:decisions for the demo repo from cached data.
- `pnpm mcp` starts the MCP server over stdio.
- `pnpm eval -- owner/name` runs the historical evaluation.
- `pnpm check` runs typecheck, lint and tests.

## 6. Build phases

Do the phases in order. Do not start a phase until the acceptance check of the previous one passes. Each phase lists the deliverable and a concrete acceptance check you can run yourself.

### Phase 0: Foundation

Deliverable: monorepo scaffolding, docker compose for FalkorDB, `packages/graph` with a working client and one round-trip test.

Tasks: create the workspace, configure TypeScript, create `docker-compose.yml` for FalkorDB with a named volume, implement `client.ts` that connects, selects a graph by name and exposes `query(graphName, cypher, params)` returning typed rows, add a probe script that creates a node and reads it back.

Acceptance: `pnpm db:up && pnpm test --filter graph` passes and the probe script prints the node.

### Phase 1: Schema and ingestion core

Deliverable: a small public repo (200 to 500 commits) fully ingested into graph `repo:<owner>/<name>`.

Tasks:
1. Implement `schema.ts` to create indexes: unique-style lookups on `id` for every label, range indexes on timestamps, and the vector index on `Decision.embedding`. Verify the exact index syntax with a probe script first.
2. Implement GitHub fetchers with pagination, retry on secondary rate limits, and a disk cache in `data/snapshots/` keyed by request, so reruns do not hit the API.
3. Implement loaders that MERGE Person, Commit, PR, Issue, Comment, File nodes and their edges. Stable ids are defined in BRAIN.md section 5.
4. Implement tree-sitter parsing: for each file touched in the default branch HEAD, extract Function nodes (name, file, start line, end line, signature hash) and CALLS edges by resolving identifier calls within the repo on a best-effort basis. Resolution will be imperfect. Record `confidence` on CALLS edges (1.0 for same-file direct calls, 0.6 for name-matched cross-file calls).
5. Map commits to functions: for each commit, diff hunks are intersected with function line ranges at that commit's version when feasible. If per-commit parsing is too slow, parse only at HEAD and map hunks by line range approximation, and mark such MODIFIED edges with `approx: true`.

Acceptance: running `pnpm ingest` twice gives identical node and edge counts. A Cypher query returns, for a known function, its callers and the last 5 commits that touched it.

### Phase 2: Incidents and decisions

Deliverable: Incident nodes and Decision nodes in the graph, with embeddings.

Tasks:
1. Implement `incidents.ts` using heuristics from BRAIN.md section 6.3 (reverts, "regression" labeled issues, "caused by" references). Create Incident nodes with CAUSED_BY edges to PRs.
2. Implement decision extraction per BRAIN.md section 7: structured JSON output validated by zod, confidence threshold, embedding storage, SUPERSEDES detection.
3. Add a cost guard: batch comments per PR, skip bot comments and trivial comments ("LGTM", under 15 words with no rationale), cache LLM results on disk keyed by content hash.

Acceptance: for the demo repo, at least 30 Decision nodes exist, each with a DERIVED_FROM edge to a real comment, issue or commit, and each CONSTRAINS at least one Function or File. A vector query for "caching" returns relevant decisions.

### Phase 3: Queries and Reviewer agent

Deliverable: blast radius, why-trace, who-knows, risk score, all exposed as functions and as `/api/review` and `/api/ask`.

Tasks: implement every named query listed in BRAIN.md section 8 as a `.cypher` file plus a typed wrapper plus a vitest test against a tiny fixture graph. Implement `risk.ts` exactly per BRAIN.md section 9. Implement the Reviewer: given a PR (number or diff), derive changed functions, run blast radius, collect incidents and active decisions, detect decision violations, compute risk, and return a structured `ReviewResult` that includes the `paths` array.

Decision violation detection: for each active Decision constraining a changed function, ask the LLM a narrow yes or no question with the decision text and the diff hunk, returning `{violates: boolean, evidence: string}`. Cache results.

Acceptance: `POST /api/review` with a known risky PR from the demo repo returns risk above the high threshold, at least one path that ends in a Decision and at least one that ends in an Incident.

### Phase 4: UI with path animation

Deliverable: the PR review page and the ask page working against the real API.

Tasks: build `PathGraph.tsx` with React Flow. Requirements: nodes styled per label (distinct color and icon-free shape differences, no emoji), edges labeled with the relation, a "play path" control that highlights path edges one by one with a short delay and dims everything else, a side panel that shows the source text (comment body, commit message) when a node is clicked, and a risk gauge with the component breakdown from the risk formula. The ask page has a chat input; each answer renders the text plus the path graph for its evidence.

Acceptance: opening the demo PR in the browser shows the risk score, the animated path from PR to Function to Incident to Decision to source comment, and clicking the comment node shows its real text with a link to GitHub.

### Phase 5: MCP server and memory

Deliverable: `pnpm mcp` works from Claude Code and Codex, and per-developer memory graphs exist.

Tasks: implement the MCP tools from BRAIN.md section 11. Implement memory per BRAIN.md section 10: one graph per developer named `mem:<github_login>`, written on every MCP call and every review view, read by the Reviewer to personalize output. Implement the shared `state` graph for task handoff between Ingestor, Archaeologist and Reviewer, with Task nodes and status transitions.

Acceptance: from a Claude Code session with the MCP server registered, calling `check_change_safety` on a known function returns risk, paths and decisions. A second call by the same user shows an entry in `mem:<login>` and the response mentions the earlier interaction where relevant.

### Phase 6: Webhook and GitHub App behavior

Deliverable: opening a PR on the demo repo triggers ingestion of that PR, review, and a PR comment.

Tasks: implement `/api/webhook/github` with signature verification, handle `pull_request` opened and synchronize, enqueue a Task in the state graph, run Reviewer, post a comment with risk, top three reasons and a link to the dashboard path view. Never post more than one comment per PR; update the existing one.

Acceptance: a test PR receives a comment within 60 seconds in a local tunnel setup (use a tunnel such as smee or cloudflared for the demo).

### Phase 7: Evaluation harness

Deliverable: `pnpm eval` produces a results JSON and the `/eval` page shows the table.

Tasks: implement as-of snapshots (BRAIN.md section 12), pick 10 to 20 reverted or regression-causing PRs from a larger repo, plus an equal number of normal merged PRs as negatives, run the Reviewer on each as of its merge time, compute precision, recall and false alarm rate at the chosen risk threshold, and render the table honestly.

Acceptance: results file exists, the page renders, and a unit test proves no node or edge with a timestamp after the cutoff exists in an as-of snapshot.

### Phase 8: Time slider, bus factor, polish (stretch, only if earlier phases are solid)

Time slider on the repo page using as-of queries. Bus factor view using ownership concentration (BRAIN.md section 13). Landing page, loading states, error states, empty states.

### Phase 9: Submission assets

Write `README.md` (what it is, architecture picture, setup in under 10 commands, how to run the demo), `docs/blog.md` (see BRAIN.md section 17), `docs/demo-script.md` (see BRAIN.md section 16). Record notes of numbers for the pitch: node counts, query latency, evaluation result.

## 7. Cut order if time runs out

Never cut the items in group A. Cut from the bottom of group C upward.

- Group A (must ship): ingestion, decisions, blast radius, why-trace, risk score, path animation UI, README, demo video.
- Group B (should ship): MCP server, per-developer memory, shared state graph, webhook comment, evaluation.
- Group C (bonus, cut in this order, last item first): time slider, bus factor view, call graph confidence tuning, multi-language parsing.

## 8. Coding standards

- Strict TypeScript, no `any` without a comment explaining why.
- Every public function in `packages/*` has a short doc comment stating inputs, outputs and failure modes.
- Every Cypher query lives in a `.cypher` file with a header comment: purpose, parameters, return shape.
- Every LLM call has a zod schema for its output, one retry on parse failure with the validation error appended, and a hard timeout.
- Every external call (GitHub, LLM, embeddings) has retry with exponential backoff and jitter, and is cached on disk during ingestion.
- Errors are returned as typed results in services and surfaced in the UI with a readable message. No silent catch blocks.
- Logging: structured logs with a `component` field. No console noise in production paths.
- Keep functions small. If a function needs a comment to explain what a block does, extract the block.
- Accessibility: all interactive UI elements are keyboard reachable, color is never the only signal (use labels and shapes as well).

## 9. UI and design direction

The product should look like a serious developer tool, not a template.

- Dark theme as default with a light theme option. Neutral grays, one accent color for risk (red to amber scale) and one for provenance paths (a calm blue or teal). Keep the palette to five colors total.
- Typography: a clean sans for UI and a monospace for code, ids and Cypher. No decorative fonts.
- Layout: dense but breathable. The PR review page is a two-column layout: left is the verdict (risk gauge, three plain-language reasons, decisions at stake, suggested reviewers), right is the path graph canvas. The graph is the hero.
- Motion: the path animation is the only large motion. Everything else uses subtle transitions under 200 ms.
- Copy: short, specific, no marketing fluff. Example of good copy: "Changing getCartTotal affects 14 functions across 3 modules. A previous change here caused a regression (PR 212). An active decision says rounding must stay in the payment layer."
- Empty states explain what to do next. Loading states show real progress for ingestion (counts of commits, PRs, functions processed).

## 10. Testing strategy

- Unit tests for each named query against a fixture graph created by `packages/graph/test/fixture.ts`. The fixture is small and hand-built: 3 people, 4 PRs, 6 functions, 2 incidents, 3 decisions, one SUPERSEDES chain.
- Unit tests for risk scoring with boundary cases.
- Unit tests for as-of snapshot logic proving no future data.
- Contract tests for zod schemas of LLM output using recorded sample outputs.
- One Playwright smoke test: load the demo PR page, press play on the path, assert the final node is visible.
- Do not spend time on exhaustive UI tests.

## 11. Performance targets

- Named queries return in under 200 ms on the demo graph. Use `GRAPH.PROFILE` or `GRAPH.EXPLAIN` through the client when a query is slow and add indexes accordingly.
- PR review end to end under 15 seconds including LLM calls (violation checks run in parallel with a concurrency cap).
- Ingestion of the demo repo from cache under 3 minutes.
- Subgraph returned to the browser capped at 150 nodes. Collapse and summarize beyond that.

## 12. Security and safety

- Verify the GitHub webhook signature with the shared secret before any processing.
- Treat all repo text (comments, commit messages, issue bodies) as untrusted input. They may contain prompt injection. When passing them to an LLM, wrap them in clearly delimited data blocks, instruct the model to treat them as data only, and never let LLM output trigger actions other than writing validated JSON.
- The MCP server is read-mostly. Tools that write (memory updates) only write to the caller's own memory graph.
- Rate-limit the public API routes.
- Do not store GitHub tokens in the graph.

## 13. Parallel work with several agents

The team may run Codex, Claude and Antigravity at once. To avoid collisions:

- Ownership by package. Backend and ingestion work lives in `packages/graph`, `packages/ingest`, `packages/decisions`. Agent logic and MCP lives in `packages/agents`, `packages/mcp`, `packages/llm`. UI lives in `apps/web`.
- Shared contracts live in `packages/graph/src/types.ts` and `packages/graph/cypher/`. Only change them in a dedicated commit with the message prefix `contract:` and update BRAIN.md in the same commit.
- Commit small and often. Rebase before pushing. Never force-push to the main branch.
- If you are blocked by another package, stub it against the typed interface and continue. Leave a `TODO(contract)` marker that is greppable.

## 14. Pitfalls to avoid

- Trying to resolve the call graph perfectly. It will never be perfect. Use confidence and show it.
- Letting the LLM write Cypher. Use named queries only.
- Extracting decisions from every comment. Filter first, extract second.
- Forgetting timestamps on edges, then being unable to build snapshots.
- Building a pretty graph that does not drive the answer.
- Live ingestion during the demo. Always demo from cached, pre-ingested data.
- Leaving the evaluation for the last hour. Start it by Phase 7 and keep it running while polishing.
- Overstating results. State the sample size and limitations.

## 15. Definition of done

The project is done when all of these are true:

1. `pnpm seed:demo && pnpm dev` produces a working demo from a clean clone using only the README.
2. The demo PR page shows risk, reasons, decisions, suggested reviewers and the animated provenance path, each backed by real graph data.
3. The ask page answers "why is X like this" with source citations and a path.
4. The MCP server works from at least one external coding agent.
5. Per-developer memory and the shared state graph are visibly used (a debug panel or log view shows them).
6. The evaluation page shows real numbers with sample size.
7. README, blog and demo script exist. A demo video of 2 to 3 minutes is recorded.
8. `pnpm check` passes.

## 16. How to report progress

After finishing each phase, append a short entry to `docs/PROGRESS.md` with: phase name, what works, what is stubbed, known issues, and the exact command to verify. Keep entries factual and under ten lines.
