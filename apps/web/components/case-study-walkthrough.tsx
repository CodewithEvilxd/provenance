import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconGraph,
} from "./icons";

function CaseStudyHeader() {
  return (
    <div className="section-head">
      <div className="section-head-top">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> LIVE VERIFIED CASE STUDY
        </span>
        <span className="tactile-chip chip-lime">VITE REPOSITORY · PR #23333</span>
      </div>
      <h2>
        How Provenance Saved Vite from an <span className="doodle-underline-blue">SSR Architecture Regression</span>
      </h2>
      <p className="section-lede font-hand" style={{ fontSize: 19, color: "#363531", lineHeight: 1.45 }}>
        A real-world walkthrough illustrating how deterministic graph memory prevents
        costly architectural breakage that human reviewers easily miss.
      </p>
    </div>
  );
}

function CaseStudyLeft() {
  return (
    <div className="case-col-left">
      <span className="case-stage-badge">THE INCIDENT PREVIEW</span>
      <h3>PR #23333: Refactor resolveConfig Plugin Execution</h3>
      <p>
        A contributor submitted a pull request reordering plugin initialization in
        <code>packages/vite/src/node/config.ts</code> to optimize startup speed.
        Standard CI tests passed, and line-by-line diffs looked completely harmless.
      </p>

      <div className="case-trap-box">
        <div className="trap-icon">
          <IconAlertTriangle size={18} />
        </div>
        <div>
          <b>The Hidden Architectural Invariant:</b>
          <p>
            14 months earlier, an SSR module graph failure led to a core decision:
            <em> Plugin ordering must strictly preserve pre/post slots to avoid hydration race conditions</em>.
          </p>
        </div>
      </div>

      <div className="case-actions">
        <Link className="button button-lime" href="/repos/vitejs/vite/pr/23333">
          Open PR #23333 in Reviewer <IconArrowRight size={15} />
        </Link>
        <Link
          className="button button-paper"
          href="/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig"
        >
          Query Cypher Memory <IconGraph size={15} />
        </Link>
      </div>
    </div>
  );
}

function CaseStudyRight() {
  return (
    <div className="case-col-right">
      <div className="window-chrome">
        <div className="window-dots" aria-hidden="true">
          <span className="window-dot dot-red" />
          <span className="window-dot dot-yellow" />
          <span className="window-dot dot-green" />
        </div>
        <span className="window-title">GRAPH EVIDENCE RECORD #23333</span>
        <span className="tactile-chip chip-pink" style={{ marginLeft: "auto", fontSize: 9, padding: "2px 7px" }}>
          BLAST RADIUS: HIGH RISK
        </span>
      </div>

      <div className="case-evidence-body">
        <div className="evidence-timeline-item">
          <span className="ev-num">01</span>
          <div>
            <b>AST Function Modified</b>
            <p><code>resolveConfig()</code> in <code>config.ts</code></p>
          </div>
        </div>

        <div className="evidence-timeline-item">
          <span className="ev-num">02</span>
          <div>
            <b>2-Hop Call Graph Traversal</b>
            <p>Traversed to <code>sortUserPlugins()</code> and <code>createPluginContainer()</code></p>
          </div>
        </div>

        <div className="evidence-timeline-item ev-highlight">
          <span className="ev-num">03</span>
          <div>
            <b>Conflicting Decision Flagged</b>
            <p>
              <strong>Decision D-1821:</strong> <em>Preserve pre-plugin registration sequence for SSR</em>
            </p>
          </div>
        </div>

        <div className="evidence-timeline-item">
          <span className="ev-num">04</span>
          <div>
            <b>Deterministic Outcome</b>
            <p>Reviewer notified in 36ms. Zero speculation, 100% graph grounded.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CaseStudyWalkthrough() {
  return (
    <section className="case-study-section" aria-label="Real-world case study">
      <CaseStudyHeader />
      <div className="case-study-card">
        <div className="case-study-split">
          <CaseStudyLeft />
          <CaseStudyRight />
        </div>
      </div>
    </section>
  );
}
