"use client";

import type {
  AsOfNode,
  AsOfEdge,
  TimelineReport,
} from "@provenance/agents/timeline";
import { HistoricalGraphView } from "./time-slider-graph";

export function StatCard({
  label,
  value,
  accent = "lime",
}: {
  label: string;
  value: number;
  accent?: "lime" | "violet" | "pink" | "amber";
}) {
  return (
    <div className={`as-of-stat accent-${accent}`}>
      <span className="field-label" style={{ margin: 0 }}>
        {label}
      </span>
      <strong style={{ font: "900 28px var(--display)", color: "var(--ink)" }}>
        {value.toLocaleString()}
      </strong>
    </div>
  );
}

export function DecisionsList({ nodes }: { nodes: AsOfNode[] }) {
  if (nodes.length === 0) {
    return (
      <div className="time-empty">
        <p>No decisions recorded prior to this cutoff.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {nodes.map((node) => (
        <div
          key={node.id}
          style={{
            padding: "14px 18px",
            background: "var(--panel)",
            border: "var(--bw) solid var(--ink)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--ex-xs)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className="tactile-chip chip-violet"
              style={{ fontSize: 11, padding: "3px 10px" }}
            >
              DECISION
            </span>
            <span style={{ font: "600 14px var(--sans)", color: "var(--ink)" }}>
              {node.text || node.id}
            </span>
          </div>
          <span
            className="tactile-chip chip-lime"
            style={{ fontSize: 11, padding: "3px 10px", whiteSpace: "nowrap" }}
          >
            {node.timestamp || "Historical"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NodesTable({ nodes }: { nodes: AsOfNode[] }) {
  if (nodes.length === 0) {
    return (
      <div className="time-empty">
        <p>Zero nodes existed prior to this cutoff.</p>
      </div>
    );
  }
  return (
    <div className="nodes-table-wrapper">
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          font: "500 13px var(--mono)",
        }}
      >
        <thead>
          <tr style={{ background: "#ede6d6", textAlign: "left" }}>
            <th style={{ padding: "12px 14px", borderBottom: "var(--bw) solid var(--ink)", font: "700 12px var(--mono)", letterSpacing: "0.06em" }}>ID</th>
            <th style={{ padding: "12px 14px", borderBottom: "var(--bw) solid var(--ink)", font: "700 12px var(--mono)", letterSpacing: "0.06em" }}>TYPE</th>
            <th style={{ padding: "12px 14px", borderBottom: "var(--bw) solid var(--ink)", font: "700 12px var(--mono)", letterSpacing: "0.06em" }}>TEXT / NAME</th>
            <th style={{ padding: "12px 14px", borderBottom: "var(--bw) solid var(--ink)", font: "700 12px var(--mono)", letterSpacing: "0.06em" }}>TIMESTAMP</th>
          </tr>
        </thead>
        <tbody>
          {nodes.slice(0, 100).map((n) => {
            const chipClass =
              n.label === "Decision"
                ? "chip-violet"
                : n.label === "Incident"
                  ? "chip-pink"
                  : n.label === "Commit"
                    ? "chip-lime"
                    : "chip-paper";
            return (
              <tr key={n.id} style={{ borderBottom: "1px solid #ebe6da" }}>
                <td style={{ padding: "12px 14px", fontWeight: 700 }}>{n.id}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span
                    className={`tactile-chip ${chipClass}`}
                    style={{ fontSize: 11, padding: "2px 8px" }}
                  >
                    {n.label}
                  </span>
                </td>
                <td style={{ padding: "12px 14px" }}>{n.text}</td>
                <td style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 12 }}>
                  {n.timestamp || "n/a"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EdgesTable({ edges }: { edges: AsOfEdge[] }) {
  if (edges.length === 0) {
    return (
      <div className="time-empty">
        <p>No edges connecting known nodes as of this cutoff.</p>
      </div>
    );
  }
  return (
    <div className="nodes-table-wrapper">
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          font: "500 13px var(--mono)",
        }}
      >
        <thead>
          <tr style={{ background: "#ede6d6", textAlign: "left" }}>
            <th style={{ padding: "12px 14px", borderBottom: "var(--bw) solid var(--ink)", font: "700 12px var(--mono)", letterSpacing: "0.06em" }}>SOURCE</th>
            <th style={{ padding: "12px 14px", borderBottom: "var(--bw) solid var(--ink)", font: "700 12px var(--mono)", letterSpacing: "0.06em" }}>RELATIONSHIP</th>
            <th style={{ padding: "12px 14px", borderBottom: "var(--bw) solid var(--ink)", font: "700 12px var(--mono)", letterSpacing: "0.06em" }}>TARGET</th>
          </tr>
        </thead>
        <tbody>
          {edges.slice(0, 100).map((e, idx) => (
            <tr
              key={`${e.from}-${e.type}-${e.to}-${idx}`}
              style={{ borderBottom: "1px solid #ebe6da" }}
            >
              <td style={{ padding: "12px 14px", fontWeight: 700 }}>{e.from}</td>
              <td style={{ padding: "12px 14px" }}>
                <span
                  className="tactile-chip chip-pink"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >
                  {e.type}
                </span>
              </td>
              <td style={{ padding: "12px 14px" }}>{e.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubtabButtons({
  activeTab,
  data,
  onTabChange,
}: {
  activeTab: "decisions" | "graph" | "nodes" | "edges";
  data: TimelineReport;
  onTabChange: (t: "decisions" | "graph" | "nodes" | "edges") => void;
}) {
  const tabs = ["decisions", "graph", "nodes", "edges"] as const;
  return (
    <div className="subtabs-bar">
      {tabs.map((tab) => {
        const count =
          tab === "decisions"
            ? data.activeDecisionsCount
            : tab === "graph"
              ? data.nodes.length
              : tab === "nodes"
                ? data.nodes.length
                : data.edges.length;
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            className={`subtab-btn ${isActive ? "subtab-active" : ""}`}
            onClick={() => onTabChange(tab)}
          >
            {tab.toUpperCase()} ({count})
          </button>
        );
      })}
    </div>
  );
}

export function TimelineResults({
  data,
  activeTab,
  onTabChange,
}: {
  data: TimelineReport;
  activeTab: "decisions" | "graph" | "nodes" | "edges";
  onTabChange: (t: "decisions" | "graph" | "nodes" | "edges") => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <div className="as-of-stats">
        <StatCard label="AS-OF NODES" value={data.totalNodes} accent="lime" />
        <StatCard label="AS-OF EDGES" value={data.totalEdges} accent="violet" />
        <StatCard label="KNOWN DECISIONS" value={data.activeDecisionsCount} accent="amber" />
        <StatCard label="KNOWN INCIDENTS" value={data.detectedIncidentsCount} accent="pink" />
      </div>

      <div
        style={{
          marginTop: 20,
          background: "var(--panel)",
          border: "var(--bw) solid var(--ink)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--ex-md)",
          overflow: "hidden",
        }}
      >
        <SubtabButtons
          activeTab={activeTab}
          data={data}
          onTabChange={onTabChange}
        />
        <div style={{ padding: 16 }}>
          {activeTab === "decisions" && (
            <DecisionsList
              nodes={data.nodes.filter((n: AsOfNode) => n.label === "Decision")}
            />
          )}
          {activeTab === "graph" && (
            <HistoricalGraphView nodes={data.nodes} edges={data.edges} />
          )}
          {activeTab === "nodes" && <NodesTable nodes={data.nodes} />}
          {activeTab === "edges" && <EdgesTable edges={data.edges} />}
        </div>
      </div>
    </div>
  );
}
