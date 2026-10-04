import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const samples = [], memory = [], directory = mkdtempSync(join(tmpdir(), 'threadboard-startup-'));
const codexDirectory = join(directory, 'codex');
mkdirSync(codexDirectory);
writeFileSync(join(codexDirectory, '.codex-global-state.json'), JSON.stringify({ 'local-projects': Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
  const id = `native-startup-project-${index}`;
  return [id, { id, name: `Project ${index + 1}`, rootPaths: [directory] }];
})) }));
try {
  for (let i = 0; i < 12; i++) {
    const client = new Client({ name: 'startup-benchmark', version: '1' });
    const transport = new StdioClientTransport({ command: process.execPath, args: ['./dist/server.mjs'], cwd: fileURLToPath(new URL('../plugins/threadboard/', import.meta.url)), env: { ...process.env, THREADBOARD_DATA_DIR: directory, THREADBOARD_CODEX_HOME: codexDirectory }, stderr: 'pipe' });
    try {
      const start = performance.now(); await client.connect(transport); const result = await client.callTool({ name: 'open_project_board', arguments: {} }); samples.push(performance.now() - start);
      if (result.isError || result.structuredContent.projects.length !== 10) throw new Error('Native project discovery failed.');
      if (process.platform !== 'win32' && transport.pid) {
        const result = spawnSync('ps', ['-o','rss=','-p',String(transport.pid)], { encoding: 'utf8' });
        if (result.status === 0) memory.push(Number(result.stdout.trim()) / 1024);
      }
    } finally { await client.close(); }
  }
  samples.sort((a,b) => a-b);
  const p95 = samples[Math.ceil(samples.length * .95) - 1], peak = memory.length ? Math.max(...memory) : null;
  console.log(JSON.stringify({ samples: samples.length, nativeProjects: 10, freshProcessFirstBoardP95ms: Number(p95.toFixed(2)), observedMaxServerRSSMiB: peak === null ? null : Number(peak.toFixed(2)), platform: process.platform, node: process.version, cpu: cpus()[0]?.model, cpuCount: cpus().length, note: 'Fresh processes; filesystem cache may be warm. RSS measured after discovering ten native projects with empty boards.' }, null, 2));
  if (p95 > 1000 || (peak !== null && peak > 96)) throw new Error('Local startup exceeds the 1 second / 96 MiB prototype budget.');
} finally { rmSync(directory, { recursive: true, force: true }); }
