import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { Store } from '../src/store.js';
import { seedPerformance } from '../tests/performance-fixture.js';
import { writeNativeProjects } from '../tests/native-fixture.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const directory = mkdtempSync(join(tmpdir(), 'threadboard-populated-'));
const store = new Store(directory);
const { project } = seedPerformance(store, join(directory, 'workspace'), 2000, 5000, 'Populated board');
const codexDirectory = join(directory, 'codex');
writeNativeProjects(codexDirectory, [{ id: project.id, name: project.name, rootPaths: project.rootPaths }]);
store.close();
const client = new Client({ name: 'populated-runtime-benchmark', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['./dist/server.mjs'], cwd: fileURLToPath(new URL('../plugins/threadboard/', import.meta.url)), env: { ...process.env, THREADBOARD_DATA_DIR: directory, THREADBOARD_CODEX_HOME: codexDirectory }, stderr: 'pipe' });
const memory: number[] = [], samples: number[] = [];
try {
  await client.connect(transport);
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    const result = await client.callTool({ name: 'get_board', arguments: { projectId: project.id, offset: (i % 10) * 200 } });
    samples.push(performance.now() - start);
    if (result.isError) throw new Error('Populated board read failed.');
    if (process.platform !== 'win32' && transport.pid) {
      const value = spawnSync('ps', ['-o','rss=','-p',String(transport.pid)], { encoding: 'utf8' });
      if (value.status === 0) memory.push(Number(value.stdout.trim()) / 1024);
    }
  }
  samples.sort((a,b) => a-b);
  const p95 = samples[Math.ceil(samples.length * .95)-1], maximum = memory.length ? Math.max(...memory) : null;
  console.log(JSON.stringify({ activeTasks: 2000, archivedTasks: 5000, pageSize: 200, samples: samples.length, stdioBoardResponseP95ms: Number(p95.toFixed(2)), observedMaxServerRSSMiB: maximum === null ? null : Number(maximum.toFixed(2)), node: process.version, platform: process.platform, measurement: 'Compiled packaged server, includes stdio/client overhead; RSS sampled after each completed response. Excludes native host/rendering and full-board exports.' }, null, 2));
  if (p95 > 1000 || (maximum !== null && maximum > 96)) throw new Error('Populated runtime exceeds the 1 second / 96 MiB prototype budget.');
} finally { await client.close(); rmSync(directory, { recursive: true, force: true }); }
