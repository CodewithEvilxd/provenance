"use client";

import { useState } from "react";
import {
  IconDatabase,
  IconGitPr,
  IconClock,
  IconCpu,
  IconTerminal,
  IconCode,
} from "./icons";

type WorkflowStep = {
  id: string;
  num: string;
  title: string;
  badge: string;
  shortDesc: string;
  detail: string;
  techStack: string;
  cypherSample: string;
  icon: (props: { size?: number }) => React.JSX.Element;
};

const STEPS: WorkflowStep[] = [
  {
    id: "ingest",
    num: "01",
    title: "AST & Code Graph Ingestion",
    badge: "TREE-SITTER & GIT",
    shortDesc: "Extracts functions, call graphs, imports, and commit diffs into relational entities.",
    detail:
      "Every pull request or commit triggers AST parsing. Functions, classes, and their call hierarchies are extracted into distinct graph nodes with deterministic SHA-backed IDs.",
    techStack: "Tree-sitter AST parser, Git commit walker, TypeScript compiler API",
    cypherSample:
      "CREATE (fn:Function {id: $fnId, name: $name, file: $filePath, lines: $lines, timestamp: $ts})\nCREATE (c:Commit {hash: $hash, timestamp: $ts})-[:MODIFIED]->(fn)",
    icon: IconCode,
  },
  {
    id: "decisions",
    num: "02",
    title: "Decision & Incident Mining",
    badge: "LLM + HEURISTIC EXTRACTOR",
    shortDesc: "Discovers architectural decisions, ADRs, PR reviews, and past incidents from history.",
    detail:
      "Synthesizes commit messages, PR conversations, and architectural records into verified Decision nodes. Links each decision to the specific code functions it protects.",
    techStack: "Decision Extractor (Gemini / OpenRouter), GitHub API, Markdown ADR parser",
    cypherSample:
      "MATCH (fn:Function {id: $fnId})\nCREATE (d:Decision {id: $dId, title: $title, rationale: $rationale, timestamp: $ts})\nCREATE (d)-[:GOVERNS]->(fn)",
    icon: IconGitPr,
  },
  {
    id: "falkordb",
    num: "03",
    title: "FalkorDB In-Memory Graph",
    badge: "CYPHER ENGINE",
    shortDesc: "Caches nodes and edges in Redis-compatible memory for sub-40ms traversal latency.",
    detail:
      "FalkorDB stores the multi-layered graph in RAM using sparse matrix linear algebra. Cypher queries traverse thousands of paths per millisecond with zero external SQL overhead.",
    techStack: "FalkorDB v4 (Redis protocol), GraphBLAS matrix engine, Cypher 9.0",
    cypherSample:
      "GRAPH.QUERY vite_memory \"MATCH (pr:PR {number: $num})-[:TOUCHES]->(fn:Function)\nMATCH path = (fn)-[:CALLS*1..3]->(target:Function)\nRETURN path, target LIMIT 50\"",
    icon: IconDatabase,
  },
  {
    id: "temporal",
    num: "04",
    title: "Temporal Cutoff Isolation",
    badge: "ZERO FUTURE LEAKAGE",
    shortDesc: "Enforces strict time bounds ($cutoff) to ensure audits never see future code.",
    detail:
      "Every traversal applies a mathematical temporal constraint (timestamp <= cutoff). This guarantees 100% deterministic time-travel: inspecting a 2024 PR only yields 2024 context.",
    techStack: "Strict Cypher WHERE clauses, Monotonic epoch filter, Temporal evaluation harness",
    cypherSample:
      "MATCH (f:Function)-[:CALLS]->(target:Function)\nWHERE f.timestamp <= $cutoff AND target.timestamp <= $cutoff\nOPTIONAL MATCH (target)-[:SUBJECT_TO]->(d:Decision)\nWHERE d.timestamp <= $cutoff\nRETURN f, target, d",
    icon: IconClock,
  },
  {
    id: "surfaces",
    num: "05",
    title: "Multi-Surface Intelligence",
    badge: "DECISION SURFACES & MCP",
    shortDesc: "Feeds PR blast reviews, Lorenz bus factor, natural language Q&A, and IDE MCP agents.",
    detail:
      "Calculates multi-hop blast radius, Gini concentration risk, and serves context directly into Cursor and Claude Code via Model Context Protocol tools.",
    techStack: "Next.js 16 App Router, React Flow visualizer, @provenance/mcp JSON-RPC server",
    cypherSample:
      "CALL provenance.blast_radius($prNumber, $cutoff)\nYIELD paths, affectedCount, riskBand, conflictingDecisions\nRETURN riskBand, conflictingDecisions",
    icon: IconCpu,
  },
];

