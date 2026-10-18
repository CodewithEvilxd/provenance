import { createHash } from "node:crypto";

export function decisionId(summary: string, sources: string[]) {
  const normalized = summary.toLowerCase().replace(/\s+/g, " ").trim();
  const hash = createHash("sha256")
    .update(JSON.stringify([normalized, [...sources].sort()]))
    .digest("hex");
  return `decision:${hash}`;
}
