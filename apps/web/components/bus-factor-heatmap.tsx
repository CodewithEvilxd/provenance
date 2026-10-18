"use client";

import { useEffect, useState, useMemo } from "react";
import type {
  RepositoryOwnershipReport,
  ModuleOwnership,
} from "@provenance/agents/ownership";
import { ModuleCard } from "./bus-factor-card";

type BusFactorProps = {
  repository: string;
  initialReport?: RepositoryOwnershipReport | null;
};

function useOwnershipData(
  repository: string,
  initial: RepositoryOwnershipReport | null,
) {
  const [report, setReport] = useState<RepositoryOwnershipReport | null>(
    initial,
  );
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repository }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || `HTTP error ${res.status}`);
      }
      const data = (await res.json()) as RepositoryOwnershipReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ownership");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initial) void reload();
  }, [repository, initial]);

  return { report, loading, error, reload };
}

function useFilteredModules(
  modules: ModuleOwnership[] | undefined,
  search: string,
  riskFilter: "all" | "high" | "medium" | "low",
  sortBy: "commits" | "busFactor" | "risk",
) {
  return useMemo(() => {
    if (!modules) return [];
    return modules
      .filter((m) => {
        if (riskFilter !== "all" && m.riskLevel !== riskFilter) return false;
        if (search && !m.module.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "commits") return b.totalCommits - a.totalCommits;
        if (sortBy === "busFactor") return a.busFactor - b.busFactor;
        const riskRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (riskRank[b.riskLevel] ?? 0) - (riskRank[a.riskLevel] ?? 0);
      });
  }, [modules, search, riskFilter, sortBy]);
}

export default function BusFactorHeatmap({
  repository,
  initialReport = null,
}: BusFactorProps) {
  const { report, loading, error, reload } = useOwnershipData(
    repository,
    initialReport,
  );
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [sortBy, setSortBy] = useState<"commits" | "busFactor" | "risk">(
    "commits",
  );
  const filteredModules = useFilteredModules(
    report?.modules,
    search,
    riskFilter,
    sortBy,
  );

  if (loading) return <BusFactorSkeleton />;
  if (error) {
    return (
      <div className="time-error" role="alert">
        <strong>Error loading contributor ownership</strong>
        <p>{error}</p>
        <button
          type="button"
          className="retry-btn"
          onClick={() => void reload()}
        >
          Retry
        </button>
      </div>
    );
  }
  if (!report || report.modules.length === 0) {
    return (
      <div className="time-empty">
        <p>No commit history or ownership data available for {repository}.</p>
      </div>
    );
  }

  return (
    <div className="bus-factor-container">
      <BusFactorControls
        search={search}
        onSearchChange={setSearch}
        riskFilter={riskFilter}
        onRiskFilterChange={setRiskFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
      />
      <div className="modules-grid">
        {filteredModules.map((item) => (
          <ModuleCard key={item.module} item={item} />
        ))}
      </div>
      {filteredModules.length === 0 && (
        <div className="time-empty">
          <p>No modules match the filter query “{search}”.</p>
        </div>
      )}
      <BusFactorMethodology text={report.methodology} />
    </div>
  );
}

function BusFactorSkeleton() {
  return (
    <div className="bus-factor-container" aria-busy="true">
      <div
        className="skeleton-pulse"
        style={{ height: 42, marginBottom: 20 }}
      />
      <div className="modules-grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="skeleton-pulse"
            style={{ height: 160, borderRadius: 6 }}
          />
        ))}
      </div>
    </div>
  );
}

function BusFactorControls({
  search,
  onSearchChange,
  riskFilter,
  onRiskFilterChange,
  sortBy,
  onSortByChange,
}: {
  search: string;
  onSearchChange: (s: string) => void;
  riskFilter: "all" | "high" | "medium" | "low";
  onRiskFilterChange: (r: "all" | "high" | "medium" | "low") => void;
  sortBy: "commits" | "busFactor" | "risk";
  onSortByChange: (s: "commits" | "busFactor" | "risk") => void;
}) {
  return (
    <div className="timeline-controls" style={{ marginBottom: 20 }}>
      <input
        type="search"
        aria-label="Filter modules"
        placeholder="Filter modules by path…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
        style={{
          padding: "8px 12px",
          border: "1px solid var(--line)",
          borderRadius: 4,
          font: "400 13px var(--mono)",
          background: "#fff",
          flex: 1,
        }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span className="field-label" style={{ margin: 0 }}>
          RISK:
        </span>
        {(["all", "high", "medium", "low"] as const).map((lvl) => (
          <button
            key={lvl}
            type="button"
            className={`milestone-btn ${riskFilter === lvl ? "milestone-selected" : ""}`}
            onClick={() => onRiskFilterChange(lvl)}
          >
            {lvl.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span className="field-label" style={{ margin: 0 }}>
          SORT:
        </span>
        <select
          value={sortBy}
          onChange={(e) =>
            onSortByChange(e.target.value as "commits" | "busFactor" | "risk")
          }
          aria-label="Sort modules by"
          style={{
            padding: "6px 10px",
            border: "1px solid var(--line)",
            borderRadius: 4,
            font: "500 12px var(--mono)",
            background: "#fff",
          }}
        >
          <option value="commits">Most commits</option>
          <option value="busFactor">Lowest Bus Factor</option>
          <option value="risk">Highest Risk</option>
        </select>
      </div>
    </div>
  );
}

function BusFactorMethodology({ text }: { text: string }) {
  return (
    <div
      className="card"
      style={{ marginTop: 32, padding: "18px 24px", background: "#f8f7f2" }}
    >
      <span className="eyebrow">
        <span className="eyebrow-dot" /> METHODOLOGY & DISCLOSURES
      </span>
      <h4 style={{ margin: "8px 0 6px", font: "600 14px var(--sans)" }}>
        Calculation Standard & Reproducibility
      </h4>
      <p
        style={{
          margin: "0 0 8px",
          font: "400 12px var(--sans)",
          color: "var(--ink)",
        }}
      >
        {text}
      </p>
    </div>
  );
}
