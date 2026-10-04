import { mkdtempSync, rmSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../src/store.js';
import { CodexProjects } from '../src/codex-projects.js';
import { invoke } from '../src/api.js';
import { seedPerformance } from '../tests/performance-fixture.js';
import { writeNativeProjects } from '../tests/native-fixture.js';

const directory = mkdtempSync(join(tmpdir(), 'threadboard-live-benchmark-'));
const codexHome = join(directory, 'codex');
const store = new Store(directory, new CodexProjects(codexHome));
const client = new Client({ name: 'live-revision-benchmark', version: '1' });
let closed = false;
try {
  const { project } = seedPerformance(store, join(directory, 'workspace'), 2000, 5000, 'Live benchmark');
  writeNativeProjects(codexHome, [{ id: project.id, name: project.name, rootPaths: project.rootPaths }]);
  const baseline = invoke(store, 'get_board_revision', {});
  const writes = (store.db.prepare('SELECT total_changes() AS n').get() as any).n;
  const direct: number[] = [], beforeCpu = process.cpuUsage();
  for (let i = 0; i < 10_000; i++) {
    const start = performance.now(), result = invoke(store, 'get_board_revision', {});
    direct.push(performance.now() - start);
    if (result.revision !== baseline.revision) throw new Error('Idle revision changed.');
  }
  const cpu = process.cpuUsage(beforeCpu);
  if ((store.db.prepare('SELECT total_changes() AS n').get() as any).n !== writes) throw new Error('Revision checks wrote to storage.');
  const overview: number[] = [];
  let overviewPayloadBytes = 0;
  for (let i = 0; i < 100; i++) {
    const start = performance.now(), result = invoke(store, 'list_projects', {});
    overview.push(performance.now() - start);
    const json = JSON.stringify(result);
    overviewPayloadBytes = Math.max(overviewPayloadBytes, Buffer.byteLength(json));
    if (result.boards.length !== 1 || result.boards[0].taskCount !== 2000 || json.includes('Representative')) throw new Error('Overview summaries are incorrect or contain task content.');
  }
  overview.sort((a, b) => a - b);
  const registry = join(codexHome, '.codex-global-state.json');
  const catalogue = JSON.parse(readFileSync(registry, 'utf8'));
  const rereads: number[] = [];
  let registryBytes = 0;
  for (let i = 0; i < 30; i++) {
    const json = JSON.stringify({ ...catalogue, fixtureUnrelatedState: 'x'.repeat(1024 * 1024), fixtureCounter: i });
    writeFileSync(registry, json); registryBytes = Buffer.byteLength(json);
    const timestamp = Date.now() / 1000 + i; utimesSync(registry, timestamp, timestamp);
    const start = performance.now(), result = invoke(store, 'get_board_revision', {});
    rereads.push(performance.now() - start);
    if (result.revision !== baseline.revision) throw new Error('Unrelated metadata caused a board reload.');
  }
  if ((store.db.prepare('SELECT total_changes() AS n').get() as any).n !== writes) throw new Error('Unrelated metadata caused storage writes.');
  store.close(); closed = true;
  const transport = new StdioClientTransport({ command: process.execPath, args: ['./dist/server.mjs'], cwd: fileURLToPath(new URL('../plugins/threadboard/', import.meta.url)), env: { ...process.env, THREADBOARD_DATA_DIR: directory, THREADBOARD_CODEX_HOME: codexHome }, stderr: 'pipe' });
  await client.connect(transport);
  const stdio: number[] = [];
  let payloadBytes = 0;
  for (let i = 0; i < 500; i++) {
    const start = performance.now();
    const result = await client.callTool({ name: 'get_board_revision', arguments: {} });
    stdio.push(performance.now() - start);
    if (result.isError || Object.keys(result.structuredContent!).join() !== 'revision') throw new Error('Revision response exposed unexpected data.');
    payloadBytes = Math.max(payloadBytes, Buffer.byteLength(JSON.stringify(result.structuredContent)));
  }
  direct.sort((a, b) => a - b); stdio.sort((a, b) => a - b); rereads.sort((a, b) => a - b);
  const localP95 = direct[9499], stdioP95 = stdio[474];
  console.log(JSON.stringify({ activeTasks: 2000, archivedTasks: 5000, directChecks: direct.length, localCheckP95ms: Number(localP95.toFixed(4)), cpuMillisecondsPerLocalCheck: Number(((cpu.user + cpu.system) / 1000 / direct.length).toFixed(4)), stdioChecks: stdio.length, stdioCheckP95ms: Number(stdioP95.toFixed(3)), revisionPayloadBytes: payloadBytes, overviewReadP95ms: Number(overview[94].toFixed(3)), overviewPayloadBytes, syntheticRegistryBytes: registryBytes, changedRegistryCheckP95ms: Number(rereads[28].toFixed(3)), storageWritesDuringChecks: 0, note: 'Local checks include native project metadata stat/cache and SQLite revision reads. Overview reads aggregate active board counts without task content. The changed-registry fixture reparses 1 MiB of unrelated metadata without invalidating board snapshots. Stdio timings include the packaged server/client round trip; exclude Codex native bridge overhead.' }, null, 2));
  if (overview[94] > 25 || overviewPayloadBytes > 4096) throw new Error('Overview summary budget exceeded.');
  if (localP95 > 1 || stdioP95 > 10 || payloadBytes > 100 || rereads[28] > 20) throw new Error('Lightweight revision-check budget exceeded.');
} finally { if (!closed) store.close(); await client.close(); rmSync(directory, { recursive: true, force: true }); }
