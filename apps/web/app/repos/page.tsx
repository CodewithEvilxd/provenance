import Link from "next/link";

type RepoMeta = {
  owner: string;
  name: string;
  desc: string;
  prCount: number;
  branch: string;
};

const repos: RepoMeta[] = [
  {
    owner: "vitejs",
    name: "vite",
    desc: "Next Generation Frontend Tooling",
    prCount: 23333,
    branch: "main",
  },
];

export default function RepositoriesIndexPage() {
  return (
    <main className="product-shell">
      <RepositoriesRail />
      <div className="product-main">
        <header className="product-topbar">
          <div className="breadcrumbs">
            <span>Provenance</span>
            <span>/</span>
            <b>Connected Repositories</b>
          </div>
        </header>

        <div className="page-content" style={{ maxWidth: 1000 }}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-dot" /> WORKSPACE REPOSITORIES
              </p>
              <h1>Select a repository</h1>
              <p className="page-subtitle">
                Inspect graph provenance, contributor concentration, and
                temporal history.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
      <div className="rail-bottom">
        <span className="connection-dot" /> FalkorDB connected
      </div>
    </aside>
  );
}

function RepoCard({ repo }: { repo: RepoMeta }) {
  const base = `/repos/${repo.owner}/${repo.name}`;
  return (
    <div className="card" style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px", font: "600 18px var(--sans)" }}>
            <Link
              href={base}
              style={{ color: "var(--ink)", textDecoration: "none" }}
            >
              {repo.owner}/{repo.name}
            </Link>
          </h2>
          <p
            style={{
              margin: 0,
              font: "400 13px var(--sans)",
              color: "var(--muted)",
            }}
          >
            {repo.desc}
          </p>
        </div>
        <span className="status-mark" style={{ font: "500 12px var(--mono)" }}>
          Graph Active
        </span>
      </div>
      <RepoCardActions base={base} />
    </div>
  );
}

function RepoCardActions({ base }: { base: string }) {
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
      <Link className="button button-dark" href={base}>
        Bus Factor & Ownership
      </Link>
      <Link
        className="button"
        style={{ background: "#eae6dc", color: "var(--ink)" }}
        href={`${base}/time`}
      >
        History Time Slider
      </Link>
      <Link
        className="button"
        style={{ background: "#eae6dc", color: "var(--ink)" }}
        href={`${base}/pr/23333`}
      >
        PR Review #23333
      </Link>
      <Link
        className="button"
        style={{ background: "#eae6dc", color: "var(--ink)" }}
        href={`${base}/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig`}
      >
        Ask Graph
      </Link>
    </div>
  );
}
