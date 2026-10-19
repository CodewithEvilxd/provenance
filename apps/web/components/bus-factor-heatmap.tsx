"use client";

import { useEffect, useState, useMemo } from "react";
import type {
  RepositoryOwnershipReport,
  ModuleOwnership,
} from "@provenance/agents/ownership";
import { ModuleCard } from "./bus-factor-card";
import { BusFactorStats, MethodologyDisclosure } from "./bus-factor-disclosure";

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
      setReport((await res.json()) as RepositoryOwnershipReport);
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

function FilterPills({
  riskFilter,
  onChange,
}: {
  riskFilter: "all" | "high" | "medium" | "low";
  onChange: (r: "all" | "high" | "medium" | "low") => void;
}) {
  const levels = ["all", "high", "medium", "low"] as const;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span className="field-label" style={{ margin: 0 }}>
        RISK:
      </span>
      {levels.map((lvl) => (
        <button
          key={lvl}
          type="button"
          className={`milestone-btn ${riskFilter === lvl ? "milestone-selected" : ""}`}
          onClick={() => onChange(lvl)}
        >
          {lvl.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SortDropdown({
  sortBy,
  onChange,
}: {
  sortBy: "commits" | "busFactor" | "risk";
  onChange: (s: "commits" | "busFactor" | "risk") => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span className="field-label" style={{ margin: 0 }}>
        SORT:
      </span>
      <select
        value={sortBy}
        onChange={(e) =>
          onChange(e.target.value as "commits" | "busFactor" | "risk")
        }
        aria-label="Sort modules by"
        style={{
          padding: "8px 12px",
          border: "var(--bw) solid var(--ink)",
          borderRadius: "var(--radius-sm)",
          font: "700 12px var(--mono)",
          background: "var(--panel)",
          color: "var(--ink)",
          boxShadow: "1.5px 1.5px 0 var(--ink)",
        }}
      >
        <option value="commits">Most commits</option>
        <option value="busFactor">Lowest Bus Factor</option>
        <option value="risk">Highest Risk</option>
      </select>
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
      />
      <FilterPills riskFilter={riskFilter} onChange={onRiskFilterChange} />
      <SortDropdown sortBy={sortBy} onChange={onSortByChange} />
    </div>
  );
}

function SkeletonView() {
  return (
    <div className="bus-factor-container" aria-busy="true">
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "var(--panel)", border: "var(--bw) solid var(--ink)", borderRadius: "var(--radius-md)", boxShadow: "var(--ex-xs)", marginBottom: 20 }}>
        <span className="pulse-dot" />
        <span style={{ font: "800 12px var(--mono)", letterSpacing: "0.06em", color: "var(--ink)" }}>
          COMPUTING LORENZ GINI CONCENTRATION FROM FALKORDB AST GRAPH...
        </span>
      </div>
      <div className="modules-grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="skeleton-pulse"
            style={{ height: 160, borderRadius: "var(--radius-md)", border: "1.5px solid var(--line-soft)" }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorView({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="time-error" role="alert">
      <strong>Error loading contributor ownership</strong>
      <p>{error}</p>
      <button type="button" className="retry-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
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
  const filtered = useFilteredModules(
    report?.modules,
    search,
    riskFilter,
    sortBy,
  );

  if (loading) return <SkeletonView />;
  if (error) return <ErrorView error={error} onRetry={() => void reload()} />;
  if (!report || report.modules.length === 0) {
    return (
      <div className="time-empty">
        <p>No commit history or ownership data available for {repository}.</p>
      </div>
    );
  }

  return (
    <div className="heatmap-container">
      <BusFactorStats report={report} />
      <BusFactorControls
        search={search}
        onSearchChange={setSearch}
        riskFilter={riskFilter}
        onRiskFilterChange={setRiskFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
      />
      <div className="modules-grid">
        {filtered.map((item) => (
          <ModuleCard key={item.module} item={item} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="time-empty">
          <p>No modules match the filter query “{search}”.</p>
        </div>
      )}
      <MethodologyDisclosure report={report} />
    </div>
  );
}
