import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// The browser mocks must use the same public hosts as the compiled application.
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "playwright-report/results.json" }]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_SITE_URL: "http://localhost:3100" },
    timeout: 60_000,
  },
});
