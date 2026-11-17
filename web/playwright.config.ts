import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
// Both SSR guards and browser mocks use isolated identities. Build with these
// same public URLs, as web-ci does; never weaken production authentication.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:3331";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "isolated-release-fixture";
process.env.NEXT_PUBLIC_WORKER_URL = "http://127.0.0.2:3332";

export default defineConfig({
  testDir: "./e2e",
  // The catalog/history contracts run in their own isolated server configuration.
  testIgnore: "competitions.spec.ts",
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "playwright-report/results.json" }]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: [{
    command: "node e2e/fixtures/release-auth.mjs",
    url: "http://127.0.0.1:3331/health",
    reuseExistingServer: false,
  }, {
    command: "npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_SITE_URL: "http://localhost:3100" },
    timeout: 60_000,
  }],
});
