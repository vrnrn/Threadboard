import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Store } from '../src/store.js';
import { fixtureBoard } from '../tests/native-fixture.js';
const directory = mkdtempSync(join(tmpdir(), 'threadboard-benchmark-'));
const store = new Store(join(directory, 'data'));
try {
  const project = fixtureBoard(store, 'Benchmark', directory);
  for (let i = 0; i < 2000; i++) store.createTask({ projectId: project.id, title: `Representative task ${i}`, description: 'Local context. '.repeat(550), criteria: 'Check the result. '.repeat(200), operationId: randomUUID() });
  const samples: number[] = [];
  let bytes = 0;
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    const board = store.board(project.id, (i % 10) * 200);
    samples.push(performance.now() - start); bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(board)));
  }
  samples.sort((a,b) => a-b);
  const p95 = samples[94];
  console.log(JSON.stringify({ tasks: 2000, pageSize: 200, samples: 100, readP50ms: Number(samples[49].toFixed(2)), readP95ms: Number(p95.toFixed(2)), maxPageBytes: bytes, node: process.version, platform: process.platform }, null, 2));
  if (p95 > 50) throw new Error('Board reads exceeded the 50ms p95 local performance budget.');
} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
