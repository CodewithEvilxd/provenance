import type { ActiveDecisionRow } from "@provenance/graph/queries";

export type ReviewFile = {
  filename: string;
  patch?: string | null;
};
export type ReviewFunction = {
  id: string;
  path: string;
  start: number;
  end: number;
};
export type ReviewCheck = {
  decision: ActiveDecisionRow;
  hunk: string;
  prompt: string;
};

const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@.*$/;

export function buildReviewChecks(
  decisions: ActiveDecisionRow[],
  files: ReviewFile[],
  changed: ReviewFunction[],
): ReviewCheck[] {
  return decisions.flatMap((decision) => {
    const targets = changed.filter(
      (fn) =>
        decision.target === fn.id ||
        (decision.target.startsWith("file:") &&
          decision.target.slice("file:".length) === fn.path),
    );
    if (!targets.length) return [];
    const file = files.find(({ filename }) => filename === targets[0]?.path);
    if (!file?.patch) return [];
    const ranges = targets.map(({ start, end }) => ({ start, end }));
    const hunk = overlappingHunks(file.patch, ranges).slice(0, 4000);
    if (!hunk) return [];
    const decisionText = `${decision.summary}\n${decision.reason}`.slice(
      0,
      300,
    );
    return [
      {
        decision,
        hunk,
        prompt: [
          "Check whether this diff violates the engineering decision.",
          'Return compact JSON only: {"violated": boolean, "evidence": "..."}; evidence must be at most 150 characters.',
          "If uncertain, set violated to false.",
          `Decision: ${decisionText}`,
          `Diff hunk:\n${hunk}`,
        ].join("\n"),
      },
    ];
  });
}

function overlappingHunks(
  patch: string,
  ranges: { start: number; end: number }[],
) {
  const lines = patch.split("\n");
  const hunks: string[] = [];
  let current: string[] = [];
  let range: { start: number; end: number } | undefined;
  const finish = () => {
    const currentRange = range;
    if (
      currentRange &&
      ranges.some(
        ({ start, end }) =>
          start <= currentRange.end && end >= currentRange.start,
      )
    )
      hunks.push(current.join("\n"));
  };
  for (const line of lines) {
    const header = hunkHeader.exec(line);
    if (header) {
      finish();
      const start = Number(header[1]);
      const length = Number(header[2] ?? 1);
      range = { start, end: start + Math.max(0, length - 1) };
      current = [line];
    } else if (range) current.push(line);
  }
  finish();
  return hunks.join("\n").slice(0, 4000);
}
