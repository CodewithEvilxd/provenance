"use client";

import type {
  ModuleOwnership,
  ContributorShare,
} from "@provenance/agents/ownership";

function CardHeader({ item }: { item: ModuleOwnership }) {
  const riskClass = `badge-risk-${item.riskLevel}`;
  return (
    <div className="tile-top">
      <span className="module-name" title={item.module}>
        {item.module}
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span className={`badge-bus ${riskClass}`}>
          {item.riskLevel.toUpperCase()}
        </span>
        <span
          className="badge-bus"
          style={{ background: "#f0ede6", border: "1px solid var(--line)" }}
          title="Minimum maintainers covering 50% of module commits"
        >
          BF: {item.busFactor}
        </span>
      </div>
    </div>
  );
}

function MaintainerBar({
  top,
  riskLevel,
}: {
  top: ContributorShare;
  riskLevel: "high" | "medium" | "low";
}) {
  const fillClass = `fill-${riskLevel}`;
  return (
    <div>
      <div className="maintainer-row" style={{ marginBottom: 4 }}>
        <span className="maintainer-name">
          @{top.login}
          {top.isBot && <span className="bot-badge">BOT</span>}
        </span>
        <span style={{ font: "600 11px var(--mono)" }}>{top.percentage}%</span>
      </div>
      <div className="share-bar-container">
        <div
          className={`share-bar-fill ${fillClass}`}
          style={{ width: `${Math.min(100, top.percentage)}%` }}
        />
      </div>
    </div>
  );
}

function ContributorRoster({ list }: { list: ContributorShare[] }) {
  return (
    <div className="contributors-list">
      {list.slice(0, 3).map((c) => (
        <div key={c.login} className="contributor-item">
          <span>
            @{c.login}
            {c.isBot && <span className="bot-badge">BOT</span>}
          </span>
          <span style={{ font: "500 11px var(--mono)" }}>
            {c.commits} ({c.percentage}%)
          </span>
        </div>
      ))}
    </div>
  );
}

export function ModuleCard({ item }: { item: ModuleOwnership }) {
  return (
    <div className="module-tile">
      <CardHeader item={item} />
      <div className="tile-rationale">{item.riskRationale}</div>
      {item.topContributor && (
        <MaintainerBar top={item.topContributor} riskLevel={item.riskLevel} />
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          font: "400 11px var(--mono)",
          color: "var(--muted)",
        }}
      >
        <span>{item.totalCommits} commits</span>
        <span>{item.contributorsCount} contributors</span>
      </div>
      <ContributorRoster list={item.contributors} />
    </div>
  );
}
