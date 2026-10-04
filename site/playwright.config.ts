import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: process.env.THREADBOARD_SITE_URL || "http://127.0.0.1:4401",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: process.env.THREADBOARD_SITE_URL
    ? undefined
    : {
        command: "npm run verify && npm run dev",
        url: "http://127.0.0.1:4401",
        env: { THREADBOARD_SITE_PORT: "4401" },
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
