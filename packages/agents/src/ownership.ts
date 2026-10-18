import { z } from "zod";
import { ownershipConcentration } from "@provenance/graph/queries";

export const contributorShareSchema = z.object({
  login: z.string(),
  commits: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
  isBot: z.boolean(),
});

export const moduleOwnershipSchema = z.object({
  module: z.string(),
  totalCommits: z.number().int().nonnegative(),
  contributorsCount: z.number().int().nonnegative(),
  busFactor: z.number().int().positive(),
  riskLevel: z.enum(["high", "medium", "low"]),
  riskRationale: z.string(),
  topContributor: contributorShareSchema.nullable(),
  contributors: z.array(contributorShareSchema),
});

export const repositoryOwnershipReportSchema = z.object({
  repository: z.string(),
  analyzedSince: z.string(),
  analyzedSinceMs: z.number(),
  totalCommits: z.number().int().nonnegative(),
  totalModules: z.number().int().nonnegative(),
  highRiskModulesCount: z.number().int().nonnegative(),
  overallBusFactor: z.number(),
  methodology: z.string(),
  modules: z.array(moduleOwnershipSchema),
});

export type ContributorShare = z.infer<typeof contributorShareSchema>;
export type ModuleOwnership = z.infer<typeof moduleOwnershipSchema>;
export type RepositoryOwnershipReport = z.infer<
  typeof repositoryOwnershipReportSchema
>;

export function isBotLogin(login: string): boolean {
  const lower = login.toLowerCase();
  return (
    lower.endsWith("[bot]") ||
    lower.includes("dependabot") ||
    lower.includes("github-actions") ||
    lower.includes("greenkeeper") ||
    lower.includes("renovate") ||
    lower.includes("bot-") ||
    lower.endsWith("-bot")
  );
}

export function extractModule(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/");
  if (parts.length <= 1) return ".";
  const dirParts = parts.slice(0, -1);
  if (dirParts.length === 0) return ".";
  if (dirParts[0] === "packages" && dirParts.length >= 2) {
    return dirParts.slice(0, Math.min(3, dirParts.length)).join("/");
  }
  if (dirParts[0] === ".github") return ".github";
  return dirParts.slice(0, Math.min(2, dirParts.length)).join("/");
}

export function calculateBusFactor(
  contributors: ContributorShare[],
  totalCommits: number,
  threshold = 0.5,
): number {
  if (!contributors.length || totalCommits <= 0) return 1;
  const humanContributors = contributors.filter((c) => !c.isBot);
  const pool = humanContributors.length ? humanContributors : contributors;
  let cumulativeCommits = 0;
  let factor = 0;
  const targetCommits = totalCommits * threshold;
  for (const contributor of pool) {
    cumulativeCommits += contributor.commits;
    factor += 1;
    if (cumulativeCommits >= targetCommits) break;
  }
  return Math.max(1, factor);
}

export function determineRisk(
  busFactor: number,
  topPercentage: number,
  secondPercentage?: number,
): { level: "high" | "medium" | "low"; rationale: string } {
  if (busFactor === 1 || topPercentage >= 80) {
    return {
      level: "high",
      rationale:
        "Single contributor accounts for over 50% (or top exceeds 80%) of modifications; high maintainer concentration.",
    };
  }
  const hasFragileSecond =
    secondPercentage !== undefined &&
    secondPercentage > 0 &&
    secondPercentage < 10;
  if (busFactor === 2 || topPercentage >= 50 || hasFragileSecond) {
    return {
      level: "medium",
      rationale:
        "Two contributors account for majority ownership or secondary contributor share is below 10%.",
    };
  }
  return {
    level: "low",
    rationale:
      "Contributions are distributed across three or more maintainers with no single point of failure.",
  };
}

type OwnershipRow = {
  path: string;
  login: string;
  commits: number;
};

