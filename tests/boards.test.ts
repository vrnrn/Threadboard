import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/store.js';
import { freshClaim, invoke } from '../src/api.js';
import { nativeProject } from './native-fixture.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'threadboard-boards-'));
  const projects = [nativeProject('First', join(root, 'first')), nativeProject('Second', join(root, 'second'))];
  const source = { list: () => projects };
  const directory = join(root, 'data');
  const store = new Store(directory, source); store.syncProjects(projects);
  return { root, projects, source, directory, store, close() { store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('revision checks detect other connections, own writes, catalogue removals, and server restarts without fetching content', () => {
  const f = fixture();
  const writer = new Store(f.directory, f.source); writer.syncProjects(f.projects);
  try {
    const checkpoint = () => invoke(f.store, 'get_board_revision', {});
    const initial = checkpoint();
    const writes = (f.store.db.prepare('SELECT total_changes() AS n').get() as any).n;
    for (let i = 0; i < 100; i++) assert.deepEqual(checkpoint(), initial);
    assert.equal((f.store.db.prepare('SELECT total_changes() AS n').get() as any).n, writes);
    assert.deepEqual(Object.keys(initial), ['revision']);
    assert.ok(Buffer.byteLength(JSON.stringify(initial)) < 100);
    const task = writer.createTask({ projectId: f.projects[0].id, title: 'Private content must not enter the revision response', operationId: randomUUID() });
    const external = checkpoint(); assert.notEqual(external.revision, initial.revision);
    assert.ok(!JSON.stringify(external).includes('Private'));
    f.store.note({ projectId: task.projectId, taskId: task.id, note: 'Own connection change' });
    const own = checkpoint(); assert.notEqual(own.revision, external.revision);
    f.source.list = () => [];
    const removed = checkpoint(); assert.notEqual(removed.revision, own.revision);
    assert.deepEqual(checkpoint(), removed);
    const restarted = new Store(f.directory, f.source);
    try { assert.notEqual(invoke(restarted, 'get_board_revision', {}).revision, removed.revision); }
    finally { restarted.close(); }
  } finally { writer.close(); f.close(); }
});

test('named boards isolate tasks, archive, counts, pagination, exports, and dependencies', () => {
  const f = fixture(); try {
    const projectId = f.projects[0].id;
    const general = f.store.boards(projectId)[0];
    const release = f.store.createBoard({ projectId, name: 'Release', operationId: randomUUID() });
    const old = f.store.createTask({ projectId, title: 'General card', operationId: randomUUID() });
    const card = f.store.createTask({ projectId, boardId: release.id, title: 'Release card', operationId: randomUUID() });
    assert.equal(old.boardId, general.id); assert.equal(card.number, old.number + 1);
    assert.deepEqual(f.store.board(projectId).tasks.map(t => t.id), [old.id]);
    assert.deepEqual(f.store.board(projectId, 0, false, release.id).tasks.map(t => t.id), [card.id]);
    assert.throws(() => f.store.dependency({ projectId, taskId: card.id, version: card.version, prerequisiteId: old.id }), (e: any) => e.code === 'CROSS_BOARD_DEPENDENCY');
    f.store.archive({ projectId, taskId: card.id, version: card.version, archived: true });
    assert.equal(f.store.board(projectId, 0, true, release.id).total, 1);
    assert.equal(f.store.board(projectId, 0, true, general.id).total, 0);
    assert.deepEqual(f.store.exportProject(projectId, release.id).tasks.map(t => t.task.id), [card.id]);
    assert.equal(f.store.boards(projectId).find(b => b.id === general.id)?.taskCount, 1);
    assert.throws(() => f.store.board(f.projects[1].id, 0, false, release.id), (e: any) => e.code === 'BOARD_NOT_FOUND');
    assert.throws(() => f.store.createTask({ projectId: f.projects[1].id, boardId: release.id, title: 'Wrong board', operationId: randomUUID() }), (e: any) => e.code === 'BOARD_NOT_FOUND');
    assert.throws(() => f.store.db.prepare('UPDATE tasks SET board_id=? WHERE id=?').run(f.store.boards(f.projects[1].id)[0].id, old.id));
  } finally { f.close(); }
});

test('board creation and chat requests are idempotent and conflicting bindings preserve the first chat', () => {
  const f = fixture(); try {
    const projectId = f.projects[0].id, operationId = randomUUID();
    const created = invoke(f.store, 'create_board', { projectId, name: 'Release', operationId });
    const retry = invoke(f.store, 'create_board', { projectId, name: 'Changed retry name', operationId });
    assert.equal(retry.board.id, created.board.id); assert.equal(retry.board.name, 'Release');
    assert.equal(created.chat.shouldCreate, true); assert.equal(retry.chat.shouldCreate, false);
    assert.equal(created.chat.requestId, retry.chat.requestId);
    assert.equal(created.chat.title, 'Release Threadboard');
    assert.ok(created.chat.prompt.includes(projectId)); assert.ok(created.chat.prompt.includes('environment type local'));
    assert.throws(() => invoke(f.store, 'create_board', { projectId, name: 'release', operationId: randomUUID() }), (e: any) => e.code === 'BOARD_NAME_EXISTS');
    assert.throws(() => invoke(f.store, 'create_board', { projectId: f.projects[1].id, name: 'Wrong retry', operationId }), (e: any) => e.code === 'OPERATION_CONFLICT');
    const threadId = randomUUID(), input = { projectId, boardId: created.board.id, requestId: created.chat.requestId, threadId };
    assert.throws(() => invoke(f.store, 'bind_board_chat', { ...input, requestId: randomUUID() }), (e: any) => e.code === 'INVALID_CHAT_REQUEST');
    assert.equal(invoke(f.store, 'bind_board_chat', input).board.threadId, threadId);
    assert.equal(invoke(f.store, 'bind_board_chat', input).board.threadId, threadId);
    assert.throws(() => invoke(f.store, 'bind_board_chat', { ...input, threadId: randomUUID() }), (e: any) => e.code === 'ALREADY_BOUND');
    const other = invoke(f.store, 'create_board', { projectId, name: 'Other', operationId: randomUUID() });
    assert.throws(() => invoke(f.store, 'bind_board_chat', { ...input, boardId: other.board.id, requestId: other.chat.requestId }), (e: any) => e.code === 'ALREADY_BOUND');
    assert.equal(invoke(f.store, 'prepare_board_chat', { projectId, boardId: created.board.id }).shouldCreate, false);
    f.store.close();
    const reopened = new Store(f.directory, f.source);
    try { assert.equal(invoke(reopened, 'list_boards', { projectId }).boards.find((b: any) => b.id === created.board.id).threadId, threadId); }
    finally { reopened.close(); }
  } finally { try { f.close(); } catch { rmSync(f.root, { recursive: true, force: true }); } }
});

test('schema two upgrades preserve content, ownership, retry handles, and project-wide numbers on General', () => {
  const f = fixture(); try {
    const projectId = f.projects[0].id, operationId = randomUUID();
    const task = f.store.createTask({ projectId, title: 'Existing card', description: 'Keep private content', operationId });
    const claim = f.store.claim({ projectId, taskId: task.id, version: task.version, owner: 'Existing chat', ...freshClaim() });
    f.store.note({ projectId, taskId: task.id, runId: claim.run.id, token: claim.token, note: 'Keep deliberate progress' });
    f.store.db.exec(`PRAGMA foreign_keys=OFF;
      DROP TRIGGER task_board_insert; DROP TRIGGER task_board_update;
      DROP INDEX tasks_board_page; DROP INDEX tasks_board_counts;
      ALTER TABLE tasks DROP COLUMN board_id; DROP TABLE boards; PRAGMA user_version=2;`);
    f.store.close();
    const migrated = new Store(f.directory, f.source);
    try {
      const detail = invoke(migrated, 'get_task', { projectId, taskId: task.id });
      assert.equal(detail.task.description, 'Keep private content');
      assert.equal(detail.task.run.id, claim.run.id);
      assert.ok(detail.events.some((e: any) => e.note === 'Keep deliberate progress'));
      const general = invoke(migrated, 'list_boards', { projectId }).boards[0];
      assert.equal(general.name, 'General'); assert.equal(general.threadId, null); assert.equal(detail.task.boardId, general.id);
      assert.equal(invoke(migrated, 'create_task', { projectId, title: 'Retry', operationId }).task.id, task.id);
      assert.equal(invoke(migrated, 'create_task', { projectId, title: 'Next', operationId: randomUUID() }).task.number, 2);
      assert.equal(invoke(migrated, 'submit_task', { projectId, taskId: task.id, runId: claim.run.id, token: claim.token, note: 'Still owned' }).task.status, 'review');
      assert.equal((migrated.db.prepare('PRAGMA user_version').get() as any).user_version, 3);
      assert.deepEqual(migrated.db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally { migrated.close(); }
  } finally { try { f.close(); } catch { rmSync(f.root, { recursive: true, force: true }); } }
});
