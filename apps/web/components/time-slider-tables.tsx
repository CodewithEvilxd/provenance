"use client";

import type {
  AsOfNode,
  AsOfEdge,
  TimelineReport,
} from "@provenance/agents/timeline";

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="as-of-stat">
      <span className="field-label" style={{ margin: 0 }}>
        {label}
      </span>
      <span style={{ font: "700 20px var(--mono)", color: "var(--ink)" }}>
        {value}
      </span>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {nodes.map((node) => (
        <div
          key={node.id}
          style={{
            padding: "10px 14px",
            background: "#f8f7f2",
            border: "1px solid var(--line)",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              font: "600 12px var(--sans)",
            }}
          >
            <span>{node.text || node.id}</span>
            <span
              style={{ font: "400 11px var(--mono)", color: "var(--muted)" }}
            >
              {node.timestamp || "Historical"}
            </span>
          </div>
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
          font: "400 12px var(--mono)",
        }}
      >
        <thead>
          <tr style={{ background: "#eae6dc", textAlign: "left" }}>
            <th style={{ padding: 8 }}>ID</th>
            <th style={{ padding: 8 }}>Label</th>
            <th style={{ padding: 8 }}>Text / Name</th>
            <th style={{ padding: 8 }}>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {nodes.slice(0, 100).map((n) => (
            <tr key={n.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: 8 }}>{n.id}</td>
              <td style={{ padding: 8 }}>{n.label}</td>
              <td style={{ padding: 8 }}>{n.text}</td>
              <td style={{ padding: 8, color: "var(--muted)" }}>
                {n.timestamp || "n/a"}
              </td>
            </tr>
          ))}
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
          font: "400 12px var(--mono)",
        }}
      >
        <thead>
          <tr style={{ background: "#eae6dc", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Source</th>
            <th style={{ padding: 8 }}>Relationship</th>
            <th style={{ padding: 8 }}>Target</th>
          </tr>
        </thead>
        <tbody>
          {edges.slice(0, 100).map((e, idx) => (
            <tr
              key={`${e.from}-${e.type}-${e.to}-${idx}`}
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <td style={{ padding: 8 }}>{e.from}</td>
              <td
                style={{
                  padding: 8,
                  color: "var(--rust)",
                  fontWeight: 600,
                }}
              >
                {e.type}
              </td>
              <td style={{ padding: 8 }}>{e.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TimelineResults({
  data,
  activeTab,
  onTabChange,
}: {
  data: TimelineReport;
  activeTab: "decisions" | "nodes" | "edges";
  onTabChange: (t: "decisions" | "nodes" | "edges") => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <div className="as-of-stats">
        <StatCard label="AS-OF NODES" value={data.totalNodes} />
        <StatCard label="AS-OF EDGES" value={data.totalEdges} />
        <StatCard label="KNOWN DECISIONS" value={data.activeDecisionsCount} />
        <StatCard label="KNOWN INCIDENTS" value={data.detectedIncidentsCount} />
      </div>

      <div className="card" style={{ marginTop: 20, padding: 0 }}>
        <TimelineSubtabButtons
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
          {activeTab === "nodes" && <NodesTable nodes={data.nodes} />}
          {activeTab === "edges" && <EdgesTable edges={data.edges} />}
        </div>
      </div>
    </div>
  );
}

function TimelineSubtabButtons({
  activeTab,
  data,
  onTabChange,
}: {
  activeTab: "decisions" | "nodes" | "edges";
  data: TimelineReport;
  onTabChange: (t: "decisions" | "nodes" | "edges") => void;
}) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
      {(["decisions", "nodes", "edges"] as const).map((tab) => {
        const count =
          tab === "decisions"
            ? data.activeDecisionsCount
            : tab === "nodes"
              ? data.nodes.length
              : data.edges.length;
        return (
          <button
            key={tab}
            type="button"
            className={`subtab-btn ${activeTab === tab ? "subtab-active" : ""}`}
            onClick={() => onTabChange(tab)}
            style={{
              padding: "12px 20px",
              border: "none",
              borderBottom:
                activeTab === tab
                  ? "2px solid var(--rust)"
                  : "2px solid transparent",
              background: "none",
              font: "600 12px var(--sans)",
              cursor: "pointer",
              color: activeTab === tab ? "var(--ink)" : "var(--muted)",
            }}
          >
            {tab.toUpperCase()} ({count})
          </button>
        );
      })}
    </div>
  );
}
