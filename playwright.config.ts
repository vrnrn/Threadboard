import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:4389', viewport: { width: 1440, height: 960 }, trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: { command: 'npm run build && npx tsx tests/start-preview.ts', url: 'http://127.0.0.1:4389', reuseExistingServer: false, timeout: 30_000 },
});
