# Historical Time Slider & Contributor Ownership (Phase 8)

## 1. Feature A — Historical Time Slider & Zero Future Leakage

### Overview

The Historical Time Slider provides temporal scrubbing across the repository knowledge graph. It allows users to inspect the exact state of code, functions, review decisions, and incident history as of any point in time, with strict backend guarantees against future information leakage.

### Backend Cypher Enforcement

Temporal filtering is enforced directly in FalkorDB graph queries rather than merely hiding elements in the frontend:

- **Timeline Bounds (`packages/graph/cypher/timeline-bounds.cypher`)**:
  Calculates the global temporal domain $[t_{min}, t_{max}]$ using `min(c.committed_at_ms)` and `max(c.committed_at_ms)`.
- **Milestones (`packages/graph/cypher/timeline-milestones.cypher`)**:
  Identifies significant chronological events (Decisions, Incidents, PR merges) for scrubber snapping.
- **As-Of Nodes (`packages/graph/cypher/as-of-nodes.cypher`)**:
  Selects nodes created on or before the cutoff timestamp ($t \le t_{cutoff}$):
  - `Commit`: `c.committed_at_ms <= $asOfMs`
  - `Decision`: `d.decided_at <= $asOf`
  - `Incident`: `i.detected_at <= $asOf`
  - `PR`: `pr.merged_at <= $asOf`
- **As-Of Edges (`packages/graph/cypher/as-of-edges.cypher`)**:
  Enforces bi-temporal relationship validity:
  - Connects strictly between valid as-of nodes.
  - Requires `valid_from <= $asOf` AND (`valid_to IS NULL OR valid_to > $asOf`).

### Honest Missing Timestamp Handling & Failure Modes

- If a cutoff timestamp string is unparseable or outside representable ranges, the API returns HTTP 400 with a structured Zod error.
- If a repository has no commits or timestamps in FalkorDB, the endpoint returns an honest empty state (`isEmpty: true`, zero nodes, zero edges) rather than inventing timestamps or hallucinating data.
- In-memory data transitions use React 19 `useTransition` so changing cutoffs updates the visual graph and tables smoothly without reloading the entire application.

---

## 2. Feature B — Contributor Ownership & Bus Factor

### Overview

Calculates code ownership concentration across repository modules using real default-branch commit history, identifying single-maintainer operational risks and estimating module bus factor.

### Formula & Calculation Standard

For any given directory module $M$:

1. **Module Partitioning**: Files are normalized to Unix path separators and mapped to module roots (e.g. `packages/vite`, `packages/create-vite`, `.github`, `src/client`).
2. **Commit Attribution**: For each commit modifying files in module $M$, the author is credited with the file modification count.
3. **Bot Account Filtering**: Automated bots (`dependabot[bot]`, `github-actions[bot]`, `renovate[bot]`, `greenkeeper`, `*-bot`, `bot-*`) are identified and separated from human maintainer pools.
4. **Cumulative Concentration & Bus Factor ($B\_{50}$)**:
   Contributors are ranked in descending order of contribution share $S_i$:
   $$S_i = \frac{C_i}{C_{total}} \times 100\%$$
   The module bus factor $B_{50}$ represents the minimum number of human maintainers $k$ needed to account for at least $50\%$ cumulative ownership:
   $$B_{50} = \min \left\{ k \;\middle|\; \sum_{i=1}^k S_i \ge 50\% \right\}$$
5. **Risk Classification**:
   - **High Risk**: $B_{50} = 1$ OR top contributor $S_1 \ge 80\%$. Single point of failure.
   - **Medium Risk**: $B_{50} = 2$ OR top contributor $S_1 \ge 50\%$ OR fragile secondary maintainer ($S_2 < 10\%$).
   - **Low Risk**: $B_{50} \ge 3$ with distributed contributions across multiple active maintainers.

### Mandatory Methodology Disclosure

Every ownership report and UI view renders the explicit methodological disclosure:

> _Bus factor is an empirical estimate of historical commit concentration, not proof of maintainer availability, responsiveness, or current architectural understanding. Calculations reflect distinct module modifications within the analyzed commit window._

---

## 3. Feature C — UI/UX Polish

### Design Principles

- **Restrained Visual Identity**: Adheres to the established typography, stark contrast palette, mono-styled numerical readouts, and restrained borders. Zero generic AI-looking gradients or decorative fluff.
- **Component States**: Skeletons with subtle pulse animations for loading states; clear error displays with actionable "Retry" triggers; honest empty states when no data is recorded.
- **Interactive Visual Graph**: Integrated `@xyflow/react` interactive graph visualization with node-type border color coding, relationship arrows, and click-to-inspect drawers.
- **Accessibility**: Semantic HTML headers (`<header>`, `<main>`, `<aside>`, `<nav>`), ARIA labels on sliders and filters, keyboard-focusable milestone pills, high-contrast badges, and `suppressHydrationWarning` on locale-dependent time formatting.
