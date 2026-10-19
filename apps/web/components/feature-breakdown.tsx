import Image from "next/image";
import Link from "next/link";
import {
  IconGitPr,
  IconClock,
  IconUsers,
  IconCpu,
  IconArrowRight,
  IconCheck,
} from "./icons";

type FeatureItem = {
  num: string;
  title: string;
  tag: string;
  tagColor: string;
  icon: (props: { size?: number }) => React.JSX.Element;
  desc: string;
  bullets: string[];
  linkHref: string;
  linkLabel: string;
  statLabel: string;
  statValue: string;
  imageSrc?: string;
  imageAlt?: string;
  codeSnippet?: string;
  codeLabel?: string;
};

const FEATURES: FeatureItem[] = [
  {
    num: "01",
    title: "Multi-Hop Blast Radius & Decision Conflicts",
    tag: "CYPHER TRAVERSAL",
    tagColor: "chip-pink",
    icon: IconGitPr,
    desc:
      "When a PR touches a function, naive tools only inspect the diff. Provenance traverses up to 3 call hops in FalkorDB to discover every dependent function, attached architectural decision, and past incident.",
    codeSnippet: "MATCH (fn)-[:CALLS*1..3]->(dep)\nRETURN dep, decision LIMIT 10;",
    codeLabel: "GRAPHBLAS CYPHER",
    bullets: [
      "Finds hidden regressions before code reaches staging or production",
      "Flags broken architectural invariants with direct commit/PR citations",
      "Calculates quantitative risk score (0 to 100) and risk category band",
    ],
    linkHref: "/repos/vitejs/vite/pr/23333",
    linkLabel: "Inspect PR #23333 Review",
    statLabel: "AVERAGE TRAVERSAL",
    statValue: "<38ms",
  },
  {
    num: "02",
    title: "Zero Future Data Leakage Time Scrubber",
    tag: "TEMPORAL ISOLATION",
    tagColor: "chip-lime",
    icon: IconClock,
    desc:
      "Auditing a historical incident requires reproducing the exact repository state as of that date. Provenance applies a strict cutoff parameter to every Cypher query, guaranteeing zero future data leaks.",
    imageSrc: "/mascots/mascot-time-travel.jpg",
    imageAlt: "Zero future data leakage mascot illustration",
    bullets: [
      "Scrub backward and forward along the commit timeline seamlessly",
      "Evaluates AI suggestions against historical ground-truth conditions",
      "100% deterministic: identical queries return identical results",
    ],
    linkHref: "/repos/vitejs/vite/time",
    linkLabel: "Launch Time Machine",
    statLabel: "LEAKAGE GUARANTEE",
    statValue: "0.0% (STRICT)",
  },
  {
    num: "03",
    title: "Lorenz Bus Factor & Contributor Gini",
    tag: "RISK MATHEMATICS",
    tagColor: "chip-violet",
    icon: IconUsers,
    desc:
      "Standard git blame counts raw lines of code, misleading maintainers. Provenance computes Gini concentration indices across functional ownership, exposing true single points of failure.",
    imageSrc: "/mascots/mascot-bus-factor.jpg",
    imageAlt: "Knowledge is shared distributed ownership mascot illustration",
    bullets: [
      "Lorenz curve visualization of module commit distributions",
      "Calculates exact minimum contributors needed to retain 80% coverage",
      "Flags abandoned modules with active production dependencies",
    ],
    linkHref: "/repos/vitejs/vite",
    linkLabel: "View Contributor Concentration",
    statLabel: "RISK ACCURACY",
    statValue: "100% AUDITABLE",
  },
  {
    num: "04",
    title: "Model Context Protocol (MCP) Server",
    tag: "IDE INTEGRATION",
    tagColor: "chip-amber",
    icon: IconCpu,
    desc:
      "Provenance exposes its entire knowledge graph through the Model Context Protocol. Cursor, Claude Code, and Windsurf query FalkorDB in real time while you write code.",
    codeSnippet: 'mcp.callTool("trace_decision", {\n  fn: "resolveConfig"\n});',
    codeLabel: "JSON-RPC MCP v1.0",
    bullets: [
      "Standard JSON-RPC tools: trace_decision, blast_radius, ask_memory",
      "Eliminates prompt bloat by injecting precise graph subpaths",
      "Zero speculation: agents cite immutable FalkorDB entity IDs",
    ],
    linkHref: "/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig",
    linkLabel: "Ask Memory Graph",
    statLabel: "PROTOCOL READY",
    statValue: "MCP v1.0",
  },
];

function FeatureCardVisual({ feature }: { feature: FeatureItem }) {
  if (feature.imageSrc) {
    return (
      <div className="feature-mascot-box compact-mascot-frame">
        <Image
          src={feature.imageSrc}
          alt={feature.imageAlt || feature.title}
          width={280}
          height={140}
          className="feature-mascot-img-compact"
        />
      </div>
    );
  }
  if (feature.codeSnippet) {
    return (
      <div className="feature-code-box">
        <div className="feature-code-label">
          <span className="pulse-dot" /> {feature.codeLabel}
        </div>
        <pre className="feature-code-pre">
          <code>{feature.codeSnippet}</code>
        </pre>
      </div>
    );
  }
  return null;
}

function FeatureCard({ feature }: { feature: FeatureItem }) {
  const Icon = feature.icon;
  return (
    <article className="deep-feature-card">
      <div className="deep-feature-top">
        <div className="deep-feature-header-left">
          <span className="feature-counter">{feature.num}</span>
          <span className={`tactile-chip ${feature.tagColor}`} style={{ fontSize: 9, padding: "2px 7px" }}>
            {feature.tag}
          </span>
        </div>
        <div className="deep-stat-badge">
          <small>{feature.statLabel}</small>
          <b>{feature.statValue}</b>
        </div>
      </div>

      <div className="deep-feature-headline">
        <div className="deep-feature-icon">
          <Icon size={22} />
        </div>
        <h3>{feature.title}</h3>
      </div>

      <FeatureCardVisual feature={feature} />

      <p className="deep-feature-desc">{feature.desc}</p>

      <ul className="deep-feature-bullets">
        {feature.bullets.map((bullet) => (
          <li key={bullet}>
            <span className="bullet-check" aria-hidden="true">
              <IconCheck size={13} />
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="deep-feature-foot">
        <Link className="button button-lime" href={feature.linkHref}>
          {feature.linkLabel} <IconArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}

export function FeatureBreakdown() {
  return (
    <section className="feature-breakdown-section" aria-label="Core technological pillars">
      <div className="section-head">
        <div className="section-head-top">
          <span className="eyebrow">
            <span className="eyebrow-dot" /> CORE CAPABILITIES
          </span>
          <span className="tactile-chip chip-lime">PRODUCTION GRADE</span>
        </div>
        <h2>
          Engineered for <span className="doodle-underline-blue">Deep Codebase Comprehension</span>
        </h2>
        <p className="section-lede font-hand" style={{ fontSize: 19, color: "#363531", lineHeight: 1.45 }}>
          Four interconnected pillars that bridge the gap between static source code
          and human engineering intent.
        </p>
      </div>

      <div className="feature-cards-grid">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.num} feature={feature} />
        ))}
      </div>
    </section>
  );
}
