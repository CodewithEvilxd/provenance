import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Octokit } from "@octokit/rest";

type Repository = { full_name: string; default_branch: string };
type Commit = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string | null;
      email: string | null;
      date: string | null;
    } | null;
  };
  author: { login: string } | null;
  parents: { sha: string }[];
};
type Pull = {
  number: number;
  html_url?: string;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
  user: { login: string } | null;
  base: { ref: string };
  labels?: { name?: string }[];
  additions?: number;
  deletions?: number;
};
type Review = {
  id: number;
  state: string;
  submitted_at: string | null;
  user: { login: string } | null;
};
type ReviewComment = {
  id: number;
  html_url?: string;
  body: string;
  created_at: string;
  path: string;
  line: number | null;
  original_line?: number | null;
  commit_id?: string;
  original_commit_id?: string;
  diff_hunk?: string;
  user: { login: string; type: string } | null;
  in_reply_to_id?: number;
  pull_request_review_id?: number;
};
type Issue = {
  html_url?: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  closed_at: string | null;
  user: { login: string } | null;
  labels: { name?: string }[];
};
type IssueComment = {
  html_url?: string;
  id: number;
  body: string;
  created_at: string;
  user: { login: string; type: string } | null;
};
type CommitComment = {
  html_url?: string;
  id: number;
  body: string;
  created_at: string;
  path: string | null;
  position: number | null;
  user: { login: string; type: string } | null;
};
type CommitDetail = Commit & {
  stats: { additions: number; deletions: number };
  files: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }[];
};

if (!process.env.GITHUB_TOKEN && existsSync(".env.local"))
  process.loadEnvFile(".env.local");
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");
export const octokit = new Octokit({
  auth: token,
  userAgent: "provenance-ingest",
});

function cacheDirectory(owner: string, name: string) {
  return join(process.cwd(), "data", "snapshots", `${owner}__${name}`);
}

export async function cached<T>(
  owner: string,
  name: string,
  key: string,
  request: () => Promise<T>,
): Promise<T> {
  const directory = cacheDirectory(owner, name);
  const path = join(
    directory,
    `${createHash("sha256").update(key).digest("hex")}.json`,
  );
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (process.env.GITHUB_CACHE_ONLY === "true")
    throw new Error("GitHub cache miss while GITHUB_CACHE_ONLY is enabled");
  await mkdir(directory, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      const payload = await request();
      await writeFile(path, JSON.stringify(payload));
      return payload;
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : 0;
      if (
        attempt === 4 ||
        !(
          status === 403 ||
          status === 429 ||
          (typeof status === "number" && status >= 500)
        )
      )
        throw error;
      const delay =
        Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function repository(owner: string, name: string) {
  return cached(owner, name, `repository:${owner}/${name}`, async () => {
    const response = await octokit.repos.get({ owner, repo: name });
    return response.data as Repository;
  });
}

export async function pages<T>(
  owner: string,
  name: string,
  key: string,
  fetch: (page: number) => Promise<T[]>,
) {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const current = await cached(owner, name, `${key}:page:${page}`, () =>
      fetch(page),
    );
    all.push(...current);
    if (current.length < 100) return all;
  }
}

export function commits(owner: string, name: string, branch: string) {
  return pages(owner, name, `commits:${branch}`, async (page) => {
    const response = await octokit.repos.listCommits({
      owner,
      repo: name,
      sha: branch,
      per_page: 100,
      page,
    });
    return response.data as Commit[];
  });
}

export function pulls(owner: string, name: string) {
  return pages(owner, name, "pulls:all", async (page) => {
    const response = await octokit.pulls.list({
      owner,
      repo: name,
      state: "all",
      per_page: 100,
      page,
      sort: "updated",
      direction: "desc",
    });
    return response.data as Pull[];
  });
}

export async function recentMergedPulls(
  owner: string,
  name: string,
  limit: number,
) {
  const merged: Pull[] = [];
  for (let page = 1; merged.length < limit; page++) {
    const current = await cached(
      owner,
      name,
      `pulls:closed:page:${page}`,
      async () => {
        const response = await octokit.pulls.list({
          owner,
          repo: name,
          state: "closed",
          per_page: 100,
          page,
          sort: "updated",
          direction: "desc",
        });
        return response.data as Pull[];
      },
    );
    merged.push(...current.filter((pull) => pull.merged_at));
    if (current.length < 100) break;
  }
  return merged
    .sort(
      (left, right) =>
        Date.parse(right.merged_at ?? "") - Date.parse(left.merged_at ?? ""),
    )
    .slice(0, limit);
}

export type {
  Commit,
  CommitComment,
  CommitDetail,
  Issue,
  IssueComment,
  Pull,
  Repository,
  Review,
  ReviewComment,
};