function buildModuleMap(rows: OwnershipRow[]): {
  moduleMap: Map<string, Map<string, number>>;
  totalCommits: number;
} {
  const moduleMap = new Map<string, Map<string, number>>();
  let totalCommits = 0;
  for (const row of rows) {
    const mod = extractModule(row.path);
    if (!moduleMap.has(mod)) moduleMap.set(mod, new Map());
    const authorMap = moduleMap.get(mod)!;
    authorMap.set(row.login, (authorMap.get(row.login) ?? 0) + row.commits);
    totalCommits += row.commits;
  }
  return { moduleMap, totalCommits };
}

function buildModuleReports(
  moduleMap: Map<string, Map<string, number>>,
  threshold: number,
): ModuleOwnership[] {
  const reports: ModuleOwnership[] = [];
  for (const [moduleName, authorMap] of moduleMap.entries()) {
    let modCommits = 0;
    for (const c of authorMap.values()) modCommits += c;
    const sorted = [...authorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([login, count]) => ({
        login,
        commits: count,
        percentage:
          modCommits > 0 ? Number(((count / modCommits) * 100).toFixed(1)) : 0,
        isBot: isBotLogin(login),
      }));
    const busFactor = calculateBusFactor(sorted, modCommits, threshold);
    const topPct = sorted[0]?.percentage ?? 0;
    const secondPct = sorted[1]?.percentage ?? 0;
    const { level, rationale } = determineRisk(busFactor, topPct, secondPct);

    reports.push({
      module: moduleName,
      totalCommits: modCommits,
      contributorsCount: sorted.length,
      busFactor,
      riskLevel: level,
      riskRationale: rationale,
      topContributor: sorted[0] ?? null,
      contributors: sorted,
    });
  }
  reports.sort((a, b) => {
    if (a.riskLevel === "high" && b.riskLevel !== "high") return -1;
    if (b.riskLevel === "high" && a.riskLevel !== "high") return 1;
    return b.totalCommits - a.totalCommits;
  });
  return reports;
}

export async function analyzeRepositoryOwnership(
  graphOrRepo: string,
  repositoryOrSinceMs?: string | number,
  sinceMsParam?: number,
  threshold = 0.5,
): Promise<RepositoryOwnershipReport> {
  const isPositional = typeof repositoryOrSinceMs === "string";
  const graph = isPositional
    ? graphOrRepo
    : graphOrRepo.startsWith("repo:")
      ? graphOrRepo
      : `repo:${graphOrRepo}`;
  const repository = isPositional
    ? repositoryOrSinceMs
    : graphOrRepo.replace(/^repo:/, "");
  const sinceMs = isPositional
    ? sinceMsParam
    : typeof repositoryOrSinceMs === "number"
      ? repositoryOrSinceMs
      : sinceMsParam;

  const windowMs = sinceMs ?? Date.now() - 365 * 86400000;
  const rows = (await ownershipConcentration(graph, windowMs).catch(
    () => [],
  )) as OwnershipRow[];
  const { moduleMap, totalCommits } = buildModuleMap(rows);
  const moduleReports = buildModuleReports(moduleMap, threshold);
  const highRiskCount = moduleReports.filter(
    (m) => m.riskLevel === "high",
  ).length;
  const avgBusFactor = moduleReports.length
    ? Number(
        (
          moduleReports.reduce((acc, m) => acc + m.busFactor, 0) /
          moduleReports.length
        ).toFixed(2),
      )
    : 1;

  return repositoryOwnershipReportSchema.parse({
    repository,
    analyzedSince: new Date(windowMs).toISOString(),
    analyzedSinceMs: windowMs,
    totalCommits,
    totalModules: moduleReports.length,
    highRiskModulesCount: highRiskCount,
    overallBusFactor: avgBusFactor,
    methodology:
      "Ownership calculated from distinct commit modifications per module; bus factor reflects minimum authors covering 50% cumulative ownership.",
    modules: moduleReports,
  });
}
