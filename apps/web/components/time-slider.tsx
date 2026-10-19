"use client";

import { useEffect, useState, useTransition } from "react";
import type { TimelineReport } from "@provenance/agents/timeline";
import { TimelineResults } from "./time-slider-tables";
import { TimelineQuickJumps, MilestoneChips } from "./time-slider-chips";

type TimeSliderProps = {
  repository: string;
  initialTimeline?: TimelineReport | null;
};

function useTimelineData(repository: string, initial: TimelineReport | null) {
  const [data, setData] = useState<TimelineReport | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [selectedMs, setSelectedMs] = useState<number>(() => {
    return initial ? initial.cutoffMs : Date.now();
  });
  const [, startTransition] = useTransition();

  async function fetchCutoff(cutoffIso: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repository, asOf: cutoffIso }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || `HTTP error ${res.status}`);
      }
      const json = (await res.json()) as TimelineReport;
      startTransition(() => {
        setData(json);
        setSelectedMs(json.cutoffMs);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initial) void fetchCutoff(new Date().toISOString());
  }, [repository, initial]);

  return { data, loading, error, selectedMs, setSelectedMs, fetchCutoff };
}

function CutoffHeader({ selectedMs }: { selectedMs: number }) {
  const humanDate = new Date(selectedMs).toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "medium",
  });
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="eyebrow">
          <span className="eyebrow-dot" /> HISTORICAL CUTOFF
        </span>
        <span className="cutoff-indicator-tag">DETERMINISTIC AS-OF</span>
      </div>
      <div className="cutoff-display-terminal" suppressHydrationWarning>
        <span className="pulse-dot" style={{ width: 8, height: 8 }} />
        <span>{new Date(selectedMs).toISOString()}</span>
      </div>
      <div
        suppressHydrationWarning
        style={{
          font: "700 13px var(--mono)",
          color: "var(--muted)",
          marginTop: 6,
          letterSpacing: "0.02em",
        }}
      >
        // {humanDate.toUpperCase()}
      </div>
    </div>
  );
}

function RangeSlider({
  minMs,
  maxMs,
  selectedMs,
  loading,
  isLimited,
  onChange,
}: {
  minMs: number;
  maxMs: number;
  selectedMs: number;
  loading: boolean;
  isLimited: boolean;
  onChange: (ms: number) => void;
}) {
  return (
    <div style={{ margin: "20px 0 16px" }}>
      <input
        type="range"
        aria-label="Repository timeline cutoff"
        min={minMs}
        max={maxMs}
        value={selectedMs}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={loading || isLimited}
        className="timeline-range-input"
        suppressHydrationWarning
      />
      <div className="timeline-ticks" style={{ marginTop: 8 }}>
        <span suppressHydrationWarning>
          {new Date(minMs).toLocaleDateString()}
        </span>
        <span>Historical Scrubber (Zero Future Leakage)</span>
        <span suppressHydrationWarning>
          {new Date(maxMs).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function TimelinePanelChrome() {
  return (
    <div className="window-chrome" style={{ margin: "-26px -26px 16px -26px" }}>
      <div className="window-dots" aria-hidden="true">
        <span className="window-dot dot-red" />
        <span className="window-dot dot-yellow" />
        <span className="window-dot dot-green" />
      </div>
      <span className="window-title">TEMPORAL SCRUBBER // CYPHER AS-OF ENGINE</span>
      <span
        className="tactile-chip chip-lime"
        style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px" }}
      >
        <span className="pulse-dot" style={{ width: 6, height: 6 }} /> ZERO FUTURE LEAKAGE
      </span>
    </div>
  );
}

function TimelineControls({
  data,
  selectedMs,
  loading,
  onSliderChange,
}: {
  data: TimelineReport | null;
  selectedMs: number;
  loading: boolean;
  onSliderChange: (ms: number) => void;
}) {
  const minMs = data?.earliest
    ? new Date(data.earliest).getTime()
    : selectedMs - 86400000;
  const maxMs = data?.latest ? new Date(data.latest).getTime() : selectedMs;
  const isLimited = minMs >= maxMs;

  return (
    <div className="timeline-panel">
      <TimelinePanelChrome />
      <div className="slider-header">
        <CutoffHeader selectedMs={selectedMs} />
        <TimelineQuickJumps
          minMs={minMs}
          maxMs={maxMs}
          loading={loading}
          isLimited={isLimited}
          onJump={onSliderChange}
        />
      </div>
      <RangeSlider
        minMs={minMs}
        maxMs={maxMs}
        selectedMs={selectedMs}
        loading={loading}
        isLimited={isLimited}
        onChange={onSliderChange}
      />
      {data && data.milestones.length > 0 && (
        <MilestoneChips
          milestones={data.milestones}
          selectedMs={selectedMs}
          onSelect={onSliderChange}
        />
      )}
    </div>
  );
}

function TimelineError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="time-error" role="alert" style={{ marginTop: 20 }}>
      <strong>Timeline Query Error</strong>
      <p>{error}</p>
      <button type="button" className="retry-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export default function TimeSlider({
  repository,
  initialTimeline = null,
}: TimeSliderProps) {
  const { data, loading, error, selectedMs, setSelectedMs, fetchCutoff } =
    useTimelineData(repository, initialTimeline);
  const [activeTab, setActiveTab] = useState<
    "decisions" | "graph" | "nodes" | "edges"
  >("decisions");

  return (
    <div className="timeline-container">
      <TimelineControls
        data={data}
        selectedMs={selectedMs}
        loading={loading}
        onSliderChange={(ms) => {
          setSelectedMs(ms);
          void fetchCutoff(new Date(ms).toISOString());
        }}
      />
      {error && (
        <TimelineError
          error={error}
          onRetry={() => void fetchCutoff(new Date(selectedMs).toISOString())}
        />
      )}
      {loading && (
        <div style={{ marginTop: 24 }}>
          <div
            className="skeleton-pulse"
            style={{ height: 60, marginBottom: 16 }}
          />
          <div className="skeleton-pulse" style={{ height: 200 }} />
        </div>
      )}
      {!loading && data && (
        <TimelineResults
          data={data}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}
