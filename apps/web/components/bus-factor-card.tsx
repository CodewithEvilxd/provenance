"use client";

import type { ModuleOwnership } from "@provenance/agents/ownership";

export function ModuleCard({ item }: { item: ModuleOwnership }) {
  const topContributor = item.topContributor;
  const isHigh = item.riskLevel === "high";

  return (
    <div className="module-card">
      <div className="module-card-head">
        <span className="module-name" title={item.module}>
          {item.module}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className={`risk-badge risk-${item.riskLevel}`}>
            {item.riskLevel.toUpperCase()} RISK
          </span>
          <span
            className="bus-factor-badge"
            title="Minimum maintainers for 50% commits"
          >
            BF: {item.busFactor}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          margin: "10px 0 4px",
          font: "400 11px var(--mono)",
          color: "var(--muted)",
        }}
      >
        <span>{item.totalCommits} commits</span>
        <span>{item.contributorsCount} contributors</span>
      </div>
      {topContributor && (
        <div style={{ margin: "8px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              font: "500 11px var(--sans)",
              marginBottom: 4,
            }}
          >
            <span>Top: @{topContributor.login}</span>
            <span style={{ font: "600 11px var(--mono)" }}>
              {topContributor.percentage}%
            </span>
          </div>
          <div className="contrib-bar-wrap">
            <div
              className="contrib-bar-fill"
              style={{
                width: `${Math.min(100, topContributor.percentage)}%`,
                background: isHigh ? "var(--rust)" : "var(--olive)",
              }}
            />
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {item.contributors.slice(0, 3).map((c) => (
          <span
            key={c.login}
            style={{
              padding: "2px 6px",
              background: "#ebe7dd",
              borderRadius: 3,
              font: "500 10px var(--mono)",
              color: "var(--ink)",
            }}
          >
            @{c.login} ({c.percentage}%)
          </span>
        ))}
      </div>
    </div>
  );
}
