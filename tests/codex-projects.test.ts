import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { CodexProjects } from '../src/codex-projects.js';
import { Store } from '../src/store.js';
import { invoke, freshClaim } from '../src/api.js';
import { BoardError } from '../src/types.js';
import { nativeProject, writeNativeProjects } from './native-fixture.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'threadboard-native-projects-'));
  const home = join(root, 'codex');
  const native = [nativeProject('Existing Codex project', join(root, 'workspace'), 'local-native-project')];
  writeNativeProjects(home, native);
  const source = new CodexProjects(home);
  const store = new Store(join(root, 'data'), source);
  return { root, home, native, source, store, cleanup: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('existing Codex projects get empty boards with native IDs and no project creation tool', () => {
  const f = fixture(); try {
    const before = readFileSync(join(f.home, '.codex-global-state.json'), 'utf8');
    const data = invoke(f.store, 'open_project_board', {});
    assert.equal(data.projects[0].id, f.native[0].id);
    assert.equal(data.board, null); assert.equal(data.boards.length, 1);
    assert.equal(data.boards[0].name, 'General'); assert.equal(data.boards[0].taskCount, 0);
    const opened = invoke(f.store, 'open_project_board', { projectId: f.native[0].id });
    assert.equal(opened.board.total, 0); assert.deepEqual(opened.board.tasks, []);
    assert.equal(invoke(f.store, 'open_project_board', { root: f.native[0].rootPaths[0] }).board.project.id, f.native[0].id);
    assert.throws(() => invoke(f.store, 'create_project', { name: 'Extra', root: f.root }), (e: any) => e.code === 'UNKNOWN_TOOL');
    assert.equal(readFileSync(join(f.home, '.codex-global-state.json'), 'utf8'), before);
  } finally { f.cleanup(); }
});

test('overview lists every native board and active counts without task content or removed projects', () => {
  const f = fixture(); try {
    const second = nativeProject('Another project', join(f.root, 'second'));
    writeNativeProjects(f.home, [...f.native, second]);
    const projectId = f.native[0].id;
    const { board } = invoke(f.store, 'create_board', { projectId, name: 'Release', operationId: randomUUID() });
    invoke(f.store, 'create_task', { projectId, boardId: board.id, title: 'Private content', description: 'Private context', operationId: randomUUID() });
    const completed = invoke(f.store, 'create_task', { projectId, boardId: board.id, title: 'Finished content', operationId: randomUUID() }).task;
    invoke(f.store, 'move_task', { projectId, taskId: completed.id, version: completed.version, status: 'done' });
    const hidden = invoke(f.store, 'create_task', { projectId, boardId: board.id, title: 'Archived content', operationId: randomUUID() }).task;
    invoke(f.store, 'archive_task', { projectId, taskId: hidden.id, version: hidden.version, archived: true });
    const data = invoke(f.store, 'open_project_board', {});
    assert.equal(data.board, null); assert.equal(data.boards.length, 3);
    assert.deepEqual(data.boards.filter((b: any) => b.name === 'General').map((b: any) => b.taskCount), [0, 0]);
    assert.equal(data.boards.find((b: any) => b.id === board.id).taskCount, 2);
    assert.equal(data.boards.find((b: any) => b.id === board.id).doneCount, 1);
    assert.doesNotMatch(JSON.stringify(data), /Private|Finished content|Archived content/);
    assert.equal(invoke(f.store, 'open_project_board', { projectId, boardId: board.id }).board.board.id, board.id);
    writeNativeProjects(f.home, [second]);
    const refreshed = invoke(f.store, 'list_projects', {});
    assert.equal(refreshed.boards.length, 1); assert.equal(refreshed.boards[0].projectId, second.id);
    assert.equal((f.store.db.prepare('SELECT COUNT(*) AS n FROM boards').get() as any).n, 3);
  } finally { f.cleanup(); }
});

test('native renames and removals refresh without deleting stored tasks', () => {
  const f = fixture(); try {
    invoke(f.store, 'list_projects', {});
    const task = invoke(f.store, 'create_task', { projectId: f.native[0].id, title: 'Preserved work', operationId: randomUUID() }).task;
    writeNativeProjects(f.home, [{ ...f.native[0], name: 'Renamed in Codex' }]);
    assert.equal(invoke(f.store, 'list_projects', {}).projects[0].name, 'Renamed in Codex');
    writeNativeProjects(f.home, []);
    assert.deepEqual(invoke(f.store, 'list_projects', {}).projects, []);
    assert.throws(() => invoke(f.store, 'get_task', { projectId: f.native[0].id, taskId: task.id }), (e: any) => e.code === 'PROJECT_NOT_IN_CODEX');
    assert.equal((f.store.db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as any).n, 1);
    writeNativeProjects(f.home, f.native);
    assert.equal(invoke(f.store, 'get_task', { projectId: f.native[0].id, taskId: task.id }).task.title, 'Preserved work');
  } finally { f.cleanup(); }
});

test('multi-root projects and distinct native projects sharing a root remain distinct', () => {
  const f = fixture(); try {
    const other = nativeProject('Second project', join(f.root, 'other'));
    writeNativeProjects(f.home, [{ ...f.native[0], rootPaths: [...f.native[0].rootPaths, ...other.rootPaths] }]);
    assert.equal(invoke(f.store, 'open_project_board', { root: other.rootPaths[0] }).board.project.id, f.native[0].id);
    writeNativeProjects(f.home, [f.native[0], { ...other, rootPaths: f.native[0].rootPaths }]);
    const projects = invoke(f.store, 'list_projects', {}).projects;
    assert.equal(projects.length, 2);
    assert.throws(() => invoke(f.store, 'open_project_board', { root: f.native[0].rootPaths[0] }), (e: any) => e.code === 'AMBIGUOUS_PROJECT');
    assert.equal(invoke(f.store, 'get_board', { projectId: other.id }).total, 0);
  } finally { f.cleanup(); }
});

test('ChatGPT project mirrors are excluded from native local Codex boards', () => {
  const f = fixture(); try {
    writeNativeProjects(f.home, [...f.native, { id: 'g-p-cloud-project', name: 'Cloud mirror', rootPaths: [f.root] }]);
    assert.deepEqual(invoke(f.store, 'list_projects', {}).projects.map((p: any) => p.id), [f.native[0].id]);
    assert.equal((f.store.db.prepare('SELECT COUNT(*) AS n FROM projects').get() as any).n, 1);
  } finally { f.cleanup(); }
});

test('a new native project at a removed project root starts empty', () => {
  const f = fixture(); try {
    const original = f.native[0];
    const task = invoke(f.store, 'create_task', { projectId: original.id, title: 'Original project work', operationId: randomUUID() }).task;
    const replacement = { ...original, id: 'different-native-project', name: 'New Codex project' };
    writeNativeProjects(f.home, [replacement]);
    assert.equal(invoke(f.store, 'get_board', { projectId: replacement.id }).total, 0);
    assert.equal((f.store.db.prepare('SELECT project_id FROM tasks WHERE id=?').get(task.id) as any).project_id, original.id);
    writeNativeProjects(f.home, [original, replacement]);
    assert.equal(invoke(f.store, 'get_task', { projectId: original.id, taskId: task.id }).task.title, 'Original project work');
  } finally { f.cleanup(); }
});

test('an unavailable native workspace can show its board but cannot reserve a launch', () => {
  const f = fixture(); try {
    const task = invoke(f.store, 'create_task', { projectId: f.native[0].id, title: 'Workspace work', status: 'ready', operationId: randomUUID() }).task;
    rmSync(f.native[0].rootPaths[0], { recursive: true });
    assert.equal(invoke(f.store, 'get_board', { projectId: f.native[0].id }).total, 1);
    assert.throws(() => invoke(f.store, 'prepare_task_launch', { projectId: f.native[0].id, taskId: task.id, version: task.version, ...freshClaim() }), (e: any) => e.code === 'WORKSPACE_UNAVAILABLE');
    assert.equal((f.store.db.prepare('SELECT COUNT(*) AS n FROM runs').get() as any).n, 0);
  } finally { f.cleanup(); }
});

test('project discovery caches unchanged metadata, exposes no unrelated state, and fails safely on malformed state', () => {
  const f = fixture(); try {
    const file = join(f.home, '.codex-global-state.json');
    const first = f.source.list(); assert.equal(first, f.source.list());
    invoke(f.store, 'list_projects', {});
    const before = f.store.db.prepare('SELECT total_changes() AS n').get();
    writeFileSync(file, JSON.stringify({ 'local-projects': Object.fromEntries(f.native.map(p => [p.id, p])), 'prompt-history': ['Private fixture text'], 'sidebar-width': 200 }));
    assert.equal(first, f.source.list());
    assert.equal(JSON.stringify(f.source.list()).includes('Private fixture text'), false);
    invoke(f.store, 'list_projects', {});
    assert.deepEqual(f.store.db.prepare('SELECT total_changes() AS n').get(), before);
    writeFileSync(file, '{invalid');
    assert.throws(() => f.source.list(), (e: unknown) => e instanceof BoardError && e.code === 'CODEX_PROJECTS_UNAVAILABLE');
    assert.equal(readFileSync(file, 'utf8'), '{invalid');
  } finally { f.cleanup(); }
});

test('missing or empty desktop registries do not adopt unrelated Codex database IDs', () => {
  const root = mkdtempSync(join(tmpdir(), 'threadboard-native-sqlite-'));
  try {
    const file = join(root, 'state_5.sqlite');
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE projects(id TEXT,name TEXT,position INTEGER); CREATE TABLE project_roots(project_id TEXT,path TEXT,position INTEGER); CREATE TABLE threads(id TEXT,first_user_message TEXT);");
    db.prepare('INSERT INTO projects VALUES(?,?,?)').run('native-sqlite-id', 'Native project', 0);
    db.prepare('INSERT INTO project_roots VALUES(?,?,?)').run('native-sqlite-id', root, 0);
    db.prepare('INSERT INTO threads VALUES(?,?)').run('unrelated-chat', 'Private chat fixture'); db.close();
    const before = readFileSync(file);
    const source = new CodexProjects(root);
    assert.deepEqual(source.list(), []);
    assert.deepEqual(readFileSync(file), before);
    writeNativeProjects(root, []);
    assert.deepEqual(source.list(), []);
    writeFileSync(join(root, '.codex-global-state.json'), JSON.stringify({ 'old-project-format': [] }));
    assert.throws(() => source.list(), (e: any) => e.code === 'CODEX_PROJECTS_UNAVAILABLE');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('version-one boards migrate to native projects without losing tasks, claims, retries, or notes', () => {
  const f = fixture();
  const legacyId = randomUUID(), operationId = randomUUID(), claim = freshClaim();
  try {
    f.store.syncProjects([{ ...f.native[0], id: legacyId }]);
    const task = f.store.createTask({ projectId: legacyId, title: 'Legacy work', status: 'ready', operationId });
    const run = f.store.claim({ projectId: legacyId, taskId: task.id, version: task.version, owner: 'Existing owner', ...claim });
    f.store.note({ projectId: legacyId, taskId: task.id, runId: run.run.id, token: claim.token, note: 'Keep this activity' });
    f.store.db.exec(`PRAGMA foreign_keys=OFF;
      DROP TRIGGER task_board_insert; DROP TRIGGER task_board_update;
      DROP INDEX tasks_board_page; DROP INDEX tasks_board_counts;
      ALTER TABLE tasks DROP COLUMN board_id; DROP TABLE boards;
      CREATE TABLE projects_v1(id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL,next_number INTEGER NOT NULL,created_at TEXT NOT NULL);
      INSERT INTO projects_v1 SELECT id,name,root,revision,next_number,created_at FROM projects;
      DROP TABLE project_aliases; DROP TABLE projects; ALTER TABLE projects_v1 RENAME TO projects;
      PRAGMA user_version=1;`);
    f.store.close();
    const migrated = new Store(join(f.root, 'data'), f.source);
    try {
      const detail = invoke(migrated, 'get_task', { projectId: legacyId, taskId: task.id });
      assert.equal(detail.task.projectId, f.native[0].id);
      assert.equal(detail.task.run.id, run.run.id);
      assert.ok(detail.events.some((e: any) => e.note === 'Keep this activity'));
      assert.equal(invoke(migrated, 'create_task', { projectId: f.native[0].id, title: 'Retry', operationId }).task.id, task.id);
      const next = invoke(migrated, 'create_task', { projectId: f.native[0].id, title: 'Next work', operationId: randomUUID() }).task;
      assert.equal(next.number, 2);
      assert.equal(invoke(migrated, 'submit_task', { projectId: legacyId, taskId: task.id, runId: run.run.id, token: claim.token, note: 'Still owned' }).task.status, 'review');
      assert.equal(migrated.db.prepare('PRAGMA foreign_key_check').all().length, 0);
    } finally { migrated.close(); }
  } finally { try { f.cleanup(); } catch { rmSync(f.root, { recursive: true, force: true }); } }
});
