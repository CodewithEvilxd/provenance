import Link from "next/link";
import {
  IconArrowRight,
  IconClock,
  IconDatabase,
  IconGitPr,
  IconGraph,
  IconSearch,
  IconShield,
  IconUsers,
} from "../../components/icons";

type RepoMeta = {
  owner: string;
  name: string;
  desc: string;
  prCount: number;
  branch: string;
  nodeCount: string;
  edgeCount: string;
  latency: string;
};

const repos: RepoMeta[] = [
  {
    owner: "vitejs",
    name: "vite",
    desc: "Next Generation Frontend Tooling · Monorepo Core AST Memory Graph",
    prCount: 23333,
    branch: "main",
    nodeCount: "4,281",
    edgeCount: "18,940",
    latency: "<38ms",
  },
];

export default function RepositoriesIndexPage() {
  return (
    <main className="product-shell">
      <RepositoriesRail />
      <div className="product-main">
        <header className="product-topbar">
          <div className="breadcrumbs">
            <div className="window-dots" aria-hidden="true" style={{ marginRight: 6 }}>
              <span className="window-dot dot-red" />
              <span className="window-dot dot-yellow" />
              <span className="window-dot dot-green" />
            </div>
            <span>Provenance</span>
            <span>/</span>
            <b>Connected Repositories</b>
          </div>
          <span
            className="tactile-chip chip-lime"
            style={{ fontSize: 10, padding: "2px 8px" }}
          >
            <span className="pulse-dot" /> FALKORDB ACTIVE
          </span>
        </header>

        <div className="page-content" style={{ maxWidth: 1040 }}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-dot" /> WORKSPACE REPOSITORIES
              </p>
              <h1 className="font-marker" style={{ fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "0.02em" }}>
                Select a repository{" "}
                <span className="doodle-underline-lime" style={{ fontSize: "0.55em", verticalAlign: "middle", marginLeft: 8 }}>
                  CONNECTED
                </span>
              </h1>
              <p className="page-subtitle font-comic" style={{ fontSize: 17, color: "#1a1a1f" }}>
                Inspect graph provenance, contributor concentration, and temporal history with zero future data leakage.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {repos.map((repo) => (
              <RepoCard key={`${repo.owner}/${repo.name}`} repo={repo} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function RepositoriesRail() {
  return (
    <aside className="side-rail">
      <Link className="brand brand-rail" href="/" aria-label="Provenance home">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>provenance</span>
      </Link>
      <div className="rail-label">NAVIGATION</div>
      <Link className="rail-link is-current" href="/repos">
        <span className="rail-glyph">RP</span> Repos
      </Link>
      <Link className="rail-link" href="/eval">
        <span className="rail-glyph">EV</span> Eval
      </Link>
      <div className="rail-bottom">
        <span className="pulse-dot" /> FalkorDB connected
      </div>
    </aside>
  );
}

function RepoCard({ repo }: { repo: RepoMeta }) {
  const base = `/repos/${repo.owner}/${repo.name}`;
  return (
    <div
      className="card"
      style={{
        padding: 28,
        background: "var(--panel)",
        border: "var(--bw-thick) solid var(--ink)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--ex-md)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h2 style={{ margin: 0, font: "800 24px var(--display)", letterSpacing: "-0.02em" }}>
              <Link
                href={base}
                style={{ color: "var(--ink)", textDecoration: "none" }}
              >
                {repo.owner}/{repo.name}
              </Link>
            </h2>
            <span className="tactile-chip" style={{ fontSize: 10, padding: "2px 8px" }}>
              BRANCH: {repo.branch}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              font: "500 14px var(--sans)",
              color: "var(--muted)",
            }}
          >
            {repo.desc}
          </p>
        </div>
        <span className="tactile-chip chip-lime">
          <span className="pulse-dot" /> FalkorDB Synced
        </span>
      </div>

      <RepoMetricsStrip repo={repo} />
      <RepoCardActions base={base} />
    </div>
  );
}

function RepoMetricsStrip({ repo }: { repo: RepoMeta }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        margin: "18px 0",
        padding: "14px 16px",
        background: "var(--panel-alt)",
        border: "1.5px solid var(--ink)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div>
        <div style={{ font: "800 10px var(--mono)", color: "var(--muted)" }}>GRAPH NODES</div>
        <div style={{ font: "800 18px var(--display)", color: "var(--ink)" }}>{repo.nodeCount}</div>
      </div>
      <div>
        <div style={{ font: "800 10px var(--mono)", color: "var(--muted)" }}>RELATIONAL EDGES</div>
        <div style={{ font: "800 18px var(--display)", color: "var(--ink)" }}>{repo.edgeCount}</div>
      </div>
      <div>
        <div style={{ font: "800 10px var(--mono)", color: "var(--muted)" }}>CYPHER LATENCY</div>
        <div style={{ font: "800 18px var(--display)", color: "var(--ink)" }}>{repo.latency}</div>
      </div>
      <div>
        <div style={{ font: "800 10px var(--mono)", color: "var(--muted)" }}>LATEST REVIEW PR</div>
        <div style={{ font: "800 18px var(--display)", color: "var(--ink)" }}>#{repo.prCount}</div>
      </div>
    </div>
  );
}

function RepoCardActions({ base }: { base: string }) {
  const askUrl = `${base}/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig`;
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
      <Link className="button button-lime" href={`${base}/pr/23333`}>
        <IconGitPr size={15} /> PR #23333 Review
      </Link>
      <Link className="button button-paper" href={base}>
        <IconUsers size={15} /> Bus Factor &amp; Ownership
      </Link>
      <Link className="button button-paper" href={`${base}/time`}>
        <IconClock size={15} /> History Time Slider
      </Link>
      <Link className="button button-dark" href={askUrl}>
        <IconSearch size={15} /> Ask Graph Engine
      </Link>
    </div>
  );
}
