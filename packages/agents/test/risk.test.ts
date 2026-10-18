import { expect, it } from "vitest";
import { riskBand, riskScore } from "../src/risk.js";

it("scores the documented components and bands", () => {
  const score = riskScore({
    blastRadius: 40,
    weightedIncidents: 3,
    decisions: [{ strength: "hard", violated: true }],
    authorKnowledge: 0,
    linesChanged: 800,
    recentDirectIncident: false,
  });
  expect(score).toEqual({
    score: 100,
    band: "high",
    components: {
      blast: 1,
      history: 1,
      decisions: 1,
      familiarity: 1,
      size: 1,
    },
  });
});

it("applies the medium floor for a recent direct incident", () => {
  const score = riskScore({
    blastRadius: 0,
    weightedIncidents: 0,
    decisions: [],
    authorKnowledge: 5,
    linesChanged: 0,
    recentDirectIncident: true,
  });
  expect(score.score).toBe(30);
  expect(score.band).toBe("medium");
});

it("scores a hard decision violation as more severe than a soft violation", () => {
  const shared = {
    blastRadius: 0,
    weightedIncidents: 0,
    authorKnowledge: 5,
    linesChanged: 0,
    recentDirectIncident: false,
  };
  expect(
    riskScore({ ...shared, decisions: [{ strength: "hard", violated: true }] })
      .components.decisions,
  ).toBe(1);
  expect(
    riskScore({ ...shared, decisions: [{ strength: "soft", violated: true }] })
      .components.decisions,
  ).toBe(0.6);
});

it("keeps the documented risk-band boundaries", () => {
  expect([29, 30, 59, 60].map(riskBand)).toEqual([
    "low",
    "medium",
    "medium",
    "high",
  ]);
});

it("normalizes observed channel weights when evidence channels are missing", () => {
  const complete = riskScore({
    blastRadius: 31,
    weightedIncidents: 0,
    decisions: [],
    authorKnowledge: 0,
    linesChanged: 100,
    recentDirectIncident: false,
  });

  const missingChannels = riskScore({
    blastRadius: 31,
    weightedIncidents: 0,
    decisions: [],
    authorKnowledge: 0,
    linesChanged: 100,
    recentDirectIncident: false,
    missingEvidence: ["incidents", "decisions"],
  });
  expect(missingChannels.score).toBeGreaterThan(complete.score);
  expect(missingChannels.band).toBe("high");
});

it("preserves identical scores when missingEvidence is absent or empty", () => {
  const input = {
    blastRadius: 15,
    weightedIncidents: 1,
    decisions: [{ strength: "soft" as const, violated: false }],
    authorKnowledge: 2,
    linesChanged: 150,
    recentDirectIncident: false,
  };
  const scoreDefault = riskScore(input);
  const scoreEmpty = riskScore({ ...input, missingEvidence: [] });
  expect(scoreDefault.score).toBe(scoreEmpty.score);
  expect(scoreDefault.band).toBe(scoreEmpty.band);
});
