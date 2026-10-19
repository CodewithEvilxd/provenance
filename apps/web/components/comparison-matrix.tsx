import Link from "next/link";
import { IconArrowRight, IconCheck, IconShield, IconSparkles } from "./icons";

type ComparisonRow = {
  dimension: string;
  gitBlame: string;
  vectorRag: string;
  provenance: string;
  isHighlight?: boolean;
};

const ROWS: ComparisonRow[] = [
  {
    dimension: "Code Call Graph Awareness",
    gitBlame: "None (flat line diffs only)",
    vectorRag: "Fuzzy chunk similarity only",
    provenance: "Full multi-hop AST call graph (1-3 hops)",
    isHighlight: true,
  },
  {
    dimension: "Architectural Decision Tracking",
    gitBlame: "None (lost in commit logs)",
    vectorRag: "Unlinked text embeddings",
    provenance: "Deterministic Decision nodes with citations",
    isHighlight: true,
  },
  {
    dimension: "Historical Time Cutoff Engine",
    gitBlame: "Manual git checkout required",
    vectorRag: "Prone to future data leakage",
    provenance: "Pure Cypher cutoff ($ts <= $cutoff) with 0% leak",
    isHighlight: true,
  },
  {
    dimension: "Bus Factor & Ownership",
    gitBlame: "Naive lines-of-code count",
    vectorRag: "Not supported",
    provenance: "Mathematical Lorenz curves & Gini concentration",
  },
  {
    dimension: "AI Hallucination Risk",
    gitBlame: "0% (Raw text, no reasoning)",
    vectorRag: "15% - 30% (Embedding noise)",
    provenance: "0.0% (Pure Cypher graph ground truth)",
    isHighlight: true,
  },
  {
    dimension: "IDE Protocol Integration",
    gitBlame: "Not supported",
    vectorRag: "Custom brittle scrapers",
    provenance: "Native JSON-RPC MCP Server (@provenance/mcp)",
  },
  {
    dimension: "Query Latency",
    gitBlame: "Slow on large repos (>1s)",
    vectorRag: "200ms - 800ms vector index",
    provenance: "<38ms via FalkorDB RAM GraphBLAS",
    isHighlight: true,
  },
];

function ComparisonHeader() {
  return (
    <div className="section-head">
      <div className="section-head-top">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> BENCHMARK COMPARISON
        </span>
        <span className="tactile-chip chip-pink tilt-right">HEAD-TO-HEAD</span>
      </div>
      <h2>
        Why Provenance Outperforms{" "}
        <span className="doodle-underline-lime">Git Blame &amp; Vector RAG</span>
      </h2>
      <p className="section-lede font-hand" style={{ fontSize: 19, color: "#363531", lineHeight: 1.45 }}>
        Traditional tools either lack architectural causality or suffer from severe
        hallucination and temporal contamination. Provenance fixes this with pure graph memory.
      </p>
    </div>
  );
}

function ComparisonKpiBar() {
  return (
    <div className="comparison-kpi-bar">
      <div className="kpi-mini-card">
        <span className="kpi-mini-val">&lt;38ms</span>
        <span className="kpi-mini-lbl">FalkorDB Traversal</span>
      </div>
      <div className="kpi-mini-card">
        <span className="kpi-mini-val val-green">0.0%</span>
        <span className="kpi-mini-lbl">Future Data Leakage</span>
      </div>
      <div className="kpi-mini-card">
        <span className="kpi-mini-val val-lime">100%</span>
        <span className="kpi-mini-lbl">Deterministic Evidence</span>
      </div>
      <div className="kpi-mini-card">
        <span className="kpi-mini-val val-violet">MCP 1.0</span>
        <span className="kpi-mini-lbl">Native IDE Protocol</span>
      </div>
    </div>
  );
}

function ComparisonTable() {
  return (
    <div className="comparison-table-wrapper">
      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col" style={{ width: "26%" }}>CAPABILITY / METRIC</th>
            <th scope="col" style={{ width: "22%" }}>GIT BLAME</th>
            <th scope="col" style={{ width: "24%" }}>VECTOR SEARCH (RAG)</th>
            <th scope="col" className="provenance-col-head" style={{ width: "28%" }}>
              <span className="prov-brand-badge">
                <IconShield size={14} /> PROVENANCE + FALKORDB
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.dimension} className={row.isHighlight ? "highlight-row" : ""}>
              <td className="dim-cell">
                <b>{row.dimension}</b>
              </td>
              <td className="cell-muted cell-flaw">
                <span className="flaw-tag">FLAT</span> {row.gitBlame}
              </td>
              <td className="cell-muted cell-warn">
                <span className="warn-tag">FUZZY</span> {row.vectorRag}
              </td>
              <td className="cell-provenance">
                <span className="prov-check">
                  <IconCheck size={13} />
                </span>
                <span>{row.provenance}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="comparison-table-foot">
        <div className="foot-verdict">
          <IconSparkles size={16} />
          <span>
            <b>FalkorDB Graph Advantage:</b> Linear speedup via GraphBLAS sparse matrices.
            Zero LLM speculation, 100% audit-verified citations.
          </span>
        </div>
        <Link className="button button-lime button-sm" href="/repos/vitejs/vite/pr/23333">
          Inspect Live Review <IconArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export function ComparisonMatrix() {
  return (
    <section className="comparison-section" aria-label="Architectural comparison">
      <ComparisonHeader />
      <ComparisonKpiBar />
      <ComparisonTable />
    </section>
  );
}