function StepCard({
  step,
  isActive,
  onSelect,
}: {
  step: WorkflowStep;
  isActive: boolean;
  onSelect: () => void;
}) {
  const Icon = step.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`workflow-step-btn ${isActive ? "is-active" : ""}`}
      aria-pressed={isActive}
    >
      <div className="step-btn-top">
        <span className="step-num">{step.num}</span>
        <span className="tactile-chip" style={{ fontSize: 9, padding: "2px 7px" }}>
          {step.badge}
        </span>
      </div>
      <div className="step-btn-body">
        <div className="step-icon-wrap">
          <Icon size={18} />
        </div>
        <div>
          <h4>{step.title}</h4>
          <p>{step.shortDesc}</p>
        </div>
      </div>
    </button>
  );
}

function ActiveStepDetail({ step }: { step: WorkflowStep }) {
  const Icon = step.icon;
  return (
    <div className="workflow-detail-panel">
      <div className="window-chrome">
        <div className="window-dots" aria-hidden="true">
          <span className="window-dot dot-red" />
          <span className="window-dot dot-yellow" />
          <span className="window-dot dot-green" />
        </div>
        <span className="window-title">
          PIPELINE STAGE {step.num} · {step.title}
        </span>
        <span
          className="tactile-chip chip-lime"
          style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px" }}
        >
          {step.badge}
        </span>
      </div>
      <div className="workflow-detail-inner">
        <div className="workflow-detail-header">
          <div className="detail-icon-box">
            <Icon size={26} />
          </div>
          <div>
            <h3>{step.title}</h3>
            <p className="detail-desc">{step.detail}</p>
          </div>
        </div>

        <div className="workflow-tech-row">
          <span className="tech-label">UNDER THE HOOD:</span>
          <span className="tech-value">{step.techStack}</span>
        </div>

        <div className="workflow-code-box">
          <div className="code-box-header">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconTerminal size={14} /> EXECUTED CYPHER PATTERN
            </span>
            <span className="code-box-badge">FalkorDB v4</span>
          </div>
          <pre className="code-box-content">{step.cypherSample}</pre>
        </div>
      </div>
    </div>
  );
}

export function ArchitectureFlow() {
  const [activeStepId, setActiveStepId] = useState("ingest");
  const activeStep: WorkflowStep =
    STEPS.find((s) => s.id === activeStepId) ?? STEPS[0]!;

  return (
    <section className="architecture-section" aria-label="End to end working flow">
      <div className="section-head">
        <div className="section-head-top">
          <span className="eyebrow">
            <span className="eyebrow-dot" /> SYSTEM ARCHITECTURE
          </span>
          <span className="tactile-chip chip-lime">5-STAGE DETERMINISTIC PIPELINE</span>
        </div>
        <h2>
          How Provenance Works <span className="doodle-underline-lime">End-to-End</span>
        </h2>
        <p className="section-lede font-hand" style={{ fontSize: 19, color: "#363531", lineHeight: 1.45 }}>
          From source code AST parsing to in-memory Cypher traversal and zero-leakage
          historical time audits. Click any stage below to inspect its execution.
        </p>
      </div>

      <div className="workflow-grid">
        <div className="workflow-steps-col">
          {STEPS.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              isActive={step.id === activeStepId}
              onSelect={() => setActiveStepId(step.id)}
            />
          ))}
        </div>
        <div className="workflow-detail-col">
          <ActiveStepDetail step={activeStep} />
        </div>
      </div>
    </section>
  );
}
