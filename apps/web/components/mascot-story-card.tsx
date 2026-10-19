import Image from "next/image";
import Link from "next/link";
import { IconAlertTriangle, IconArrowRight, IconGitPr, IconGraph, IconSparkles } from "./icons";

const demo = "/repos/vitejs/vite/pr/23333";
const askDemo =
  "/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig";

function StoryCardHeader() {
  return (
    <div className="section-head">
      <div className="section-head-top">
        <span className="eyebrow">
          <span className="eyebrow-dot" /> THE ARCHITECTURAL SUPERVISOR
        </span>
        <span className="tactile-chip chip-lime tilt-right">AGENT & HUMAN INTENT</span>
      </div>
      <h2 className="font-marker" style={{ fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "0.02em" }}>
        CODEBASE MEMORY <span className="doodle-underline-blue">SUPERVISOR</span>
      </h2>
      <p className="section-lede font-comic" style={{ fontSize: "clamp(18px, 2.2vw, 22px)", color: "#1a1a1f", lineHeight: 1.55, maxWidth: 780, margin: "14px auto 0" }}>
        Gives coding agents like Claude, ChatGPT, Cursor, etc. a supervisor that can make decisions when they&apos;re stuck, off-track, need testing, or are actually breaking past incidents.
      </p>
    </div>
  );
}

function StoryCardVisual() {
  return (
    <div className="story-mascot-frame tilt-box-left">
      <div className="story-mascot-tape" aria-hidden="true">
        <span>EXHIBIT #1821 · SSR REGRESSION INCIDENT</span>
      </div>
      <div className="story-image-wrap compact-mascot">
        <Image
          src="/mascots/mascot-review.jpg"
          alt="Illustration showing developer wondering about code changes and senior engineer explaining decision graph"
          width={380}
          height={250}
          className="mascot-doodle-img"
          priority
        />
      </div>
      <div className="story-mascot-caption">
        <div className="caption-dialogue dialogue-junior">
          <span className="dialogue-role role-junior">CODING AGENT</span>
          <p className="font-comic" style={{ fontSize: 16, margin: 0 }}>
            &ldquo;CI tests pass, diff looks clean... but why was this config ordering introduced?&rdquo;
          </p>
        </div>
        <div className="caption-dialogue dialogue-senior">
          <span className="dialogue-role role-senior">PROVENANCE MEMORY</span>
          <p className="font-comic" style={{ fontSize: 16, margin: 0 }}>
            &ldquo;14 months ago in PR #1821, reordering broke SSR hydration. Decision D-1821 attached!&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}

function StoryCardPoints() {
  return (
    <div className="story-comparison-col">
      <div className="story-point-card point-traditional">
        <div className="point-head">
          <span className="point-badge badge-red">WITHOUT MEMORY GRAPH</span>
          <h4>The Invisible Architectural Landmine</h4>
        </div>
        <p>
          Developers refactor code without knowing why a constraint was introduced.
          Senior maintainers spend hours in review repeating past discussions or
          discover regressions after deploy.
        </p>
        <div className="hand-tag" style={{ color: "#b91c1c", marginTop: 8 }}>
          <IconAlertTriangle size={13} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 5 }} />
          &ldquo;We discussed this in PR #1821... why break it again?&rdquo;
        </div>
      </div>

      <div className="story-point-card point-provenance">
        <div className="point-head">
          <span className="point-badge badge-green">WITH PROVENANCE + FALKORDB</span>
          <h4>Deterministic Multi-Hop Evidence</h4>
        </div>
        <p>
          Every commit, PR review, ADR, and incident is preserved in FalkorDB.
          Multi-hop blast radius traces 1 to 3 call hops and cites exact historical
          decisions in under 40ms.
        </p>
        <div className="hand-tag" style={{ color: "#15803d", marginTop: 8 }}>
          <IconSparkles size={13} style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 5 }} />
          &ldquo;38ms Cypher traversal. Cites PR #1821 with zero guesswork.&rdquo;
        </div>
      </div>

      <div className="story-actions">
        <Link className="button button-lime" href={demo}>
          <IconGitPr size={15} /> Try PR #23333 Review <IconArrowRight size={14} />
        </Link>
        <Link className="button button-paper" href={askDemo}>
          <IconGraph size={15} /> Ask Graph Memory
        </Link>
      </div>
    </div>
  );
}

export function MascotStoryCard() {
  return (
    <section className="mascot-story-section" aria-label="Why Provenance matters">
      <StoryCardHeader />
      <div className="story-card-wrapper">
        <div className="story-card-grid">
          <StoryCardVisual />
          <StoryCardPoints />
        </div>
      </div>
    </section>
  );
}
