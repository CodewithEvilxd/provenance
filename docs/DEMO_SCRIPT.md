# Provenance — Hackathon Demo Video Script

**Target Duration**: 3:30 to 4:30 minutes  
**Format**: Screen recording with voiceover commentary  
**Resolution**: 1080p / 60 FPS  
**Target Audience**: Graph Hacks judges, software engineering leads, open-source maintainers

---

## Scene 1: The Core Problem (0:00 – 0:45)

**Visual**:

- Browser shows GitHub Pull Request page for a complex refactoring PR.
- Zoom in on a review comment left 6 months ago where maintainers agreed: _"Never mutate the shared config in place; always return a cloned descriptor."_
- Switch to a new PR opened today violating that exact constraint.

**Voiceover**:

> "Every engineering team has experienced this: you spend hours debugging a production regression, only to realize the code violated an architectural constraint that maintainers agreed on six months ago in a pull request review comment.
>
> Critical code context is scattered across git commit histories, PR reviews, and Slack threads. When teams scale or maintainers change, this institutional knowledge evaporates.
>
> Meet **Provenance** — a temporal architectural knowledge graph powered by **FalkorDB** that protects your codebase from regressions before code merges."

---

## Scene 2: Architecture & FalkorDB Graph Model (0:45 – 1:30)

**Visual**:

- Switch to the Provenance landing page (`http://localhost:3000`).
- Show the visual graph architecture diagram:
  - Code AST (`File`, `Function`, `CALLS`)
  - Git history (`Commit`, `Person`, `MODIFIED`)
  - Review semantics (`PullRequest`, `Comment`, `Decision`, `Incident`)
- Highlight FalkorDB running in Docker on port 6379.

**Voiceover**:

> "Provenance indexes the entire lifecycle of a software system into a high-performance **FalkorDB** property graph.
>
> Unlike traditional code search tools that only look at text, FalkorDB enables Provenance to connect:
>
> - Syntax trees and multi-hop function call graphs,
> - Default-branch git commit history,
> - Architectural decisions extracted from review discussions,
> - Historical revert incidents, and
> - Vector embeddings of architectural constraints.
>
> By running on FalkorDB's C-based GraphBLAS engine, complex multi-hop graph traversals execute in sub-milliseconds."

---

## Scene 3: Live PR Review & Evidence Tracing (1:30 – 2:30)

**Visual**:

- Navigate to `/repos/vitejs/vite/pr/23333`.
- Highlight the **Change Risk Score: 89 / 100 (HIGH RISK)**.
- Scroll through the 5 risk channels:
  1. _Decision Constraints Violations_
  2. _Historical Incident Affinity_
  3. _Blast Radius / Call Graph Depth_
  4. _Author Scope Familiarity_
  5. _Code Surface Size_
- Click on an active decision card: show the full rationale and click the direct link to the original GitHub review comment.

**Voiceover**:

> "Here, Provenance evaluates PR #23333 on `vitejs/vite`.
>
> It flags this change as High Risk with an 89/100 score. Notice why:
> First, it detected that the modified function violates an active architectural decision regarding config descriptor immutability.
> Second, it traversed the call graph and discovered that 14 downstream functions depend on this function up to 3 hops away.
>
> Best of all, every decision provides full cryptographic provenance: with one click, we can inspect the exact source comment and original author discussion that produced the constraint."

---

## Scene 4: Historical Time Slider — Zero Future Leakage (2:30 – 3:30)

**Visual**:

- Click the top tab: **History Time Slider** (`/repos/vitejs/vite/time`).
- Show the selected cutoff date: `2026-10-15`.
- Grab the slider handle and scrub backwards to `2026-08-01`.
- Watch the live node count drop from 150 to 92.
- Switch to the **Visual Graph** tab: show the interactive `@xyflow/react` nodes and directed edges updating live without reloading the page.
- Click the "Midpoint" button to snap the scrubber.

**Voiceover**:

> "One of our most powerful features is the **Historical Time Slider**.
>
> When debugging a past failure or benchmarking an AI model, evaluating past code with future knowledge introduces catastrophic data leakage.
>
> Provenance enforces bi-temporal semantics directly in FalkorDB Cypher queries:
> When we drag the slider back to August 2026, every commit, review decision, and incident after that cutoff instantly disappears from the view.
>
> We can explore the interactive visual subgraph of the repository exactly as it existed at that moment in history."

---

## Scene 5: Contributor Ownership & Bus Factor Heatmap (3:30 – 4:15)

**Visual**:

- Switch to the **Ownership & Bus Factor** tab (`/repos/vitejs/vite`).
- Show the aggregate metrics:
  - _Average Bus Factor: 1.84_
  - _High Risk Modules: 31_
  - _Commits Analyzed: 1,915_
- Filter by `HIGH` risk modules; show the visual commit share bars.
- Type in the search box: `packages/vite`.
- Hover over the methodology disclosure banner.

**Voiceover**:

> "Next is **Contributor Ownership and Bus Factor analysis**.
>
> By querying commit modifications across directory modules in FalkorDB, Provenance calculates the empirical Bus Factor—the minimum number of maintainers needed to account for 50% of a module's codebase.
>
> In this view, high-risk modules with a single maintainer concentration are immediately flagged, with automated bot accounts like Dependabot cleanly filtered out."

---

## Scene 6: MCP Agent Integration & Conclusion (4:15 – 5:00)

**Visual**:

- Split-screen showing Cursor / Claude Desktop interacting with the Provenance MCP server.
- The agent calls `explain_code_constraint` and `check_change_safety`, receiving structured graph evidence.
- Final slide with GitHub repo URL, FalkorDB logo, and hackathon details.

**Voiceover**:

> "Finally, Provenance isn't just a dashboard—it's an MCP server. AI coding agents can query FalkorDB in real time to ask: _'What constraints govern this function before I edit it?'_
>
> With over 155 unit tests, 81% historical PR evaluation accuracy, and FalkorDB at its core, Provenance makes codebase intelligence proactive, transparent, and durable.
>
> Check out the open-source repository on GitHub. Thank you!"
