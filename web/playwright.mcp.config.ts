import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "mcp-connection.spec.ts", timeout: 60_000,
  use: { baseURL: "http://localhost:3107" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: { command: "npm run dev -- --webpack --port 3107", url: "http://localhost:3107", reuseExistingServer: !process.env.CI, timeout: 90_000 },
});
