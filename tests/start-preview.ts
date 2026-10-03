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
await import('../src/preview.js');
