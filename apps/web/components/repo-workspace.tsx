"use client";

import Link from "next/link";
import { useState } from "react";
import BusFactorHeatmap from "./bus-factor-heatmap";
import TimeSlider from "./time-slider";
import type { RepositoryOwnershipReport } from "@provenance/agents/ownership";
import type { TimelineReport } from "@provenance/agents/timeline";

type RepoWorkspaceProps = {
  repository: string;
  defaultTab?: "ownership" | "time";
  initialOwnership?: RepositoryOwnershipReport | null;
  initialTimeline?: TimelineReport | null;
};

function RepoMarquee() {
  return (
    <div className="marquee-strip" aria-hidden="true">
      <div className="marquee-track">
        <span>[FALKORDB CYPHER ACCELERATED]</span>
        <span>///</span>
        <span>100% DETERMINISTIC MEMORY GRAPH</span>
        <span>///</span>
        <span>ZERO FUTURE LEAKAGE</span>
        <span>///</span>
        <span>LORENZ BUS FACTOR ANALYSIS</span>
        <span>///</span>
        <span>HISTORICAL TIME-TRAVEL ENGINE</span>
        <span>///</span>
        <span>REAL-TIME BLAST RADIUS</span>
        <span>///</span>
        <span>[FALKORDB CYPHER ACCELERATED]</span>
        <span>///</span>
        <span>100% DETERMINISTIC MEMORY GRAPH</span>
        <span>///</span>
        <span>ZERO FUTURE LEAKAGE</span>
        <span>///</span>
        <span>LORENZ BUS FACTOR ANALYSIS</span>
        <span>///</span>
        <span>HISTORICAL TIME-TRAVEL ENGINE</span>
      </div>
    </div>
  );
}

export default function RepoWorkspace({
  repository,
  defaultTab = "ownership",
  initialOwnership = null,
  initialTimeline = null,
}: RepoWorkspaceProps) {
  const [tab, setTab] = useState<"ownership" | "time">(defaultTab);

  return (
    <main className="product-shell">
      <RepoRail repository={repository} tab={tab} onTabSelect={setTab} />
      <div className="product-main">
        <RepoTopbar repository={repository} tab={tab} />
        <RepoMarquee />
        <div className="page-content" style={{ maxWidth: 1200 }}>
          <RepoHeading repository={repository} />
          <nav
            className="tab-nav"
            aria-label="Repository navigation"
            style={{ marginBottom: 24 }}
          >
            <button
              type="button"
              className={`tab-btn ${tab === "ownership" ? "tab-active" : ""}`}
              onClick={() => setTab("ownership")}
            >
              Ownership & Bus Factor
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === "time" ? "tab-active" : ""}`}
              onClick={() => setTab("time")}
            >
              History Time Slider
            </button>
          </nav>
          {tab === "ownership" && (
            <BusFactorHeatmap
              repository={repository}
              initialReport={initialOwnership}
            />
          )}
          {tab === "time" && (
            <TimeSlider
              repository={repository}
              initialTimeline={initialTimeline}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function RepoRail({
  repository,
  tab,
  onTabSelect,
}: {
  repository: string;
  tab: "ownership" | "time";
  onTabSelect: (t: "ownership" | "time") => void;
}) {
  return (
    <aside className="side-rail">
      <Link className="brand brand-rail" href="/" aria-label="Provenance home">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>provenance</span>
      </Link>
      <div className="rail-label">WORKSPACE</div>
      <Link className="rail-link" href={`/repos/${repository}/pr/23333`}>
        <span className="rail-glyph">PR</span> PR review
      </Link>
      <Link className="rail-link" href={`/repos/${repository}/ask`}>
        <span className="rail-glyph">?</span> Ask the graph
      </Link>
      <button
        type="button"
        className={`rail-link ${tab === "ownership" ? "is-current" : ""}`}
        onClick={() => onTabSelect("ownership")}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span className="rail-glyph">BF</span> Bus factor
      </button>
      <button
        type="button"
        className={`rail-link ${tab === "time" ? "is-current" : ""}`}
        onClick={() => onTabSelect("time")}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span className="rail-glyph">T</span> Time slider
      </button>
      <div className="rail-bottom">
        <span className="pulse-dot" /> FalkorDB connected
      </div>
    </aside>
  );
}

function RepoTopbar({
  repository,
  tab,
}: {
  repository: string;
  tab: "ownership" | "time";
}) {
  return (
    <header className="product-topbar">
      <div className="breadcrumbs">
        <div className="window-dots" aria-hidden="true" style={{ marginRight: 6 }}>
          <span className="window-dot dot-red" />
          <span className="window-dot dot-yellow" />
          <span className="window-dot dot-green" />
        </div>
        <Link href="/repos">Repositories</Link>
        <span>/</span>
        <span>{repository}</span>
        <span>/</span>
        <b>
          {tab === "ownership"
            ? "Ownership & Bus Factor"
            : "History Time Slider"}
        </b>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          className="tactile-chip chip-lime"
          style={{ fontSize: 11, padding: "3px 10px" }}
        >
          <span className="pulse-dot" /> LIVE FALKORDB
        </span>
        <a
          className="topbar-source"
          href={`https://github.com/${repository}`}
          target="_blank"
          rel="noreferrer"
        >
          View repository
        </a>
      </div>
    </header>
  );
}

function RepoHeading({ repository }: { repository: string }) {
  return (
    <div className="page-heading">
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            <span className="eyebrow-dot" /> REPOSITORY INTELLIGENCE
          </p>
          <span className="tactile-chip chip-lime" style={{ fontSize: 11, padding: "3px 10px" }}>
            branch: main
          </span>
          <span className="tactile-chip chip-violet" style={{ fontSize: 11, padding: "3px 10px" }}>
            FalkorDB Graph Active
          </span>
        </div>
        <h1>{repository}</h1>
        <p className="page-subtitle">
          Explore architectural ownership concentration and temporal graph state over time with zero future leakage.
        </p>
      </div>
    </div>
  );
}
