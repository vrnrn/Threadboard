import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/screenshots', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4390', viewport: { width: 1512, height: 982 } },
  webServer: { command: 'npm run build && npx tsx tests/start-preview.ts --demo', url: 'http://127.0.0.1:4390', env: { THREADBOARD_PREVIEW_PORT: '4390' }, reuseExistingServer: false, timeout: 30_000 },
});
