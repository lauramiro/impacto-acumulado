import { defineConfig } from "@playwright/test";

const ci = process.env["CI"] === "true";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: ci ? 1 : 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
