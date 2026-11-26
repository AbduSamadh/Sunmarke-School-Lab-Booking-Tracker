import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end, accessibility and access-control checks against a real server.
 * The server runs on an in-memory database (seeded sample data) with the clock
 * pinned to Monday 30 Nov 2026, 08:00 Dubai, so every run sees the same week.
 *   pnpm --filter web e2e            (builds, starts, runs)
 *   E2E_URL=http://localhost:3000 pnpm --filter web e2e   (uses a server you started)
 */
const PORT = 3100;
const external = process.env.E2E_URL;
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "off",
    video: process.env.RECORD ? "on" : "off",
    ...devices["Desktop Chrome"],
  },
  webServer: external
    ? undefined
    : {
        command: `pnpm build && pnpm exec next start -p ${PORT}`,
        url: `http://localhost:${PORT}/api/v1/openapi.json`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: { DATA_DIR: "memory", FAKE_NOW: "2026-11-30T04:00:00.000Z", NEXT_TELEMETRY_DISABLED: "1" },
      },
});
