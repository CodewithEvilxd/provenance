import Image from "next/image";
import Link from "next/link";
import { GraphStatsBar } from "../components/graph-stats-bar";
import { ArchitectureFlow } from "../components/architecture-flow";
import { FeatureBreakdown } from "../components/feature-breakdown";
import { ComparisonMatrix } from "../components/comparison-matrix";
import { CaseStudyWalkthrough } from "../components/case-study-walkthrough";
import { NotchNavbar } from "../components/notch-navbar";
import { MascotStoryCard } from "../components/mascot-story-card";

const demo = "/repos/vitejs/vite/pr/23333";
const overview = "/repos/vitejs/vite";
const timeSlider = "/repos/vitejs/vite/time";
const askDemo = "/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig";

function LandingMarquee() {
  return (
    <div className="police-tape-container" aria-hidden="true">
      <div className="police-tape-barrier">
        <div className="police-tape-track">
          <span>/// CAUTION: CODEBASE MEMORY CRIME SCENE</span>
          <span>///</span>
          <span>DO NOT MERGE WITHOUT GRAPH EVIDENCE</span>
          <span>///</span>
          <span>[3-HOP BLAST RADIUS &lt;38ms]</span>
          <span>///</span>
          <span>ZERO FUTURE DATA LEAKAGE</span>
          <span>///</span>
          <span>100% DETERMINISTIC FALKORDB</span>
          <span>///</span>
          <span>LORENZ BUS FACTOR VERIFIED</span>
          <span>///</span>
          <span>ARCHITECTURAL RECOVERY BARRIER</span>
          <span>///</span>
          <span>/// CAUTION: CODEBASE MEMORY CRIME SCENE</span>
          <span>///</span>
          <span>DO NOT MERGE WITHOUT GRAPH EVIDENCE</span>
          <span>///</span>
          <span>[3-HOP BLAST RADIUS &lt;38ms]</span>
          <span>///</span>
          <span>ZERO FUTURE DATA LEAKAGE</span>
          <span>///</span>
          <span>100% DETERMINISTIC FALKORDB</span>
          <span>///</span>
          <span>LORENZ BUS FACTOR VERIFIED</span>
          <span>///</span>
          <span>ARCHITECTURAL RECOVERY BARRIER</span>
        </div>
      </div>
    </div>
  );
}



function HeroActions() {
  return (
    <div className="hero-actions-group">
      <div className="hero-actions-primary">
        <Link className="button button-lime hero-main-cta" href={demo}>
          Open Vite Review <span aria-hidden="true">-&gt;</span>
        </Link>
      </div>
      <div className="hero-actions-secondary">
        <Link className="button button-paper button-sm" href={overview}>
          Bus Factor &amp; Ownership
        </Link>
        <Link className="button button-dark button-sm" href={timeSlider}>
          Time Slider
        </Link>
        <Link className="button button-paper button-sm" href="/repos">
          All Repositories
        </Link>
      </div>
    </div>
  );
}

function HeroMeta() {
  return (
    <div className="hero-meta">
      <span className="tactile-chip chip-lime">
        <span className="pulse-dot" /> Real Graph Evidence
      </span>
      <span className="meta-divider" />
      <span>Vite · PR #23333</span>
      <span className="meta-divider" />
      <Link className="text-link" href={askDemo}>
        Ask the Graph Why
      </Link>
      <span className="meta-divider" />
      <Link className="text-link" href="/eval">
        View Eval Report
      </Link>
    </div>
  );
}

function HeroGrid() {
  return (
    <section className="hero-grid">
      <div className="hero-copy">
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            <span className="eyebrow-dot" /> CODEBASE MEMORY GRAPH
          </p>
          <span className="tactile-chip chip-lime tilt-right" style={{ fontSize: 10, padding: "2px 8px" }}>
            100% AUDIT READY
          </span>
          <span className="hand-tag" style={{ color: "var(--violet)" }}>
            [3-hop blast radius &lt;38ms]
          </span>
        </div>
        <h1>
          Every change has a history.{" "}
          <span className="hero-editorial-thread doodle-underline-lime">
            <em>See the thread.</em>
          </span>
        </h1>
        <p className="hero-lede font-comic" style={{ fontSize: "clamp(18px, 2vw, 21px)", color: "#222126", lineHeight: 1.55 }}>
          Gives coding agents like Claude, Cursor, ChatGPT, etc. a codebase memory supervisor that traces architectural decisions and incidents behind every pull request.
        </p>
        <HeroActions />
        <HeroMeta />
      </div>
      <HeroVisual />
    </section>
  );
}

function HeroVisualChrome() {
  return (
    <div className="window-chrome">
      <div className="window-dots" aria-hidden="true">
        <span className="window-dot dot-red" />
        <span className="window-dot dot-yellow" />
        <span className="window-dot dot-green" />
      </div>
      <span className="window-title">provenance · graph explorer</span>
      <span
        className="tactile-chip chip-lime"
        style={{ marginLeft: "auto", fontSize: 11, padding: "3px 10px" }}
      >
        <span className="pulse-dot" /> LIVE EVIDENCE
      </span>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="hero-visual" aria-label="Codebase memory architecture graph">
      <HeroVisualChrome />
      <div className="hero-visual-image-wrapper">
        <Image
          src="/mascots/hero-architecture-graph.jpg"
          alt="Provenance Codebase Memory Graph showing PR #23333, resolveConfig, and Incident #1821"
          width={1024}
          height={768}
          className="hero-full-image"
          priority
        />
      </div>
    </div>
  );
}

function LandingFooter() {
  return (
    <footer className="landing-rich-footer">
      <div className="footer-top">
        <div className="footer-brand-col">
          <Link className="brand" href="/" aria-label="Provenance home">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
            </span>
            <span>provenance</span>
          </Link>
          <p className="footer-tagline">
            Codebase memory graph powered by FalkorDB. Multi-hop blast radius,
            Lorenz bus factor, and zero future data leakage time travel.
          </p>
        </div>
        <div className="footer-links-col">
          <b>SURFACES</b>
          <Link href={demo}>PR #23333 Review</Link>
          <Link href={overview}>Bus Factor Analysis</Link>
          <Link href={timeSlider}>Historical Time Slider</Link>
          <Link href={askDemo}>Ask Graph Engine</Link>
        </div>
        <div className="footer-links-col">
          <b>VERIFICATION</b>
          <Link href="/eval">Evaluation Benchmark</Link>
          <Link href="/repos">Connected Repositories</Link>
          <a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">
            Vite Upstream
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>PROVENANCE · FALKORDB CODEBASE MEMORY</span>
        <span>Deterministic Graph BLAS · Vite Repository Benchmark 2026</span>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", overflowX: "hidden" }}>
      <NotchNavbar />
      <main className="landing-shell">
        <HeroGrid />
        <LandingMarquee />
        <MascotStoryCard />
        <GraphStatsBar />
        <ArchitectureFlow />
        <FeatureBreakdown />
        <ComparisonMatrix />
        <CaseStudyWalkthrough />
        <LandingFooter />
      </main>
    </div>
  );
}
