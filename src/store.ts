import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { CodexProjects, canonicalRoot, type ProjectSource } from './codex-projects.js';
import { BoardError, STATUSES, type Board, type NativeProject, type Priority, type Project, type ProjectBoard, type Run, type Status, type Task, type TaskDetail } from './types.js';

type Row = Record<string, any>;
const now = () => new Date().toISOString();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function fail(code: string, message: string): never { throw new BoardError(code, message); }

export function dataDirectory(): string {
  if (process.env.THREADBOARD_DATA_DIR) {
    if (!isAbsolute(process.env.THREADBOARD_DATA_DIR)) fail('INVALID_DIRECTORY', 'THREADBOARD_DATA_DIR must be an absolute path.');
    return process.env.THREADBOARD_DATA_DIR;
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Threadboard');
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Threadboard');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'threadboard');
}

export class Store {
  readonly db: DatabaseSync;
  private statements = new Map<string, StatementSync>();
  private transactionActive = false;
  private nativeIds?: Set<string>;
  private projectSnapshot?: readonly NativeProject[];
  private readonly revisionSession = randomUUID();
  private catalogRevision = hash('[]').slice(0, 16);
  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) { statement = this.db.prepare(sql); this.statements.set(sql, statement); }
    return statement;
  }
  constructor(directory = dataDirectory(), readonly projectSource: ProjectSource = new CodexProjects()) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'threadboard.sqlite');
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=OFF;');
    this.transaction(() => {
      const version = this.prepare('PRAGMA user_version').get() as Row;
      if (version.user_version > 3) fail('NEWER_DATABASE', 'This board was created by a newer Threadboard version. Update the plugin.');
      if (version.user_version === 1) {
        // Remove the old one-board-per-directory constraint: Codex projects have
        // native IDs and may share roots or contain more than one workspace.
        this.db.exec(`CREATE TABLE projects_native (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, root TEXT NOT NULL,
          roots TEXT NOT NULL DEFAULT '[]', codex_bound INTEGER NOT NULL DEFAULT 0,
          revision INTEGER NOT NULL DEFAULT 0, next_number INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        INSERT INTO projects_native(id,name,root,revision,next_number,created_at) SELECT id,name,root,revision,next_number,created_at FROM projects;
        DROP TABLE projects;
        ALTER TABLE projects_native RENAME TO projects;`);
      }
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, root TEXT NOT NULL,
          roots TEXT NOT NULL DEFAULT '[]', codex_bound INTEGER NOT NULL DEFAULT 0,
          revision INTEGER NOT NULL DEFAULT 0, next_number INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project_aliases (
          alias_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id)
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), number INTEGER NOT NULL,
          title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', criteria TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','ready','in_progress','review','done')),
          priority TEXT NOT NULL DEFAULT 'normal', blocked_reason TEXT NOT NULL DEFAULT '',
          rank REAL NOT NULL, version INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, number)
        );
        CREATE INDEX IF NOT EXISTS tasks_board ON tasks(project_id, archived, status, rank);
        CREATE INDEX IF NOT EXISTS tasks_page ON tasks(project_id, archived, rank, number);
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), state TEXT NOT NULL,
          owner TEXT NOT NULL, thread_id TEXT, token_hash TEXT NOT NULL, attempt_id TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL, expires_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_run ON runs(task_id) WHERE state IN ('launching','running');
        CREATE INDEX IF NOT EXISTS runs_task ON runs(task_id, created_at);
        CREATE TABLE IF NOT EXISTS dependencies (
          task_id TEXT NOT NULL REFERENCES tasks(id), prerequisite_id TEXT NOT NULL REFERENCES tasks(id),
          PRIMARY KEY(task_id, prerequisite_id), CHECK(task_id <> prerequisite_id)
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id),
          task_id TEXT NOT NULL REFERENCES tasks(id), kind TEXT NOT NULL, actor TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS events_task ON events(task_id, id DESC);
        CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id));
      `);
      this.db.exec(`CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0, operation_id TEXT UNIQUE,
        thread_id TEXT UNIQUE, chat_request_id TEXT UNIQUE, created_at TEXT NOT NULL,
        UNIQUE(project_id, name COLLATE NOCASE)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS boards_default ON boards(project_id) WHERE is_default=1;
      CREATE INDEX IF NOT EXISTS boards_project ON boards(project_id, is_default DESC, created_at);`);
      if (version.user_version < 3) {
        this.db.exec('ALTER TABLE tasks ADD COLUMN board_id TEXT REFERENCES boards(id);');
        for (const p of this.prepare('SELECT id FROM projects').all() as Row[]) this.ensureDefaultBoard(p.id);
        this.db.exec(`UPDATE tasks SET board_id=(SELECT id FROM boards WHERE boards.project_id=tasks.project_id AND is_default=1);`);
      }
      this.db.exec(`CREATE INDEX IF NOT EXISTS tasks_board_page ON tasks(board_id, archived, rank, number);
        CREATE INDEX IF NOT EXISTS tasks_board_counts ON tasks(board_id, archived, status);
        CREATE TRIGGER IF NOT EXISTS task_board_insert BEFORE INSERT ON tasks
          WHEN NEW.board_id IS NULL OR NOT EXISTS(SELECT 1 FROM boards WHERE id=NEW.board_id AND project_id=NEW.project_id)
          BEGIN SELECT RAISE(ABORT, 'Task board must belong to its project'); END;
        CREATE TRIGGER IF NOT EXISTS task_board_update BEFORE UPDATE OF board_id,project_id ON tasks
          WHEN NEW.board_id IS NULL OR NOT EXISTS(SELECT 1 FROM boards WHERE id=NEW.board_id AND project_id=NEW.project_id)
          BEGIN SELECT RAISE(ABORT, 'Task board must belong to its project'); END;
        PRAGMA user_version=3;`);
      if (this.prepare('PRAGMA foreign_key_check').all().length) fail('STORAGE_ERROR', 'The board database could not be upgraded safely. Restore its backup before retrying.');
    });
    this.db.exec('PRAGMA foreign_keys=ON;');
  }
  close() { this.db.close(); }
  revision(): string {
    // data_version detects commits by other connections; total_changes covers
    // this connection. Session and catalogue tokens also cover restarts/removals.
    const external = (this.prepare('PRAGMA data_version').get() as Row).data_version;
    const local = (this.prepare('SELECT total_changes() AS n').get() as Row).n;
    return `${this.revisionSession}:${external}:${local}:${this.catalogRevision}`;
  }
  private ensureDefaultBoard(projectId: string) {
    if (!this.prepare('SELECT id FROM boards WHERE project_id=? AND is_default=1').get(projectId)) {
      this.prepare('INSERT INTO boards(id,project_id,name,is_default,created_at) VALUES(?,?,?,1,?)').run(randomUUID(), projectId, 'General', now());
    }
  }
  private boardRow(projectId: string, boardId?: string): Row {
    const row = (boardId ? this.prepare('SELECT * FROM boards WHERE id=? AND project_id=?').get(boardId, projectId)
      : this.prepare('SELECT * FROM boards WHERE project_id=? AND is_default=1').get(projectId)) as Row | undefined;
    if (!row) fail('BOARD_NOT_FOUND', 'That board does not belong to this Codex project.');
    return row;
  }
  boards(projectId?: string): ProjectBoard[] {
    return (this.prepare(`SELECT b.*,COUNT(t.id) AS task_count,COALESCE(SUM(t.status='done'),0) AS done_count
      FROM boards b LEFT JOIN tasks t ON t.board_id=b.id AND t.archived=0 ${projectId ? 'WHERE b.project_id=?' : ''}
      GROUP BY b.id ORDER BY b.is_default DESC,b.created_at,b.id`).all(...(projectId ? [projectId] : [])) as Row[])
      .filter(b => this.nativeIds?.has(b.project_id)).map(b => ({
      id: b.id, projectId: b.project_id, name: b.name, isDefault: Boolean(b.is_default), taskCount: b.task_count,
      doneCount: b.done_count, threadId: b.thread_id, chatRequestId: b.chat_request_id, createdAt: b.created_at,
    }));
  }
  createBoard(input: { projectId: string; name: string; operationId: string }): ProjectBoard {
    return this.transaction(() => {
      const prior = this.prepare('SELECT * FROM boards WHERE operation_id=?').get(input.operationId) as Row | undefined;
      if (prior) {
        if (prior.project_id !== input.projectId) fail('OPERATION_CONFLICT', 'That operation belongs to another project.');
        return this.boards(input.projectId).find(b => b.id === prior.id)!;
      }
      if (!this.projects(input.projectId).length) fail('NOT_FOUND', 'Select an existing Codex project first.');
      if (this.prepare('SELECT id FROM boards WHERE project_id=? AND name=? COLLATE NOCASE').get(input.projectId, input.name.trim())) fail('BOARD_NAME_EXISTS', 'This project already has a board with that name.');
      const id = randomUUID();
      this.prepare('INSERT INTO boards(id,project_id,name,operation_id,created_at) VALUES(?,?,?,?,?)').run(id, input.projectId, input.name.trim(), input.operationId, now());
      return this.boards(input.projectId).find(b => b.id === id)!;
    });
  }
  prepareBoardChat(projectId: string, boardId: string): { board: ProjectBoard; shouldCreate: boolean } {
    return this.transaction(() => {
      const row = this.boardRow(projectId, boardId);
      const shouldCreate = !row.thread_id && !row.chat_request_id;
      if (shouldCreate) this.prepare('UPDATE boards SET chat_request_id=? WHERE id=?').run(randomUUID(), row.id);
      return { board: this.boards(projectId).find(b => b.id === row.id)!, shouldCreate };
    });
  }
  bindBoardChat(input: { projectId: string; boardId: string; requestId: string; threadId: string }): ProjectBoard {
    return this.transaction(() => {
      const row = this.boardRow(input.projectId, input.boardId);
      if (row.chat_request_id !== input.requestId) fail('INVALID_CHAT_REQUEST', 'Use the current companion chat request for this board.');
      if (row.thread_id && row.thread_id !== input.threadId) fail('ALREADY_BOUND', 'This board already has a companion chat.');
      const other = this.prepare('SELECT id FROM boards WHERE thread_id=? AND id<>?').get(input.threadId, row.id);
      if (other) fail('ALREADY_BOUND', 'This chat is already linked to another board.');
      this.prepare('UPDATE boards SET thread_id=? WHERE id=?').run(input.threadId, row.id);
      return this.boards(input.projectId).find(b => b.id === row.id)!;
    });
  }
  private transaction<T>(fn: () => T, readOnly = false): T {
    if (this.transactionActive) return fn();
    this.db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
    this.transactionActive = true;
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.transactionActive = false; }
  }
  private row(id: string, projectId?: string): Row {
    const row = this.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Row | undefined;
    if (!row || (projectId && row.project_id !== projectId)) fail('NOT_FOUND', 'That task is not on this board.');
    return row;
  }
  private checkVersion(row: Row, expected: number) {
    if (row.version !== expected) fail('VERSION_CONFLICT', 'This task changed in another chat. Refresh to review the latest version; your draft is preserved.');
  }
  private event(row: Row, kind: string, actor: string, note = '') {
    this.prepare('INSERT INTO events(project_id,task_id,kind,actor,note,created_at) VALUES(?,?,?,?,?,?)')
      .run(row.project_id, row.id, kind, actor, note, now());
    this.prepare('UPDATE projects SET revision=revision+1 WHERE id=?').run(row.project_id);
  }
  private activeRun(taskId: string): Row | undefined {
    return this.prepare("SELECT * FROM runs WHERE task_id=? AND state IN ('launching','running')").get(taskId) as Row | undefined;
  }
  private run(raw: Row): Run {
    return { id: raw.id, taskId: raw.task_id, state: raw.state, owner: raw.owner, threadId: raw.thread_id,
      createdAt: raw.created_at, expiresAt: raw.expires_at };
  }
  private task(raw: Row, full = true, summary?: { run?: Row; dependencies: Task['dependencies'] }): Task {
    const run = summary ? summary.run : this.prepare("SELECT * FROM runs WHERE task_id=? AND (state IN ('launching','running') OR (state='submitted' AND ? IN ('review','done'))) ORDER BY created_at DESC LIMIT 1").get(raw.id, raw.status) as Row | undefined;
    const dependencies = summary ? summary.dependencies : this.prepare('SELECT t.id,t.number,t.title,t.status FROM dependencies d JOIN tasks t ON t.id=d.prerequisite_id WHERE d.task_id=? ORDER BY t.number').all(raw.id) as Row[];
    return { id: raw.id, projectId: raw.project_id, boardId: raw.board_id, number: raw.number, title: raw.title,
      description: full ? raw.description : raw.description.slice(0, 140), criteria: full ? raw.criteria : '',
      status: raw.status, priority: raw.priority, blockedReason: raw.blocked_reason,
      rank: raw.rank, version: raw.version, archived: Boolean(raw.archived), createdAt: raw.created_at,
      updatedAt: raw.updated_at, run: run ? this.run(run) : null, dependencies: dependencies as Task['dependencies'] };
  }
  private summaries(rows: Row[]): Task[] {
    if (!rows.length) return [];
    const placeholders = rows.map(() => '?').join(','), ids = rows.map(row => row.id);
    const runs = this.prepare(`SELECT r.* FROM runs r JOIN tasks t ON t.id=r.task_id WHERE r.task_id IN (${placeholders}) AND (r.state IN ('launching','running') OR (r.state='submitted' AND t.status IN ('review','done'))) ORDER BY r.created_at DESC,r.id`).all(...ids) as Row[];
    const runByTask = new Map<string, Row>();
    for (const run of runs) if (!runByTask.has(run.task_id)) runByTask.set(run.task_id, run);
    const dependencies = this.prepare(`SELECT d.task_id,t.id,t.number,t.title,t.status FROM dependencies d JOIN tasks t ON t.id=d.prerequisite_id WHERE d.task_id IN (${placeholders}) ORDER BY t.number`).all(...ids) as Row[];
    const dependenciesByTask = new Map<string, Task['dependencies']>();
    for (const row of dependencies) {
      const list = dependenciesByTask.get(row.task_id) || [];
      list.push({ id: row.id, number: row.number, title: row.title, status: row.status }); dependenciesByTask.set(row.task_id, list);
    }
    return rows.map(row => this.task(row, false, { run: runByTask.get(row.id), dependencies: dependenciesByTask.get(row.id) || [] }));
  }
  projects(projectId?: string): Project[] {
    if (this.nativeIds && (!this.nativeIds.size || (projectId && !this.nativeIds.has(projectId)))) return [];
    const ids = this.nativeIds ? [...this.nativeIds] : [];
    return (this.prepare(`SELECT p.*, COUNT(t.project_id) AS task_count,
      COALESCE(SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END),0) AS done_count
      FROM projects p LEFT JOIN tasks t ON t.project_id=p.id AND t.archived=0
      ${projectId ? 'WHERE p.id=?' : ids.length ? `WHERE p.id IN (${ids.map(() => '?').join(',')})` : ''} GROUP BY p.id ORDER BY p.name COLLATE NOCASE,p.id`).all(...(projectId ? [projectId] : ids)) as Row[]).map(p => {
      const rootPaths: string[] = JSON.parse(p.roots);
      return { id: p.id, name: p.name, root: p.root, rootPaths: rootPaths.length ? rootPaths : [p.root], revision: p.revision, taskCount: p.task_count, doneCount: p.done_count };
    });
  }
  syncProjects(projects: readonly NativeProject[]): void {
    if (projects === this.projectSnapshot) return;
    const ids = new Set(projects.map(p => p.id));
    const roots = new Map<string, Set<string>>();
    for (const project of projects) for (const root of project.rootPaths) {
      const owners = roots.get(root) || new Set<string>(); owners.add(project.id); roots.set(root, owners);
    }
    this.transaction(() => {
      const legacy = (this.prepare('SELECT * FROM projects WHERE codex_bound=0').all() as Row[])
        .map((p): Row => ({ ...p, canonicalRoot: canonicalRoot(p.root) }));
      for (const project of projects) {
        const existing = this.prepare('SELECT * FROM projects WHERE id=?').get(project.id) as Row | undefined;
        if (!existing) {
          const matches = legacy.filter(p => !ids.has(p.id)
            && project.rootPaths.includes(p.canonicalRoot) && roots.get(p.canonicalRoot)?.size === 1);
          // Ambiguous legacy boards remain saved; never guess a destination or
          // merge task numbers, claims, or history from distinct boards.
          const previous = matches.length === 1 ? matches[0] : undefined;
          this.prepare('INSERT INTO projects(id,name,root,roots,codex_bound,revision,next_number,created_at) VALUES(?,?,?,?,1,?,?,?)')
            .run(project.id, project.name, project.rootPaths[0], JSON.stringify(project.rootPaths), previous?.revision || 0, previous?.next_number || 1, previous?.created_at || now());
          if (previous) {
            this.prepare('UPDATE boards SET project_id=? WHERE project_id=?').run(project.id, previous.id);
            this.prepare('UPDATE tasks SET project_id=? WHERE project_id=?').run(project.id, previous.id);
            this.prepare('UPDATE events SET project_id=? WHERE project_id=?').run(project.id, previous.id);
            this.prepare('UPDATE project_aliases SET project_id=? WHERE project_id=?').run(project.id, previous.id);
            this.prepare('INSERT OR REPLACE INTO project_aliases(alias_id,project_id) VALUES(?,?)').run(previous.id, project.id);
            this.prepare('DELETE FROM projects WHERE id=?').run(previous.id);
          }
        } else {
          const root = project.rootPaths.includes(existing.root) ? existing.root : project.rootPaths[0];
          this.prepare('UPDATE projects SET name=?,root=?,roots=?,codex_bound=1 WHERE id=?').run(project.name, root, JSON.stringify(project.rootPaths), project.id);
        }
        this.ensureDefaultBoard(project.id);
      }
    });
    this.nativeIds = ids; this.projectSnapshot = projects; this.catalogRevision = hash(JSON.stringify(projects)).slice(0, 16);
  }
  nativeProjectId(id: string): string {
    if (this.nativeIds?.has(id)) return id;
    const alias = this.prepare('SELECT project_id FROM project_aliases WHERE alias_id=?').get(id) as Row | undefined;
    if (alias && this.nativeIds?.has(alias.project_id)) return alias.project_id;
    return fail('PROJECT_NOT_IN_CODEX', 'Choose an existing project from Codex. Create and manage projects in Codex itself.');
  }
  projectAt(root: string): Project | undefined {
    const matches = this.projects().filter(p => p.rootPaths.includes(canonicalRoot(root)));
    if (matches.length > 1) fail('AMBIGUOUS_PROJECT', 'More than one Codex project uses this directory. Select the project by its ID.');
    return matches[0];
  }
  board(projectId: string, offset = 0, archived = false, boardId?: string): Board {
    const revision = this.revision();
    return this.transaction(() => {
    const project = this.projects(projectId)[0];
    if (!project) fail('NOT_FOUND', 'That project board does not exist.');
    const selected = this.boardRow(projectId, boardId), boards = this.boards(projectId), board = boards.find(b => b.id === selected.id)!;
    const limit = 200;
    const tasks = this.summaries(this.prepare("SELECT id,project_id,board_id,number,title,substr(description,1,140) AS description,'' AS criteria,status,priority,blocked_reason,rank,version,archived,created_at,updated_at FROM tasks WHERE board_id=? AND archived=? ORDER BY rank,number LIMIT ? OFFSET ?")
      .all(selected.id, archived ? 1 : 0, limit, offset) as Row[]);
    const total = (this.prepare('SELECT COUNT(*) AS n FROM tasks WHERE board_id=? AND archived=?').get(selected.id, archived ? 1 : 0) as Row).n;
    const counts = Object.fromEntries(STATUSES.map(s => [s, 0])) as Board['counts'];
    for (const row of this.prepare('SELECT status,COUNT(*) AS n FROM tasks WHERE board_id=? AND archived=? GROUP BY status').all(selected.id, archived ? 1 : 0) as Row[]) counts[row.status as Status] = row.n;
    return { project, board, boards, tasks, total, nextOffset: offset + tasks.length < total ? offset + tasks.length : null, counts, fetchedAt: now(), revision };
    }, true);
  }
  detail(projectId: string, taskId: string): TaskDetail {
    return this.transaction(() => {
    const task = this.task(this.row(taskId, projectId));
    const events = (this.prepare('SELECT * FROM events WHERE task_id=? ORDER BY id DESC LIMIT 50').all(taskId) as Row[])
      .map(e => ({ id: e.id, taskId: e.task_id, kind: e.kind, actor: e.actor, note: e.note, createdAt: e.created_at }));
    return { task, events };
    }, true);
  }
  createTask(input: { projectId: string; boardId?: string; title: string; description?: string; criteria?: string; priority?: Priority; status?: Status; operationId: string }): Task {
    return this.transaction(() => {
      const board = this.boardRow(input.projectId, input.boardId);
      const prior = this.prepare('SELECT task_id FROM operations WHERE id=?').get(input.operationId) as Row | undefined;
      if (prior) {
        const row = this.row(prior.task_id, input.projectId);
        if (row.board_id !== board.id) fail('OPERATION_CONFLICT', 'That operation belongs to another board.');
        return this.task(row);
      }
      const p = this.prepare('SELECT * FROM projects WHERE id=?').get(input.projectId) as Row | undefined;
      if (!p) fail('NOT_FOUND', 'Select an existing Codex project first.');
      if (input.status === 'in_progress' || input.status === 'review') fail('CLAIM_REQUIRED', 'New tasks start in Backlog or Ready. Claim work before starting it.');
      const id = randomUUID(), timestamp = now();
      this.prepare(`INSERT INTO tasks(id,project_id,board_id,number,title,description,criteria,priority,status,rank,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.projectId, board.id, p.next_number, input.title.trim(), input.description || '', input.criteria || '', input.priority || 'normal', input.status || 'backlog', p.next_number * 1024, timestamp, timestamp);
      this.prepare('UPDATE projects SET next_number=next_number+1 WHERE id=?').run(input.projectId);
      this.prepare('INSERT INTO operations(id,task_id) VALUES(?,?)').run(input.operationId, id);
      const row = this.row(id); this.event(row, 'created', 'You'); return this.task(row);
    });
  }
  edit(input: { projectId: string; taskId: string; version: number; title?: string; description?: string; criteria?: string; priority?: Priority; blockedReason?: string }): Task {
    return this.transaction(() => {
      const row = this.row(input.taskId, input.projectId); this.checkVersion(row, input.version);
      this.prepare('UPDATE tasks SET title=?,description=?,criteria=?,priority=?,blocked_reason=?,version=version+1,updated_at=? WHERE id=?')
        .run(input.title?.trim() ?? row.title, input.description ?? row.description, input.criteria ?? row.criteria, input.priority ?? row.priority, input.blockedReason ?? row.blocked_reason, now(), row.id);
      this.event(row, 'edited', 'You'); return this.task(this.row(row.id));
    });
  }
  move(input: { projectId: string; taskId: string; version: number; status: Status; rank?: number }): Task {
    return this.transaction(() => {
      const row = this.row(input.taskId, input.projectId); this.checkVersion(row, input.version);
      if (row.archived) fail('ARCHIVED', 'Restore this task before moving it.');
      const active = this.activeRun(row.id);
      if (input.status === 'in_progress' && active?.state !== 'running') fail('CLAIM_REQUIRED', 'Start this task in Codex or claim it from an existing chat.');
      if (input.status === 'review' && active?.state === 'launching') fail('NOT_RUNNING', 'The new chat must bind to its task before submitting work.');
      if (input.status !== 'in_progress' && active) this.prepare("UPDATE runs SET state=? WHERE id=?").run(input.status === 'review' ? 'submitted' : 'released', active.id);
      this.prepare('UPDATE tasks SET status=?,rank=?,version=version+1,updated_at=? WHERE id=?').run(input.status, input.rank ?? row.rank, now(), row.id);
      this.event(row, input.status === 'done' ? 'accepted' : 'moved', 'You', `Moved to ${input.status.replaceAll('_', ' ')}`);
      return this.task(this.row(row.id));
    });
  }
  archive(input: { projectId: string; taskId: string; version: number; archived: boolean }): Task {
    return this.transaction(() => {
      const row = this.row(input.taskId, input.projectId); this.checkVersion(row, input.version);
      if (this.activeRun(row.id)) fail('ACTIVE_RUN', 'Release or finish the active run before archiving this task.');
      this.prepare('UPDATE tasks SET archived=?,version=version+1,updated_at=? WHERE id=?').run(input.archived ? 1 : 0, now(), row.id);
      this.event(row, input.archived ? 'archived' : 'restored', 'You'); return this.task(this.row(row.id));
    });
  }
  dependency(input: { projectId: string; taskId: string; version: number; prerequisiteId: string; remove?: boolean }): Task {
    return this.transaction(() => {
      const row = this.row(input.taskId, input.projectId); this.checkVersion(row, input.version);
      const prerequisite = this.row(input.prerequisiteId, input.projectId);
      if (prerequisite.board_id !== row.board_id) fail('CROSS_BOARD_DEPENDENCY', 'Prerequisites must be on the same board.');
      if (input.remove) this.prepare('DELETE FROM dependencies WHERE task_id=? AND prerequisite_id=?').run(row.id, input.prerequisiteId);
      else {
        const cycle = this.prepare(`WITH RECURSIVE chain(id) AS (SELECT ? UNION SELECT prerequisite_id FROM dependencies d JOIN chain c ON d.task_id=c.id) SELECT 1 FROM chain WHERE id=? LIMIT 1`).get(input.prerequisiteId, row.id);
        if (cycle) fail('DEPENDENCY_CYCLE', 'That dependency would create a cycle.');
        this.prepare('INSERT OR IGNORE INTO dependencies(task_id,prerequisite_id) VALUES(?,?)').run(row.id, input.prerequisiteId);
      }
      this.prepare('UPDATE tasks SET version=version+1,updated_at=? WHERE id=?').run(now(), row.id);
      this.event(row, 'dependency', 'You', input.remove ? 'Removed prerequisite' : 'Added prerequisite'); return this.task(this.row(row.id));
    });
  }
  private eligible(row: Row) {
    if (row.archived || row.status === 'done' || row.status === 'review') fail('NOT_READY', 'Restore this task or move it to Ready before starting work.');
    if (row.blocked_reason) fail('BLOCKED', 'This task is blocked. Resolve its blocked reason first.');
    const dependency = this.prepare("SELECT t.number FROM dependencies d JOIN tasks t ON t.id=d.prerequisite_id WHERE d.task_id=? AND t.status <> 'done' LIMIT 1").get(row.id) as Row | undefined;
    if (dependency) fail('PREREQUISITE', `Finish TB-${dependency.number} before starting this task.`);
    if (this.activeRun(row.id)) fail('ALREADY_CLAIMED', 'Another chat already owns this task. Open its chat or explicitly release it.');
  }
  claim(input: { projectId: string; taskId: string; version: number; attemptId: string; token: string; owner: string; threadId?: string; launching?: boolean }): { task: Task; run: Run; token: string } {
    return this.transaction(() => {
      const prior = this.prepare('SELECT * FROM runs WHERE attempt_id=?').get(input.attemptId) as Row | undefined;
      if (prior) {
        this.row(prior.task_id, input.projectId);
        if (prior.task_id !== input.taskId || prior.token_hash !== hash(input.token)) fail('OPERATION_CONFLICT', 'That attempt ID belongs to another claim.');
        return { task: this.task(this.row(prior.task_id)), run: this.run(prior), token: input.token };
      }
      const row = this.row(input.taskId, input.projectId); this.eligible(row); this.checkVersion(row, input.version);
      const id = randomUUID(), created = now();
      const expiry = input.launching ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      this.prepare('INSERT INTO runs(id,task_id,state,owner,thread_id,token_hash,attempt_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, row.id, input.launching ? 'launching' : 'running', input.owner, input.threadId || null, hash(input.token), input.attemptId, created, expiry);
      this.prepare('UPDATE tasks SET status=?,version=version+1,updated_at=? WHERE id=?').run(input.launching ? row.status : 'in_progress', created, row.id);
      this.event(row, input.launching ? 'launch_prepared' : 'claimed', input.owner);
      return { task: this.task(this.row(row.id)), run: this.run(this.prepare('SELECT * FROM runs WHERE id=?').get(id) as Row), token: input.token };
    });
  }
  private authorized(runId: string, token: string, projectId: string): Row {
    const run = this.prepare('SELECT * FROM runs WHERE id=?').get(runId) as Row | undefined;
    if (!run) fail('NOT_FOUND', 'That task run does not exist.');
    this.row(run.task_id, projectId);
    const a = Buffer.from(run.token_hash), b = Buffer.from(hash(token));
    if (a.length !== b.length || !timingSafeEqual(a, b)) fail('INVALID_CLAIM', 'This chat does not have the task claim handle.');
    return run;
  }
  bind(input: { projectId: string; runId: string; token: string; owner: string; threadId?: string }): { task: Task; run: Run } {
    return this.transaction(() => {
      const run = this.authorized(input.runId, input.token, input.projectId);
      if (run.state === 'running') {
        if (input.threadId && run.thread_id && input.threadId !== run.thread_id) fail('ALREADY_BOUND', 'This launch is bound to another chat.');
        return { task: this.task(this.row(run.task_id)), run: this.run(run) };
      }
      if (run.state !== 'launching') fail('INVALID_RUN', 'This reservation is no longer active. Start a new run explicitly.');
      if (run.expires_at < now()) fail('EXPIRED_LAUNCH', 'This launch reservation expired. Release it and start again.');
      this.prepare("UPDATE runs SET state='running',owner=?,thread_id=?,expires_at=NULL WHERE id=?").run(input.owner, input.threadId || null, run.id);
      this.prepare("UPDATE tasks SET status='in_progress',version=version+1,updated_at=? WHERE id=?").run(now(), run.task_id);
      this.event(this.row(run.task_id), 'started', input.owner);
      return { task: this.task(this.row(run.task_id)), run: this.run(this.prepare('SELECT * FROM runs WHERE id=?').get(run.id) as Row) };
    });
  }
  release(input: { projectId: string; taskId: string; version: number }): Task {
    return this.transaction(() => {
      const row = this.row(input.taskId, input.projectId); this.checkVersion(row, input.version);
      const run = this.activeRun(row.id);
      if (!run) fail('NOT_RUNNING', 'There is no active claim to release.');
      this.prepare("UPDATE runs SET state='released' WHERE id=?").run(run.id);
      this.prepare("UPDATE tasks SET status='ready',version=version+1,updated_at=? WHERE id=?").run(now(), row.id);
      this.event(row, 'released', 'You'); return this.task(this.row(row.id));
    });
  }
  note(input: { projectId: string; taskId: string; note: string; actor?: string; runId?: string; token?: string; submit?: boolean }): TaskDetail {
    return this.transaction(() => {
      const row = this.row(input.taskId, input.projectId);
      if (input.runId) {
        const run = this.authorized(input.runId, input.token || '', input.projectId);
        if (run.task_id !== row.id || run.state !== 'running') fail('INVALID_RUN', 'Only the active owner can report progress or submit this task.');
        if (input.submit) {
          this.prepare("UPDATE runs SET state='submitted' WHERE id=?").run(run.id);
          this.prepare("UPDATE tasks SET status='review',version=version+1,updated_at=? WHERE id=?").run(now(), row.id);
        }
        this.event(row, input.submit ? 'submitted' : 'progress', run.owner, input.note);
      } else {
        if (input.submit) fail('CLAIM_REQUIRED', 'An active owner must submit the task.');
        this.event(row, 'comment', input.actor || 'You', input.note);
      }
      return this.detail(input.projectId, row.id);
    });
  }
  exportProject(projectId: string, boardId?: string) {
    return this.transaction(() => {
    const project = this.projects(projectId)[0];
    if (!project) fail('NOT_FOUND', 'That project board does not exist.');
    const selected = this.boardRow(projectId, boardId), board = this.boards(projectId).find(b => b.id === selected.id)!;
    const rows = this.prepare('SELECT * FROM tasks WHERE board_id=? ORDER BY number').all(selected.id) as Row[];
    return { format: 'threadboard-export', version: 2, exportedAt: now(), project, board,
      tasks: rows.map(r => ({ task: this.task(r), events: (this.prepare('SELECT * FROM events WHERE task_id=? ORDER BY id DESC').all(r.id) as Row[])
        .map(e => ({ id: e.id, taskId: e.task_id, kind: e.kind, actor: e.actor, note: e.note, createdAt: e.created_at })) })) };
    }, true);
  }
}
