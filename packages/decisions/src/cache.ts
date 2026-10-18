import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function cachePath(repo: string, content: string) {
  const hash = createHash("sha256").update(content).digest("hex");
  const root =
    process.env.PROVENANCE_DECISION_CACHE_DIR ??
    join(process.cwd(), "data", "snapshots");
  return join(root, repo.replace("/", "__"), "decisions", `${hash}.json`);
}

export async function cachedOutput<T>(
  repo: string,
  content: string,
  request: () => Promise<T>,
) {
  const cached = await cachedValue<T>(repo, content);
  if (cached !== undefined) return cached;
  const output = await request();
  await writeCachedValue(repo, content, output);
  return output;
}

export async function writeCachedValue<T>(
  repo: string,
  content: string,
  value: T,
) {
  const path = cachePath(repo, content);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

export async function cachedValue<T>(repo: string, content: string) {
  const path = cachePath(repo, content);
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
