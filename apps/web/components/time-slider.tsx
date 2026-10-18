"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  TimelineReport,
  TimelineMilestone,
} from "@provenance/agents/timeline";
import { TimelineResults } from "./time-slider-tables";

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

export default function TimeSlider({
  repository,
  initialTimeline = null,
}: TimeSliderProps) {
  const { data, loading, error, selectedMs, setSelectedMs, fetchCutoff } =
    useTimelineData(repository, initialTimeline);
  const [activeTab, setActiveTab] = useState<"decisions" | "nodes" | "edges">(
    "decisions",
  );

  function handleSliderChange(newMs: number) {
    setSelectedMs(newMs);
    void fetchCutoff(new Date(newMs).toISOString());
  }

  return (
    <div className="time-slider-container">
      <TimelineControls
        data={data}
        selectedMs={selectedMs}
        loading={loading}
        onSliderChange={handleSliderChange}
      />
      {error && (
        <TimelineError
          error={error}
          onRetry={() => void fetchCutoff(new Date(selectedMs).toISOString())}
        />
      )}
      {loading && <TimelineLoadingSkeleton />}
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
    <div className="time-slider-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <span className="eyebrow">
            <span className="eyebrow-dot" /> HISTORICAL CUTOFF
          </span>
          <div className="time-display-iso">
            {new Date(selectedMs).toISOString()}
          </div>
          <div className="time-display-human">
            {new Date(selectedMs).toLocaleString(undefined, {
              dateStyle: "full",
              timeStyle: "medium",
            })}
          </div>
        </div>
        <TimelineQuickJumps
          minMs={minMs}
          maxMs={maxMs}
          loading={loading}
          isLimited={isLimited}
          onJump={onSliderChange}
        />
      </div>

      <div style={{ margin: "24px 0 16px" }}>
        <input
          type="range"
          aria-label="Repository timeline cutoff"
          min={minMs}
          max={maxMs}
          value={selectedMs}
          onChange={(e) => onSliderChange(Number(e.target.value))}
          disabled={loading || isLimited}
          className="time-slider-input"
        />
        <div className="timeline-ticks">
          <span>{new Date(minMs).toLocaleDateString()}</span>
          <span>Historical Scrubber (Zero Future Leakage)</span>
          <span>{new Date(maxMs).toLocaleDateString()}</span>
        </div>
      </div>

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

function TimelineQuickJumps({
  minMs,
  maxMs,
  loading,
  isLimited,
  onJump,
}: {
  minMs: number;
  maxMs: number;
  loading: boolean;
  isLimited: boolean;
  onJump: (ms: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        className="milestone-btn"
        onClick={() => onJump(minMs)}
        disabled={loading || isLimited}
      >
        Earliest
      </button>
      <button
        type="button"
        className="milestone-btn"
        onClick={() => onJump(Math.floor((minMs + maxMs) / 2))}
        disabled={loading || isLimited}
      >
        Midpoint
      </button>
      <button
        type="button"
        className="milestone-btn"
        onClick={() => onJump(maxMs)}
        disabled={loading || isLimited}
      >
        Latest Known
      </button>
    </div>
  );
}

function MilestoneChips({
  milestones,
  selectedMs,
  onSelect,
}: {
  milestones: TimelineMilestone[];
  selectedMs: number;
  onSelect: (ms: number) => void;
}) {
  return (
    <div className="milestones-strip">
      <span className="field-label" style={{ margin: 0 }}>
        KEY MILESTONES ({milestones.length}):
      </span>
      <div className="milestones-chips">
        {milestones.slice(0, 8).map((m) => {
          const milestoneMs = new Date(m.timestamp).getTime();
          return (
            <button
              key={m.id}
              type="button"
              className={`milestone-btn ${Math.abs(selectedMs - milestoneMs) < 86400000 ? "milestone-selected" : ""}`}
              onClick={() => onSelect(milestoneMs)}
              title={`${m.text} (${new Date(m.timestamp).toLocaleDateString()})`}
            >
              <span style={{ opacity: 0.6 }}>{m.kind.toUpperCase()}:</span>
              <span>{m.text.slice(0, 24)}</span>
            </button>
          );
        })}
      </div>
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

function TimelineLoadingSkeleton() {
  return (
    <div style={{ marginTop: 24 }}>
      <div
        className="skeleton-pulse"
        style={{ height: 60, marginBottom: 16 }}
      />
      <div className="skeleton-pulse" style={{ height: 200 }} />
    </div>
  );
}
