"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { ReviewResult } from "@provenance/agents/reviewer";

const PathGraph = dynamic(() => import("./path-graph"), {
  ssr: false,
  loading: () => <div className="graph-loading">Loading evidence graph…</div>,
});

type ReviewWorkspaceProps = {
  initial: ReviewResult | null;
  repo: string;
  pr: number;
};

const components = [
  { key: "blast", label: "Blast radius" },
  { key: "history", label: "Incident history" },
  { key: "decisions", label: "Decision conflict" },
  { key: "familiarity", label: "Author familiarity" },
  { key: "size", label: "Patch size" },
] as const;

export default function ReviewWorkspace({
  initial,
  repo,
  pr,
}: ReviewWorkspaceProps) {
  const [review, setReview] = useState<ReviewResult | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshReview() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo, pr }),
      });
      const body = (await response.json()) as ReviewResult | { error?: string };
      if (!response.ok)
        throw new Error("error" in body ? body.error : "Review request failed");
      setReview(body as ReviewResult);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to refresh this review",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="product-shell">
      <aside className="side-rail">
        <Link
          className="brand brand-rail"
          href="/"
          aria-label="Provenance home"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>provenance</span>
        </Link>
        <div className="rail-label">WORKSPACE</div>
        <Link className="rail-link is-current" href={`/repos/${repo}/pr/${pr}`}>
          <span className="rail-glyph">PR</span> PR review
        </Link>
        <Link
          className="rail-link"
          href={`/repos/${repo}/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig`}
        >
          <span className="rail-glyph">?</span> Ask the graph
        </Link>
        <Link className="rail-link" href={`/repos/${repo}`}>
          <span className="rail-glyph">BF</span> Bus factor
        </Link>
        <Link className="rail-link" href={`/repos/${repo}/time`}>
          <span className="rail-glyph">T</span> Time slider
        </Link>
        <div className="rail-bottom">
          <span className="pulse-dot" /> FalkorDB connected
        </div>
      </aside>

      <div className="product-main">
        <header className="product-topbar">
          <div className="breadcrumbs">
            <div className="window-dots" aria-hidden="true" style={{ marginRight: 6 }}>
              <span className="window-dot dot-red" />
              <span className="window-dot dot-yellow" />
              <span className="window-dot dot-green" />
            </div>
            <Link href="/">Repositories</Link>
            <span>/</span>
            <span>{repo}</span>
            <span>/</span>
            <b>PR #{pr}</b>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              className="tactile-chip chip-lime"
              style={{ fontSize: 10, padding: "2px 8px" }}
            >
              <span className="pulse-dot" /> LIVE FALKORDB
            </span>
            <a
              className="topbar-source"
              href={`https://github.com/${repo}/pull/${pr}`}
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-dot" /> PULL REQUEST REVIEW
              </p>
              <h1>Dev server integration</h1>
              <p className="page-subtitle">
                <span className="repo-badge">{repo}</span>
                <span className="pill">#{pr}</span>
                <span>
                  {review
                    ? `${review.changed_functions.length} changed functions · ${new Set(review.decisions.map(({ id }) => id)).size} active decisions`
                    : "Saved review unavailable"}
                </span>
              </p>
            </div>
            <button
              className="button button-dark refresh-button"
              disabled={loading}
              onClick={refreshReview}
              type="button"
            >
              {loading ? (
                <>
                  <span className="spinner" /> Updating review…
                </>
              ) : (
                <>
                  <span>↻</span> Refresh review
                </>
              )}
            </button>
          </div>
          {error ? (
            <div className="notice notice-error" role="alert">
              <strong>Review could not be refreshed.</strong>
              <span>{error}</span>
            </div>
          ) : null}
          {!review ? (
            <div className="notice">
              <strong>No saved review is available for this PR.</strong>
              <span>
                Refresh to run the review against the current graph and decision
                cache.
              </span>
            </div>
          ) : (
            <>
              <section className="risk-overview" aria-label="Risk overview">
                <div className="risk-score-block">
                  <span className="section-index">CHANGE RISK</span>
                  <div className={`risk-score risk-${review.risk.band}`}>
                    <strong>{Math.round(review.risk.score)}</strong>
                    <span>/ 100</span>
                  </div>
                  <span className={`risk-band risk-band-${review.risk.band}`}>
                    {review.risk.band} risk
                  </span>
                  <p>Weighted from five graph-backed signals</p>
                </div>
                <div className="risk-components">
                  {components.map(({ key, label }) => {
                    const value = review.risk.components[key];
                    return (
                      <div className="component-row" key={key}>
                        <span>{label}</span>
                        <span className="component-track">
                          <i
                            style={{
                              width: `${Math.max(0, Math.min(1, value)) * 100}%`,
                            }}
                          />
                        </span>
                        <b>{value.toFixed(1)}</b>
                      </div>
                    );
                  })}
                  <div className="formula-note">
                    Heuristic score · weights are documented in the review
                    method
                  </div>
                </div>
                <div className="evidence-summary">
                  <span className="section-index">EVIDENCE STATUS</span>
                  <strong
                    className={
                      review.evidence_status === "complete"
                        ? "evidence-complete"
                        : "evidence-incomplete"
                    }
                  >
                    {review.evidence_status === "complete"
                      ? "Complete"
                      : "Incomplete"}
                  </strong>
                  <p>
                    {review.missing_evidence.length
                      ? `Missing: ${review.missing_evidence.join(", ")}`
                      : "Decision and incident paths verified"}
                  </p>
                  <div className="summary-divider" />
                  <small>
                    {review.decisions.length} decision rows <span>·</span>{" "}
                    {review.incidents.length} incident rows
                  </small>
                </div>
              </section>

              <div className="review-columns">
                <section className="review-main-column">
                  <div className="section-heading">
                    <div>
                      <span className="section-index">
                        01 / WHY THIS CHANGE MATTERS
                      </span>
                      <h2>Signals from the codebase</h2>
                    </div>
                    <span className="muted-count">
                      {review.reasons.length} signals
                    </span>
                  </div>
                  <ul className="reason-list">
                    {review.reasons.map((reason, index) => (
                      <li key={`${index}-${reason}`}>
                        <span className="reason-index">0{index + 1}</span>
                        <p>{reason}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="section-heading decision-heading">
                    <div>
                      <span className="section-index">
                        02 / ACTIVE CONSTRAINTS
                      </span>
                      <h2>Decisions at stake</h2>
                    </div>
                    <span className="muted-count">
                      {review.decisions.length} rows
                    </span>
                  </div>
                  <div className="decision-list">
                    {review.decisions.map((decision, index) => (
                      <article
                        className="decision-row"
                        key={`${decision.id}-${decision.target}-${index}`}
                      >
                        <span
                          className={`strength-mark strength-${decision.strength.toLowerCase()}`}
                          title={`${decision.strength} decision`}
                        />
                        <div className="decision-copy">
                          <div className="decision-title-row">
                            <strong>{decision.summary}</strong>
                            <span
                              className={`strength-tag strength-tag-${decision.strength.toLowerCase()}`}
                            >
                              {decision.strength}
                            </span>
                          </div>
                          <p>{decision.reason}</p>
                          <div className="decision-foot">
                            <code>{decision.target}</code>
                            <span>
                              {decision.available
                                ? decision.violated
                                  ? "Possible violation"
                                  : "No violation found"
                                : `Check unavailable${decision.evidence ? ` · ${decision.evidence}` : ""}`}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <PathGraph
                    className="review-path-graph"
                    paths={review.paths}
                    repository={repo}
                    pullNumber={pr}
                  />
                </section>

                <aside className="review-aside">
                  <section className="aside-section">
                    <span className="section-index">CHANGE SURFACE</span>
                    <strong className="aside-metric">
                      {review.changed_functions.length}
                    </strong>
                    <p>Functions touched in this pull request</p>
                    <div className="function-list">
                      {review.changed_functions.slice(0, 7).map((id) => (
                        <code key={id}>{id.replace(/^fn:/, "")}</code>
                      ))}
                      {review.changed_functions.length > 7 ? (
                        <small>
                          + {review.changed_functions.length - 7} more functions
                        </small>
                      ) : null}
                    </div>
                  </section>
                  <section className="aside-section incident-aside">
                    <span className="section-index">RELATED INCIDENTS</span>
                    <strong className="aside-metric">
                      {review.incidents.length}
                    </strong>
                    <p>Historical evidence connected to this change</p>
                    {review.incidents.slice(0, 3).map((item) => (
                      <a
                        className="incident-link"
                        href={`https://github.com/${repo}/pull/${item.pr ?? pr}`}
                        key={`${item.incident}-${item.fn}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="incident-kicker">
                          {item.kind} · #{item.pr ?? "—"}
                        </span>
                        <b>{item.title}</b>
                        <small>Function {item.fn.replace(/^fn:/, "")}</small>
                      </a>
                    ))}
                  </section>
                  <section className="aside-section reviewer-aside">
                    <span className="section-index">SUGGESTED REVIEWERS</span>
                    {review.reviewers.length ? (
                      review.reviewers.slice(0, 4).map((person) => (
                        <div className="reviewer-row" key={person.login}>
                          <span className="reviewer-avatar">
                            {person.login.slice(0, 1).toUpperCase()}
                          </span>
                          <span>
                            <b>{person.login}</b>
                            <small>Graph familiarity</small>
                          </span>
                          <strong>{person.score.toFixed(1)}</strong>
                        </div>
                      ))
                    ) : (
                      <p>No reviewer familiarity signal was found.</p>
                    )}
                  </section>
                  <div className="aside-pippo">
                    <span className="visual-pippo" aria-hidden="true">
                      <i />
                      <i />
                    </span>
                    <p>Every signal points back to a source.</p>
                  </div>
                </aside>
              </div>
            </>
          )}
          <footer className="product-footer">
            <span>PROVENANCE · REVIEW BUILT FROM GRAPH EVIDENCE</span>
            <Link
              href={`/repos/${repo}/ask?functionId=${encodeURIComponent(review?.changed_functions[0] ?? "fn:packages/vite/src/node/config.ts#resolveConfig")}`}
            >
              Ask about this area →
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
