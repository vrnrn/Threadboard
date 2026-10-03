import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/performance', workers: 1, timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4391', viewport: { width: 1512, height: 982 } },
  webServer: { command: 'npx tsx tests/start-preview.ts --performance', url: 'http://127.0.0.1:4391', env: { THREADBOARD_PREVIEW_PORT: '4391' }, reuseExistingServer: false, timeout: 30_000 },
});
