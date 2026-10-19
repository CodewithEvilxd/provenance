import {
  IconDatabase,
  IconGraph,
  IconClock,
  IconShield,
  IconActivity,
} from "./icons";

type StatItem = {
  label: string;
  value: string;
  sublabel: string;
  icon: (props: { size?: number }) => React.JSX.Element;
  badge: string;
};

const STATS: StatItem[] = [
  {
    label: "KNOWLEDGE NODES",
    value: "4,281",
    sublabel: "Functions, Commits, PRs & Decisions",
    icon: IconDatabase,
    badge: "FALKORDB RAM",
  },
  {
    label: "RELATIONAL EDGES",
    value: "18,940",
    sublabel: "CALLS, MODIFIES, GOVERNS links",
    icon: IconGraph,
    badge: "SUBGRAPH MATRIX",
  },
  {
    label: "TRAVERSAL LATENCY",
    value: "<38ms",
    sublabel: "3-hop Cypher blast radius search",
    icon: IconActivity,
    badge: "REAL-TIME",
  },
  {
    label: "FUTURE DATA LEAKAGE",
    value: "0.0%",
    sublabel: "Strict cutoff time enforcement",
    icon: IconClock,
    badge: "AUDIT CERTIFIED",
  },
];

export function GraphStatsBar() {
  return (
    <div className="stats-banner" aria-label="Key system metrics">
      <div className="stats-grid">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="stat-card">
              <div className="stat-card-top">
                <span className="stat-icon-wrap">
                  <Icon size={16} />
                </span>
                <span className="tactile-chip" style={{ fontSize: 9, padding: "2px 7px" }}>
                  {stat.badge}
                </span>
              </div>
              <div className="stat-val">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-sub">{stat.sublabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
