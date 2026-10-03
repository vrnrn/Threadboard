import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const data = mkdtempSync(join(tmpdir(), 'threadboard-ui-data-'));
process.env.THREADBOARD_DATA_DIR = data;
process.env.THREADBOARD_PREVIEW_PORT ||= '4389';
process.on('exit', () => rmSync(data, { recursive: true, force: true }));
if (process.argv.includes('--demo')) {
  const { Store } = await import('../src/store.js');
  const { seedDemo } = await import('./demo.js');
  const store = new Store(data); seedDemo(store, data); store.close();
}
if (process.argv.includes('--performance')) {
  const { Store } = await import('../src/store.js');
  const { seedPerformance } = await import('./performance-fixture.js');
  const store = new Store(data); seedPerformance(store, join(data, 'workspace'), 2000, 5000, 'Performance board'); store.close();
}
await import('../src/preview.js');
