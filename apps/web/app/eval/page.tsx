import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Link from "next/link";
import type {
  EvaluationOutcome,
  EvaluationReport,
} from "@provenance/agents/eval-types";
import { evaluationReportSchema } from "@provenance/agents/eval-types";

async function loadEvaluationReport(): Promise<EvaluationReport | null> {
  try {
    const c1 = resolve(
      process.cwd(),
      "tests/corpus-measurements/eval-report.json",
    );
    const c2 = resolve(
      process.cwd(),
      "../../tests/corpus-measurements/eval-report.json",
    );
    const reportPath = existsSync(c1) ? c1 : c2;
    const content = await readFile(reportPath, "utf8");
    const parsed = evaluationReportSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="eval-metric-card">
      <span className="eval-metric-label">{title}</span>
      <span className="eval-metric-value">{value}</span>
      <span className="eval-metric-sub">{subtitle}</span>
    </div>
  );
}

function ConfusionMatrix({ m }: { m: EvaluationReport["metrics"] }) {
  return (
    <div className="eval-matrix-box">
      <h3>Confusion Matrix</h3>
      <div className="eval-matrix-grid">
        <div className="eval-cell eval-tp">
          <b>TP: {m.tp}</b>
          <small>Risky correctly caught</small>
        </div>
        <div className="eval-cell eval-fp">
          <b>FP: {m.fp}</b>
          <small>False alarm</small>
        </div>
        <div className="eval-cell eval-fn">
          <b>FN: {m.fn}</b>
          <small>Risky missed</small>
        </div>
        <div className="eval-cell eval-tn">
          <b>TN: {m.tn}</b>
          <small>Normal confirmed clean</small>
        </div>
      </div>
    </div>
  );
}

function OutcomeRow({ row }: { row: EvaluationOutcome }) {
  return (
    <tr>
      <td>
        <a
          href={`https://github.com/${row.repo}/pull/${row.pr}`}
          target="_blank"
          rel="noreferrer"
          className="eval-pr-link"
        >
          #{row.pr}
        </a>
      </td>
      <td className="eval-title-col">{row.title}</td>
      <td className="eval-mono-col">{row.cutoff_time.split("T")[0]}</td>
      <td>
        <span
          className={`eval-pill ${row.is_risky ? "pill-risky" : "pill-normal"}`}
        >
          {row.ground_truth_risk}
        </span>
      </td>
      <td className="eval-mono-col">
        {row.predicted_score.toFixed(1)} ({row.predicted_band})
      </td>
      <td>
        <span className={`eval-pill pill-${row.classification.toLowerCase()}`}>
          {row.classification}
        </span>
      </td>
      <td className="eval-reasons-col">
        {row.reasons.length ? row.reasons[0] : "No risk signals"}
      </td>
    </tr>
  );
}

function OutcomesTable({
  outcomes,
}: {
  outcomes: EvaluationReport["outcomes"];
}) {
  return (
    <div className="eval-table-wrapper">
      <table className="eval-table">
        <thead>
          <tr>
            <th>PR</th>
            <th>Title</th>
            <th>Cutoff Date</th>
            <th>Ground Truth</th>
            <th>Score</th>
            <th>Result</th>
            <th>Key Reasons</th>
          </tr>
        </thead>
        <tbody>
          {outcomes.map((row) => (
            <OutcomeRow key={`${row.repo}-${row.pr}`} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvalHeader() {
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
        <Link href="/">Home</Link>
        <Link href="/repos/vitejs/vite/pr/23333">Review</Link>
        <Link href="/eval" className="active">
          Evaluation
        </Link>
      </nav>
      <span className="topbar-note">Historical Evaluation Harness</span>
    </header>
  );
}

function EvalMetaBar({ report }: { report: EvaluationReport }) {
  return (
    <div className="eval-meta-bar">
      <span>
        <b>Dataset:</b> {report.dataset_name}
      </span>
      <span>
        <b>Cutoff Policy:</b> {report.cutoff_policy}
      </span>
      <span>
        <b>Risk Threshold:</b> &ge; {report.risk_threshold}
      </span>
      <span>
        <b>Evaluated:</b> {report.metrics.totalEvaluated} PRs
      </span>
      <span>
        <b>Excluded:</b> {report.metrics.totalExcluded}
      </span>
    </div>
  );
}

function formatPct(val: number | null): string {
  return val !== null ? `${(val * 100).toFixed(1)}%` : "Undefined";
}

function EvalMetricsGrid({ m }: { m: EvaluationReport["metrics"] }) {
  return (
    <div className="eval-metrics-row">
      <MetricCard
        title="Precision"
        value={formatPct(m.precision)}
        subtitle={m.notes[0] ?? "TP / (TP + FP)"}
      />
      <MetricCard
        title="Recall"
        value={formatPct(m.recall)}
        subtitle="TP / (TP + FN)"
      />
      <MetricCard
        title="False Positive Rate"
        value={formatPct(m.falsePositiveRate)}
        subtitle="FP / (FP + TN)"
      />
      <MetricCard
        title="F1 Score"
        value={formatPct(m.f1Score)}
        subtitle="Harmonic mean of P & R"
      />
      <MetricCard
        title="Accuracy"
        value={formatPct(m.accuracy)}
        subtitle="(TP + TN) / Total"
      />
    </div>
  );
}

function EvalReportView({ report }: { report: EvaluationReport }) {
  return (
    <>
      <div className="eval-limitation-banner">
        <strong>Evaluation Note & Blocker:</strong> Phase 2 LLM decision
        extraction remains blocked by upstream quota limits. Risk predictions
        currently reflect call graph blast radius, caller depth, author
        familiarity, and historical incident graph paths.
      </div>
      <EvalMetaBar report={report} />
      <EvalMetricsGrid m={report.metrics} />
      <ConfusionMatrix m={report.metrics} />
      <div className="eval-outcomes-section">
        <h2>Evaluated Pull Requests ({report.outcomes.length})</h2>
        <OutcomesTable outcomes={report.outcomes} />
      </div>
    </>
  );
}

export default async function EvalPage() {
  const report = await loadEvaluationReport();

  return (
    <main className="landing-shell">
      <EvalHeader />

      <section className="eval-container">
        <div className="eval-header">
          <p className="eyebrow">
            <span className="eyebrow-dot" /> PHASE 7 HARNESS
          </p>
          <h1 className="font-marker" style={{ fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "0.02em" }}>
            Historical PR Risk Evaluation{" "}
            <span className="doodle-underline-lime" style={{ fontSize: "0.55em", verticalAlign: "middle", marginLeft: 8 }}>
              BENCHMARK
            </span>
          </h1>
          <p className="hero-lede font-comic" style={{ fontSize: 18, color: "#1a1a1f", lineHeight: 1.55 }}>
            Reproducible offline evaluation pipeline testing PR risk prediction
            against historical merge-time cutoffs with zero future data leakage.
          </p>
        </div>

        {report ? (
          <EvalReportView report={report} />
        ) : (
          <div className="eval-empty">
            <p>No evaluation report found. Run `pnpm eval` to generate it.</p>
          </div>
        )}
      </section>
    </main>
  );
}
