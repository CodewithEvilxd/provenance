"use client";

import type { RepositoryOwnershipReport } from "@provenance/agents/ownership";

export function BusFactorStats({
  report,
}: {
  report: RepositoryOwnershipReport;
}) {
  const windowDate = new Date(report.analyzedSince).toLocaleDateString();
  return (
    <div className="stats-strip" style={{ marginBottom: 20 }}>
      <div className="stat-tile">
        <span className="stat-label">AVERAGE BUS FACTOR</span>
        <span className="stat-value">{report.overallBusFactor}</span>
        <span className="stat-sub">Minimum maintainers for 50%</span>
      </div>
      <div className="stat-tile">
        <span className="stat-label">HIGH RISK MODULES</span>
        <span className="stat-value" style={{ color: "var(--rust)" }}>
          {report.highRiskModulesCount} / {report.totalModules}
        </span>
        <span className="stat-sub">Single maintainer concentration</span>
      </div>
      <div className="stat-tile">
        <span className="stat-label">COMMITS ANALYZED</span>
        <span className="stat-value">{report.totalCommits}</span>
        <span className="stat-sub">Distinct commit modifications</span>
      </div>
      <div className="stat-tile">
        <span className="stat-label">COMMIT WINDOW</span>
        <span className="stat-value" style={{ fontSize: 18 }}>
          Since {windowDate}
        </span>
        <span className="stat-sub">Default branch coverage</span>
      </div>
    </div>
  );
}

export function MethodologyDisclosure({
  report,
}: {
  report: RepositoryOwnershipReport;
}) {
  const windowDate = new Date(report.analyzedSince).toLocaleDateString();
  return (
    <div className="methodology-box" style={{ marginTop: 28 }}>
      <span className="eyebrow">
        <span className="eyebrow-dot" /> METHODOLOGY & DISCLOSURES
      </span>
      <h4 style={{ margin: "8px 0 6px", font: "600 14px var(--sans)" }}>
        Calculation Standard & Ownership Concentration
      </h4>
      <p style={{ margin: "0 0 6px" }}>{report.methodology}</p>
      <p style={{ margin: "0 0 6px" }}>
        <strong>Data Coverage:</strong> Real default-branch commit modifications
        for {report.repository} evaluated across {report.totalModules} modules
        and {report.totalCommits} distinct commit events since {windowDate}.
        Automated bot accounts are filtered to avoid skewing human maintainer
        concentration.
      </p>
      <p style={{ margin: 0, color: "var(--muted)" }}>
        <strong>Notice:</strong> Bus factor is an empirical estimate of
        historical commit ownership concentration, not proof of maintainer
        availability, responsiveness, or current institutional knowledge.
      </p>
    </div>
  );
}
