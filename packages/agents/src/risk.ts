export type RiskInputs = {
  blastRadius: number;
  weightedIncidents: number;
  decisions: { strength: "hard" | "soft"; violated: boolean }[];
  authorKnowledge: number;
  linesChanged: number;
  recentDirectIncident: boolean;
  missingEvidence?: string[] | undefined;
};

export type RiskScore = {
  score: number;
  band: "low" | "medium" | "high";
  components: {
    blast: number;
    history: number;
    decisions: number;
    familiarity: number;
    size: number;
  };
};

export function riskBand(score: number): RiskScore["band"] {
  return score < 30 ? "low" : score < 60 ? "medium" : "high";
}

export function riskScore(input: RiskInputs): RiskScore {
  const components = {
    blast: Math.min(1, Math.log1p(input.blastRadius) / Math.log1p(40)),
    history: Math.min(1, input.weightedIncidents / 3),
    decisions: input.decisions.some(
      ({ strength, violated }) => strength === "hard" && violated,
    )
      ? 1
      : input.decisions.some(
            ({ strength, violated }) => strength === "soft" && violated,
          )
        ? 0.6
        : input.decisions.length
          ? 0.2
          : 0,
    familiarity: 1 - Math.min(1, input.authorKnowledge / 5),
    size: Math.min(1, input.linesChanged / 800),
  };
  const weights = {
    blast: 0.25,
    history: input.missingEvidence?.includes("incidents") ? 0 : 0.3,
    decisions: input.missingEvidence?.includes("decisions") ? 0 : 0.25,
    familiarity: 0.1,
    size: 0.1,
  };
  const observedWeight =
    weights.blast +
    weights.history +
    weights.decisions +
    weights.familiarity +
    weights.size;
  const weightedNumerator =
    weights.blast * components.blast +
    weights.history * components.history +
    weights.decisions * components.decisions +
    weights.familiarity * components.familiarity +
    weights.size * components.size;
  const weighted = observedWeight > 0 ? weightedNumerator / observedWeight : 0;
  const floor =
    input.decisions.some(
      ({ strength, violated }) => strength === "hard" && violated,
    ) || input.recentDirectIncident
      ? 30
      : 0;
  const score = Math.max(floor, 100 * weighted);
  return {
    score,
    band: riskBand(score),
    components,
  };
}
