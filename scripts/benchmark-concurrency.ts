import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { seedPerformance } from '../tests/performance-fixture.js';

const directory = mkdtempSync(join(tmpdir(), 'threadboard-concurrency-'));
const database = join(directory, 'data'), store = new Store(database);
const workers: ChildProcess[] = [], pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
const histogram = (samples: number[]) => {
  samples.sort((a,b) => a-b);
  return { samples: samples.length, p50ms: Number(samples[Math.ceil(samples.length * .5)-1].toFixed(2)), p95ms: Number(samples[Math.ceil(samples.length * .95)-1].toFixed(2)) };
};
const request = (worker: ChildProcess, name: string, args: unknown): Promise<any> => new Promise((resolve, reject) => {
  const id = randomUUID(), timer = setTimeout(() => { pending.delete(id); reject(new Error('Performance worker timed out.')); }, 30_000);
  pending.set(id, { resolve, reject, timer });
  worker.send({ id, name, args }, error => { if (error) { clearTimeout(timer); pending.delete(id); reject(error); } });
});
try {
  const workloads = [seedPerformance(store, join(directory, 'baseline'), 500, 5000, 'Baseline'), seedPerformance(store, join(directory, 'stress'), 2000, 0, 'Stress')];
  await Promise.all(Array.from({ length: 4 }, () => new Promise<void>((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./performance-worker.ts', import.meta.url)), [], { execArgv: ['--import','tsx'], env: { ...process.env, THREADBOARD_PERFORMANCE_DIRECTORY: database }, stdio: ['ignore','ignore','pipe','ipc'] });
    workers.push(child);
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) { reject(new Error(`Performance worker exited with ${code}.`)); for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Performance worker exited.')); } pending.clear(); }
    });
    child.on('message', (message: any) => {
      if (message.ready) { resolve(); return; }
      const entry = pending.get(message.id); if (!entry) return;
      clearTimeout(entry.timer); pending.delete(message.id); entry.resolve(message);
    });
  })));
  const results = [];
  for (const workload of workloads) {
    await Promise.all(workers.map(worker => request(worker, 'read', { projectId: workload.project.id, offset: 0 })));
    const reads: number[] = [], writes: number[] = [];
    await Promise.all(Array.from({ length: 20 }, async (_, caller) => {
      for (let i = 0; i < 10; i++) {
        const result = await request(workers[caller % workers.length], 'read', { projectId: workload.project.id, offset: (i % Math.ceil(workload.tasks.length / 200)) * 200 });
        assert.ok(result.ok); assert.equal(result.result.total, workload.tasks.length); reads.push(result.ms);
      }
    }));
    await Promise.all(Array.from({ length: 20 }, async (_, caller) => {
      for (let i = 0; i < 5; i++) {
        const result = await request(workers[caller % workers.length], 'write', { projectId: workload.project.id, taskId: workload.tasks[caller].id, title: `Caller ${caller + 1} revision ${i + 1}` });
        assert.ok(result.ok); writes.push(result.ms);
      }
    }));
    results.push({ workload: workload.project.name, activeTasks: workload.tasks.length, archivedTasks: workload.project.name === 'Baseline' ? 5000 : 0, reads: histogram(reads), writes: histogram(writes) });
  }
  const stress = workloads[1], raced = stress.tasks[100];
  const claims = await Promise.all(Array.from({ length: 100 }, (_, index) => request(workers[index % workers.length], 'claim', { projectId: stress.project.id, taskId: raced.id, version: raced.version, attemptId: randomUUID(), token: randomUUID() + randomUUID(), owner: `Caller ${index + 1}` })));
  assert.equal(claims.filter(result => result.ok).length, 1);
  assert.ok(claims.filter(result => !result.ok).every(result => result.code === 'ALREADY_CLAIMED'));
  console.log(JSON.stringify({ workers: workers.length, activeCallers: 20, results, claimRequests: 100, claimWinners: 1, claimFailures: 99, claimTiming: histogram(claims.map(result => result.ms)), node: process.version, platform: process.platform, cpu: cpus()[0]?.model, measurement: 'Time inside local storage calls, including SQLite lock contention and excluding IPC/host overhead. Twenty callers share four worker processes; each process serializes its calls.' }, null, 2));
  if (results.some(result => result.reads.p95ms > 25 || result.writes.p95ms > 50)) throw new Error('Concurrent storage exceeds the 25ms read / 50ms write p95 budget.');
} finally {
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Benchmark stopped.')); }
  await Promise.all(workers.map(worker => new Promise<void>(resolve => { if (worker.exitCode !== null) return resolve(); worker.once('exit', () => resolve()); worker.kill('SIGTERM'); })));
  store.close(); rmSync(directory, { recursive: true, force: true });
}
