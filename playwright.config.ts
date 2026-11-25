import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "e2e/.artifacts/results",
  use: { baseURL: process.env.E2E_BASE ?? "http://localhost:3100", trace: "off", locale: "ar-SA", timezoneId: "Asia/Riyadh" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
