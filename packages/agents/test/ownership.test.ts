import { describe, expect, it } from "vitest";
import {
  calculateBusFactor,
  determineRisk,
  extractModule,
  isBotLogin,
  analyzeRepositoryOwnership,
} from "../src/ownership.js";

describe("Contributor ownership and bus factor unit tests", () => {
  it("detects bot accounts accurately", () => {
    expect(isBotLogin("dependabot[bot]")).toBe(true);
    expect(isBotLogin("github-actions[bot]")).toBe(true);
    expect(isBotLogin("renovate[bot]")).toBe(true);
    expect(isBotLogin("greenkeeper")).toBe(true);
    expect(isBotLogin("sapphi-red")).toBe(false);
    expect(isBotLogin("yyx990803")).toBe(false);
    expect(isBotLogin("patak-dev")).toBe(false);
  });

  it("extracts module directory paths correctly", () => {
    expect(extractModule("packages/vite/src/node/config.ts")).toBe(
      "packages/vite/src",
    );
    expect(extractModule("packages/plugin-vue/index.ts")).toBe(
      "packages/plugin-vue",
    );
    expect(extractModule("docs/guide/features.md")).toBe("docs/guide");
    expect(extractModule("package.json")).toBe(".");
  });

  it("calculates bus factor at 50% threshold for concentrated ownership", () => {
    const singleAuthor = [
      { login: "alice", commits: 90, percentage: 90, isBot: false },
    ];
    expect(calculateBusFactor(singleAuthor, 100, 0.5)).toBe(1);

    const dominantAuthor = [
      { login: "alice", commits: 60, percentage: 60, isBot: false },
      { login: "bob", commits: 40, percentage: 40, isBot: false },
    ];
    expect(calculateBusFactor(dominantAuthor, 100, 0.5)).toBe(1);
  });

  it("calculates bus factor for distributed ownership", () => {
    const distributed = [
      { login: "alice", commits: 20, percentage: 20, isBot: false },
      { login: "bob", commits: 20, percentage: 20, isBot: false },
      { login: "charlie", commits: 20, percentage: 20, isBot: false },
      { login: "dave", commits: 20, percentage: 20, isBot: false },
      { login: "eve", commits: 20, percentage: 20, isBot: false },
    ];
    expect(calculateBusFactor(distributed, 100, 0.5)).toBe(3);
  });

  it("handles edge cases in bus factor calculation", () => {
    expect(calculateBusFactor([], 0, 0.5)).toBe(1);
    expect(calculateBusFactor([], 100, 0.5)).toBe(1);
  });

  it("determines module risk levels accurately", () => {
    expect(determineRisk(1, 90).level).toBe("high");
    expect(determineRisk(1, 55).level).toBe("high");
    expect(determineRisk(2, 85).level).toBe("high");
    expect(determineRisk(2, 45).level).toBe("medium");
    expect(determineRisk(3, 30).level).toBe("low");
    expect(determineRisk(5, 20).level).toBe("low");
  });
});

describe("Repository ownership integration against FalkorDB", () => {
  it("analyzes ownership on live repo:vitejs/vite", async () => {
    const report = await analyzeRepositoryOwnership("vitejs/vite");

    expect(report.repository).toBe("vitejs/vite");
    expect(report.totalCommits).toBeGreaterThan(0);
    expect(report.overallBusFactor).toBeGreaterThanOrEqual(1);
    expect(report.modules.length).toBeGreaterThan(0);

    const firstModule = report.modules[0];
    expect(firstModule.totalCommits).toBeGreaterThan(0);
    expect(firstModule.contributors.length).toBeGreaterThan(0);
    expect(["high", "medium", "low"]).toContain(firstModule.riskLevel);
    expect(firstModule.busFactor).toBeGreaterThanOrEqual(1);

    expect(report.methodology).toBeTruthy();
  });

  it("handles empty repository gracefully without failing", async () => {
    const report = await analyzeRepositoryOwnership("empty/repo-never-exists");

    expect(report.repository).toBe("empty/repo-never-exists");
    expect(report.totalCommits).toBe(0);
    expect(report.overallBusFactor).toBe(1);
    expect(report.modules).toEqual([]);
    expect(report.highRiskModulesCount).toBe(0);
  });
});
