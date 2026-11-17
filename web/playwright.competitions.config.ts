import { defineConfig, devices } from "@playwright/test";
process.env.QB_COMPETITIONS_FIXTURE = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:3331";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "isolated-release-fixture";
process.env.NEXT_PUBLIC_WORKER_URL = "http://127.0.0.2:3332";
export default defineConfig({
  testDir: "./e2e", testMatch: "competitions.spec.ts", workers: 2, retries: 0,
  outputDir: "test-results/competitions",
  reporter: [["list"], ["json", { outputFile: "playwright-report/competitions.json" }]],
  use: { baseURL: "http://localhost:3135", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: [
    { command: "node e2e/fixtures/release-auth.mjs", url: "http://127.0.0.1:3331/health", reuseExistingServer: false },
    { command: "npm run start -- --port 3135", url: "http://localhost:3135", reuseExistingServer: false, timeout: 60000,
      env: { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_WORKER_URL: process.env.NEXT_PUBLIC_WORKER_URL } },
  ],
});
