import { defineConfig } from "@playwright/test";

const ci = process.env["CI"] === "true";
// E2E_PORT lets several checkouts run the suite side by side without one
// reusing another's server.
const port = Number(process.env["E2E_PORT"] ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: ci ? 1 : 0,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `npm run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
