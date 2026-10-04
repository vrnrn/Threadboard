import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.js';
import { invoke, freshClaim } from '../src/api.js';
import { BoardError } from '../src/types.js';
import { nativeProject } from './native-fixture.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'threadboard-test-'));
  const directory = join(root, 'data');
  const records = [nativeProject('Test workspace', root)];
  const store = new Store(directory, { list: () => records });
  store.syncProjects(records);
  const project = store.projects()[0];
  const create = (title = 'A clear goal') => store.createTask({ projectId: project.id, title, criteria: 'A verifiable result', status: 'ready', operationId: randomUUID() });
  const cleanup = () => { store.close(); rmSync(root, { recursive: true, force: true }); };
  return { root, directory, store, project, create, cleanup };
}
function code(expected: string) { return (error: unknown) => error instanceof BoardError && error.code === expected; }

test('local task content persists across restart and creation retries are idempotent', () => {
  const f = fixture();
  try {
    const operationId = randomUUID();
    const first = f.store.createTask({ projectId: f.project.id, title: 'Persistent work', description: 'Local context', operationId });
    const retry = f.store.createTask({ projectId: f.project.id, title: 'Should not replace the first task', operationId });
    assert.equal(retry.id, first.id); assert.equal(f.store.board(f.project.id).total, 1);
    f.store.close(); const reopened = new Store(f.directory);
    assert.equal(reopened.detail(f.project.id, first.id).task.description, 'Local context'); reopened.close();
  } finally { try { f.cleanup(); } catch { rmSync(f.root, { recursive: true, force: true }); } }
});

test('stale content edits fail without overwriting another chat’s changes', () => {
  const f = fixture(); try {
    const task = f.create();
    f.store.edit({ projectId: f.project.id, taskId: task.id, version: task.version, title: 'Newer title' });
    assert.throws(() => f.store.edit({ projectId: f.project.id, taskId: task.id, version: task.version, title: 'Stale title' }), code('VERSION_CONFLICT'));
    assert.equal(f.store.detail(f.project.id, task.id).task.title, 'Newer title');
  } finally { f.cleanup(); }
});

test('claims enforce ownership, submissions require its token, and acceptance is explicit', () => {
  const f = fixture(); try {
    const task = f.create();
    const claim = f.store.claim({ projectId: f.project.id, taskId: task.id, version: task.version, ...freshClaim(), owner: 'Working chat' });
    assert.equal(claim.task.status, 'in_progress');
    assert.throws(() => f.store.claim({ projectId: f.project.id, taskId: task.id, version: claim.task.version, ...freshClaim(), owner: 'Another chat' }), code('ALREADY_CLAIMED'));
    assert.throws(() => f.store.note({ projectId: f.project.id, taskId: task.id, runId: claim.run.id, token: randomUUID(), note: 'Cannot submit', submit: true }), code('INVALID_CLAIM'));
    const result = f.store.note({ projectId: f.project.id, taskId: task.id, runId: claim.run.id, token: claim.token, note: 'Implemented and verified', submit: true });
    assert.equal(result.task.status, 'review');
    const accepted = f.store.move({ projectId: f.project.id, taskId: task.id, version: result.task.version, status: 'done' });
    assert.equal(accepted.status, 'done');
    assert.ok(f.store.detail(f.project.id, task.id).events.some(e => e.note === 'Implemented and verified'));
  } finally { f.cleanup(); }
});

test('prerequisites reject cycles and prevent work until completion', () => {
  const f = fixture(); try {
    const first = f.create('First'), next = f.create('Next');
    const dependent = f.store.dependency({ projectId: f.project.id, taskId: next.id, version: next.version, prerequisiteId: first.id });
    assert.throws(() => f.store.dependency({ projectId: f.project.id, taskId: first.id, version: first.version, prerequisiteId: next.id }), code('DEPENDENCY_CYCLE'));
    assert.throws(() => f.store.claim({ projectId: f.project.id, taskId: next.id, version: dependent.version, ...freshClaim(), owner: 'Chat' }), code('PREREQUISITE'));
    f.store.move({ projectId: f.project.id, taskId: first.id, version: first.version, status: 'done' });
    assert.equal(f.store.claim({ projectId: f.project.id, taskId: next.id, version: dependent.version, ...freshClaim(), owner: 'Chat' }).task.status, 'in_progress');
  } finally { f.cleanup(); }
});

