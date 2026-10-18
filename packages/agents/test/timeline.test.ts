import { describe, expect, it } from "vitest";
import { queryTimeline } from "../src/timeline.js";

describe("Timeline bounds and milestones", () => {
  it("queries timeline bounds and milestones for repo:vitejs/vite", async () => {
    const report = await queryTimeline({
      repository: "vitejs/vite",
      asOf: "2026-10-18T00:00:00Z",
    });

    expect(report.repository).toBe("vitejs/vite");
    expect(report.isEmpty).toBe(false);
    expect(report.earliest).toBeTruthy();
    expect(report.latest).toBeTruthy();
    expect(report.totalNodes).toBeGreaterThan(0);
    expect(report.totalEdges).toBeGreaterThan(0);
    expect(report.milestones.length).toBeGreaterThan(0);
  });

  it("rejects invalid date strings gracefully with fallback or error", async () => {
    await expect(
      queryTimeline({
        repository: "vitejs/vite",
        asOf: "not-a-valid-timestamp",
      }),
    ).rejects.toThrow();
  });
});

describe("Temporal cutoffs and zero future leakage", () => {
  it("enforces zero future leakage: earlier cutoff has fewer or equal nodes and decisions than later cutoff", async () => {
    const augustCutoff = "2026-08-01T00:00:00Z";
    const octoberCutoff = "2026-10-15T00:00:00Z";

    const [augustReport, octoberReport] = await Promise.all([
      queryTimeline({ repository: "vitejs/vite", asOf: augustCutoff }),
      queryTimeline({ repository: "vitejs/vite", asOf: octoberCutoff }),
    ]);

    expect(augustReport.totalNodes).toBeLessThanOrEqual(
      octoberReport.totalNodes,
    );
    expect(augustReport.activeDecisionsCount).toBeLessThanOrEqual(
      octoberReport.activeDecisionsCount,
    );

    const augustCutoffMs = new Date(augustCutoff).getTime();
    for (const node of augustReport.nodes) {
      if (node.timestamp) {
        const nodeMs = new Date(node.timestamp).getTime();
        expect(nodeMs).toBeLessThanOrEqual(augustCutoffMs);
      }
    }
  });

  it("handles cutoff before repository creation honestly with empty node slice", async () => {
    const beforeGenesis = "2020-01-01T00:00:00Z";
    const report = await queryTimeline({
      repository: "vitejs/vite",
      asOf: beforeGenesis,
    });

    expect(report.repository).toBe("vitejs/vite");
    expect(report.totalNodes).toBe(0);
    expect(report.totalEdges).toBe(0);
    expect(report.activeDecisionsCount).toBe(0);
    expect(report.detectedIncidentsCount).toBe(0);
  });

  it("handles completely non-existent repository gracefully", async () => {
    const report = await queryTimeline({
      repository: "nonexistent/empty-repo",
      asOf: "2026-10-18T00:00:00Z",
    });

    expect(report.repository).toBe("nonexistent/empty-repo");
    expect(report.isEmpty).toBe(true);
    expect(report.totalNodes).toBe(0);
    expect(report.totalEdges).toBe(0);
    expect(report.nodes).toEqual([]);
    expect(report.edges).toEqual([]);
  });
});
