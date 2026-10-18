import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = resolve(process.cwd(), "../..");
const localEnvironment = resolve(workspaceRoot, ".env.local");
if (!process.env.GITHUB_TOKEN && existsSync(localEnvironment))
  process.loadEnvFile(localEnvironment);
const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  serverExternalPackages: ["falkordb"],
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@provenance/agents",
    "@provenance/graph",
    "@provenance/ingest",
    "@provenance/llm",
    "@provenance/decisions",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
