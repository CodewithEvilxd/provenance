"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import type { GraphPath } from "./path-graph";

const PathGraph = dynamic(() => import("./path-graph"), {
  ssr: false,
  loading: () => <div className="graph-loading">Loading evidence graph…</div>,
});

type AskResponse = {
  answer: string;
  question: string;
  claims: { text: string; nodeIds: string[] }[];
  paths: GraphPath[];
  whoKnows: { login: string; score: number }[];
};

export default function AskWorkspace({
  repository,
  initialFunctionId,
}: {
  repository: string;
  initialFunctionId: string;
}) {
  const [functionId, setFunctionId] = useState(initialFunctionId);
  const [question, setQuestion] = useState(
    "What constraints should I keep in mind here?",
  );
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repository, functionId, question }),
      });
      const body = (await response.json()) as AskResponse | { error?: unknown };
      if (!response.ok) {
        const details = "error" in body ? body.error : "Ask request failed";
        throw new Error(
          typeof details === "string" ? details : "Ask request failed",
        );
      }
      setResult(body as AskResponse);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to query the graph",
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
        <Link className="rail-link" href={`/repos/${repository}/pr/23333`}>
          <span className="rail-glyph">PR</span> PR review
        </Link>
        <Link
          className="rail-link is-current"
          href={`/repos/${repository}/ask`}
        >
          <span className="rail-glyph">?</span> Ask the graph
        </Link>
        <Link className="rail-link" href={`/repos/${repository}`}>
          <span className="rail-glyph">BF</span> Bus factor
        </Link>
        <Link className="rail-link" href={`/repos/${repository}/time`}>
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
            <span>{repository}</span>
            <span>/</span>
            <b>Ask the Graph</b>
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
              href={`https://github.com/${repository}`}
              target="_blank"
              rel="noreferrer"
            >
              View repository
            </a>
          </div>
        </header>
        <div className="page-content ask-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-dot" /> GRAPH QUESTION
              </p>
              <h1>Ask the codebase.</h1>
              <p className="page-subtitle">
                Answers stay attached to decisions, source comments, and code
                paths.
              </p>
            </div>
          </div>
          <div className="ask-grid">
            <form className="ask-form" onSubmit={submit}>
              <label className="field-label" htmlFor="function-id">
                FUNCTION ID
              </label>
              <input
                id="function-id"
                value={functionId}
                onChange={(event) => setFunctionId(event.target.value)}
                required
              />
              <label className="field-label" htmlFor="question">
                YOUR QUESTION
              </label>
              <textarea
                id="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={2000}
                rows={5}
                required
              />
              <div className="form-footer">
                <span>Grounded in the local graph</span>
                <button
                  className="button button-lime"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? "Following evidence..." : "Ask Provenance"}
                </button>
              </div>
              {error ? (
                <div className="notice notice-error" role="alert">
                  {error}
                </div>
              ) : null}
            </form>
            <aside className="ask-note">
              <span className="section-index">HOW THIS WORKS</span>
              <p>
                Each answer is assembled from graph records. Follow a path to
                inspect the source comment and its links.
              </p>
              <div className="ask-note-rule" />
              <span className="section-index">REPOSITORY</span>
              <strong>{repository}</strong>
            </aside>
          </div>
          {result ? (
            <section className="answer-panel" aria-live="polite">
              <div className="section-heading">
                <div>
                  <span className="section-index">GRAPH RESPONSE</span>
                  <h2>{result.question}</h2>
                </div>
                <span className="evidence-pill">
                  {result.claims.length} claims
                </span>
              </div>
              <p className="answer-copy">{result.answer}</p>
              {result.claims.length ? (
                <div className="claim-list">
                  {result.claims.map((claim, index) => (
                    <article
                      className="claim-row"
                      key={`${claim.nodeIds[0]}-${index}`}
                    >
                      <span className="reason-index">0{index + 1}</span>
                      <p>{claim.text}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {result.whoKnows.length ? (
                <div className="people-strip">
                  <span className="section-index">PEOPLE WITH CONTEXT</span>
                  {result.whoKnows.slice(0, 5).map((person) => (
                    <span className="person-chip" key={person.login}>
                      {person.login} <small>{person.score.toFixed(1)}</small>
                    </span>
                  ))}
                </div>
              ) : null}
              <PathGraph
                className="ask-path-graph"
                paths={result.paths}
                repository={repository}
              />
            </section>
          ) : (
            <div className="ask-empty">
              <span className="empty-glyph">↳</span>
              <strong>Your answer will appear with its evidence path.</strong>
              <span>
                Try the suggested question or ask about a specific constraint.
              </span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
