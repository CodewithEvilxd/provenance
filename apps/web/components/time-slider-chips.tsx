"use client";

import type { TimelineMilestone } from "@provenance/agents/timeline";

export function TimelineQuickJumps({
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
  const mid = Math.floor((minMs + maxMs) / 2);
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
        onClick={() => onJump(mid)}
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

export function MilestoneChips({
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
          const mMs = new Date(m.timestamp).getTime();
          const isCur = Math.abs(selectedMs - mMs) < 86400000;
          return (
            <button
              key={m.id}
              type="button"
              className={`milestone-btn ${isCur ? "milestone-selected" : ""}`}
              onClick={() => onSelect(mMs)}
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
