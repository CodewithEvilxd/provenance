import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3100", channel: "msedge" },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3100",
    cwd: "apps/web",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