test('a prepared launch does not start work, binds once, and can be released', () => {
  const f = fixture(); try {
    const task = f.create();
    const launch = invoke(f.store, 'prepare_task_launch', { projectId: f.project.id, taskId: task.id, version: task.version, ...freshClaim() });
    assert.equal(launch.run.state, 'launching'); assert.equal(launch.task.status, 'ready');
    const link = new URL(launch.url); assert.equal(link.protocol, 'codex:'); assert.equal(link.searchParams.get('path'), f.project.root);
    assert.ok(link.searchParams.get('prompt')?.includes(launch.run.id));
    assert.throws(() => f.store.move({ projectId: f.project.id, taskId: task.id, version: launch.task.version, status: 'in_progress' }), code('CLAIM_REQUIRED'));
    const threadId = randomUUID();
    const bound = f.store.bind({ projectId: f.project.id, runId: launch.run.id, token: launch.token, owner: 'New chat', threadId });
    assert.equal(bound.task.status, 'in_progress'); assert.equal(bound.run.threadId, threadId);
    assert.throws(() => f.store.bind({ projectId: f.project.id, runId: launch.run.id, token: launch.token, owner: 'Other chat', threadId: randomUUID() }), code('ALREADY_BOUND'));
    const released = f.store.release({ projectId: f.project.id, taskId: task.id, version: bound.task.version });
    assert.equal(released.run, null); assert.equal(released.status, 'ready');
  } finally { f.cleanup(); }
});

test('archiving preserves content and runs, and board pagination never silently drops tasks', () => {
  const f = fixture(); try {
    for (let i = 0; i < 205; i++) f.create(`Task ${i}`);
    const first = f.store.board(f.project.id); assert.equal(first.tasks.length, 200); assert.equal(first.nextOffset, 200); assert.equal(first.total, 205);
    assert.equal(f.store.board(f.project.id, first.nextOffset!).tasks.length, 5);
    const t = first.tasks[0]; f.store.archive({ projectId: f.project.id, taskId: t.id, version: t.version, archived: true });
    assert.equal(f.store.board(f.project.id).total, 204); assert.equal(f.store.board(f.project.id, 0, true).total, 1);
    assert.equal(f.store.exportProject(f.project.id).tasks.length, 205);
  } finally { f.cleanup(); }
});

test('API schemas reject extra fields, empty titles, and projects not created in Codex', () => {
  const f = fixture(); try {
    assert.throws(() => invoke(f.store, 'create_task', { projectId: f.project.id, title: ' ', operationId: randomUUID() }));
    assert.throws(() => invoke(f.store, 'list_projects', { transcript: 'do not accept chat data' }));
    assert.throws(() => invoke(f.store, 'create_project', { name: 'Not allowed', root: f.root }), code('UNKNOWN_TOOL'));
    assert.throws(() => invoke(f.store, 'open_project_board', { root: join(f.root, 'unregistered') }), code('PROJECT_NOT_IN_CODEX'));
    assert.throws(() => invoke(f.store, 'create_task', { projectId: randomUUID(), title: 'Unknown project', operationId: randomUUID() }), code('PROJECT_NOT_IN_CODEX'));
    assert.equal(f.store.projects().length, 1);
  } finally { f.cleanup(); }
});

test('readable exports include all deliberately written notes beyond the detail window', () => {
  const f = fixture(); try {
    const task = f.create();
    for (let i = 0; i < 70; i++) f.store.note({ projectId: f.project.id, taskId: task.id, note: `Note ${i}` });
    assert.equal(f.store.detail(f.project.id, task.id).events.length, 50);
    const exported = f.store.exportProject(f.project.id);
    assert.equal(exported.tasks[0].events.length, 71);
    assert.ok(exported.tasks[0].events.some(e => e.note === 'Note 0'));
  } finally { f.cleanup(); }
});

test('six independent server processes race for one task and exactly one owner succeeds', async () => {
  const f = fixture(); try {
    const task = f.create();
    const worker = new URL('./claim-worker.ts', import.meta.url);
    const results = await Promise.all(Array.from({ length: 6 }, () => new Promise<any>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(worker)], { env: { ...process.env, THREADBOARD_RACE_INPUT: JSON.stringify({ directory: f.directory, projectId: f.project.id, taskId: task.id, version: task.version }) }, stdio: ['ignore','pipe','pipe'] });
      let output = '', stderr = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => stderr += data);
      child.on('error', reject); child.on('exit', exit => exit === 0 ? resolve(JSON.parse(output)) : reject(new Error(stderr)));
    })));
    assert.equal(results.filter(r => r.ok).length, 1);
    assert.ok(results.filter(r => !r.ok).every(r => r.code === 'ALREADY_CLAIMED'));
    assert.equal(f.store.detail(f.project.id, task.id).task.run?.state, 'running');
  } finally { f.cleanup(); }
});
