import Link from "next/link";

const demo = "/repos/vitejs/vite/pr/23333";
const overview = "/repos/vitejs/vite";
const timeSlider = "/repos/vitejs/vite/time";

export default function Home() {
  return (
    <main className="landing-shell">
      <LandingHeader />
      <HeroGrid />
      <CapabilitiesSection />
    </main>
  );
}

function LandingHeader() {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Provenance home">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>provenance</span>
      </Link>
      <nav className="topnav" aria-label="Main navigation">
        <Link href={demo}>Review</Link>
        <Link href={overview}>Bus Factor</Link>
        <Link href={timeSlider}>Time Slider</Link>
        <Link href="/repos">Repositories</Link>
      </nav>
      <span className="topbar-note">A memory for codebases</span>
    </header>
  );
}

function HeroGrid() {
  return (
    <section className="hero-grid">
      <div className="hero-copy">
        <p className="eyebrow">
          <span className="eyebrow-dot" /> CODE, WITH CONTEXT
        </p>
        <h1>
          Every change has a history. <em>See the thread.</em>
        </h1>
        <p className="hero-lede">
          Trace the decisions, people and past incidents behind a pull request.
          Keep the evidence close to the code.
        </p>
        <div className="hero-actions">
          <Link className="button button-dark" href={demo}>
            Open the Vite review <span aria-hidden="true">→</span>
          </Link>
          <Link
            className="button"
            style={{ background: "#eae6dc", color: "var(--ink)" }}
            href={overview}
          >
            Bus Factor & Ownership
          </Link>
          <Link
            className="text-link"
            href="/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig"
          >
            Ask about a function
          </Link>
        </div>
        <div className="hero-meta">
          <span className="status-mark" /> Real graph evidence
          <span className="meta-divider" />
          <span>Vite · pull request #23333</span>
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="hero-visual" aria-label="A decision path preview">
      <div className="visual-caption">
        <span>PROVENANCE PATH</span>
        <span>01 / 03</span>
      </div>
      <div className="path-preview">
        <div className="preview-node preview-pr">
          <span className="node-glyph">PR</span>
          <span>
            <b>Dev server integration</b>
            <small>vitejs / vite · #23333</small>
          </span>
          <span className="node-state">reviewed</span>
        </div>
        <div className="preview-link">
          <span />
        </div>
        <div className="preview-node preview-function">
          <span className="node-glyph glyph-function">ƒ</span>
          <span>
            <b>resolveConfig</b>
            <small>packages/vite/src/node/config.ts</small>
          </span>
        </div>
        <div className="preview-link">
          <span />
        </div>
        <div className="preview-node preview-decision">
          <span className="node-glyph glyph-decision">D</span>
          <span>
            <b>Preserve plugin ordering</b>
            <small>Hard decision · source-backed</small>
          </span>
        </div>
        <div className="preview-link">
          <span />
        </div>
        <div className="preview-node preview-comment">
          <span className="node-glyph glyph-comment">“</span>
          <span>
            <b>Review comment</b>
            <small>Original discussion attached</small>
          </span>
        </div>
      </div>
      <div className="visual-foot">
        <span className="visual-pippo" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>Evidence first. Opinions second.</span>
        <span className="visual-foot-line" />
      </div>
    </div>
  );
}

function CapabilitiesSection() {
  return (
    <section className="home-lower" aria-label="Product capabilities">
      <div className="lower-intro">
        <span>01 — WHAT YOU CAN TRACE</span>
        <p>Knowledge that stays connected to the code it explains.</p>
      </div>
      <Link className="feature-link" href={demo}>
        <span className="feature-number">01</span>
        <span>
          <b>Review a change</b>
          <small>Risk, blast radius and active decisions</small>
        </span>
        <span className="feature-arrow">Open</span>
      </Link>
      <Link
        className="feature-link"
        href="/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig"
      >
        <span className="feature-number">02</span>
        <span>
          <b>Ask why</b>
          <small>Get an answer with a path to its sources</small>
        </span>
        <span className="feature-arrow">Open</span>
      </Link>
      <Link className="feature-link" href={overview}>
        <span className="feature-number">03</span>
        <span>
          <b>Ownership & Bus Factor</b>
          <small>
            Module ownership concentration and maintainer redundancy
          </small>
        </span>
        <span className="feature-arrow">Open</span>
      </Link>
      <Link className="feature-link" href={timeSlider}>
        <span className="feature-number">04</span>
        <span>
          <b>History Time Slider</b>
          <small>Explore temporal graph state with zero future leakage</small>
        </span>
        <span className="feature-arrow">Open</span>
      </Link>
      <div className="home-footer">
        <span>BUILT FROM SOURCE, REVIEWS AND HISTORY</span>
        <span>Vite graph · 2026</span>
      </div>
    </section>
  );
}
