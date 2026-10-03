import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { BoardError, PRIORITIES, STATUSES, type InitialData } from './types.js';

const id = z.string().uuid();
const token = z.string().min(32).max(200);
const owner = z.string().trim().min(1).max(80);
const project = { projectId: id };
const task = { ...project, taskId: id };
const versioned = { ...task, version: z.number().int().positive() };
const text = z.string().max(20_000);
const title = z.string().trim().min(1).max(160);

export const definitions = {
  open_project_board: { title: 'Open Threadboard', readOnly: true, description: 'Open the fully local Kanban board. Supply a known projectId or an existing absolute workspace root to select its board. With no arguments, show the project switcher.', schema: z.object({ projectId: id.optional(), root: z.string().max(4096).optional() }).strict() },
  list_projects: { title: 'List local boards', readOnly: true, description: 'List locally registered project boards and their workspace roots; no transcript access.', schema: z.object({}).strict() },
  create_project: { title: 'Add project board', readOnly: false, description: 'Associate a named board with an existing absolute local workspace directory. Does not create a native Codex project or access repository contents.', schema: z.object({ name: z.string().trim().min(1).max(80), root: z.string().min(1).max(4096) }).strict() },
  get_board: { title: 'Refresh board', readOnly: true, description: 'Fetch bounded local task summaries, versions, ownership, and column counts. Page through nextOffset to see all tasks.', schema: z.object({ ...project, offset: z.number().int().min(0).default(0), archived: z.boolean().default(false) }).strict() },
  get_task: { title: 'Read task', readOnly: true, description: 'Read full local task details, prerequisites, owner, and the latest 50 explicitly written activity notes.', schema: z.object(task).strict() },
  create_task: { title: 'Create task', readOnly: false, description: 'Create a local task with a stable operationId for idempotency. Include goal and acceptance criteria. Use Backlog or Ready before claiming work.', schema: z.object({ ...project, title, description: text.default(''), criteria: z.string().max(10_000).default(''), priority: z.enum(PRIORITIES).default('normal'), status: z.enum(['backlog','ready']).default('backlog'), operationId: id }).strict() },
  update_task: { title: 'Edit task', readOnly: false, description: 'Edit local task content using its expected version. A stale write fails and preserves newer work.', schema: z.object({ ...versioned, title: title.optional(), description: text.optional(), criteria: z.string().max(10_000).optional(), priority: z.enum(PRIORITIES).optional(), blockedReason: z.string().max(1000).optional() }).strict() },
  move_task: { title: 'Move task', readOnly: false, description: 'Move a card on the user’s instruction using its current version. Starting work requires an active running claim. Moving an owned card out of In progress releases its owner; use only for an explicit user action.', schema: z.object({ ...versioned, status: z.enum(STATUSES), rank: z.number().finite().optional() }).strict() },
  archive_task: { title: 'Archive or restore task', readOnly: false, description: 'Archive or restore a task on the user’s request. Active claims must be released first; history is preserved.', schema: z.object({ ...versioned, archived: z.boolean() }).strict() },
  link_dependency: { title: 'Set prerequisite', readOnly: false, description: 'Link or unlink a same-board prerequisite. Cycles and cross-project links are rejected.', schema: z.object({ ...versioned, prerequisiteId: id, remove: z.boolean().default(false) }).strict() },
  claim_task: { title: 'Claim task in this chat', readOnly: false, description: 'Atomically claim an eligible task before working. Use a stable attemptId and a fresh UUID claim token of at least 32 characters. Keep the returned token/run ID for progress and submission. Optional threadId links the known native chat. Never guess an ID.', schema: z.object({ ...versioned, attemptId: id, token, owner, threadId: id.optional() }).strict() },
  prepare_task_launch: { title: 'Prepare new Codex chat', readOnly: false, description: 'Reserve a task for a new native chat and return a local desktop deep link and task prompt. The link opens a workspace chat with a prefilled composer; the user sends it. Binding, not reservation, starts work. Never retry opening the chat automatically.', schema: z.object({ ...versioned, attemptId: id, token }).strict() },
  bind_task_run: { title: 'Bind launched chat', readOnly: false, description: 'Bind this chat to its launch reservation before doing task work. Supply the exact project/run/token from the launch prompt and a concise owner label. A known threadId enables native navigation.', schema: z.object({ ...project, runId: id, token, owner, threadId: id.optional() }).strict() },
  release_task: { title: 'Release task owner', readOnly: false, description: 'Explicitly release a task’s active owner on the user’s request, preserving notes and returning it to Ready. Do not release another working chat just because it is quiet.', schema: z.object(versioned).strict() },
  add_comment: { title: 'Add task note', readOnly: false, description: 'Save a concise deliberately written local note; do not copy transcripts, reasoning, or raw tool output.', schema: z.object({ ...task, note: z.string().trim().min(1).max(8000), actor: owner.default('You') }).strict() },
  report_progress: { title: 'Report task progress', readOnly: false, description: 'Save a concise progress note for your active claimed run. No transcripts or raw tool output.', schema: z.object({ ...task, runId: id, token, note: z.string().trim().min(1).max(8000) }).strict() },
  submit_task: { title: 'Submit for review', readOnly: false, description: 'As the active owner, submit a deliberately written result summary and validation evidence for user review. Moves to Review; do not accept your own work as Done.', schema: z.object({ ...task, runId: id, token, note: z.string().trim().min(1).max(8000) }).strict() },
  export_board: { title: 'Export local board', readOnly: true, description: 'Return a versioned local JSON export for the user to save. Includes task content, notes, roots, and chat references; never upload it.', schema: z.object(project).strict() },
} as const;
export type ToolName = keyof typeof definitions;

export function invoke(store: Store, name: string, raw: unknown): any {
  if (!Object.hasOwn(definitions, name)) throw new BoardError('UNKNOWN_TOOL', 'That board action is unavailable.');
  const args: any = definitions[name as ToolName].schema.parse(raw);
  switch (name as ToolName) {
    case 'open_project_board': {
      if (args.root) {
        const registered = store.projectAt(args.root);
        if (!registered) throw new BoardError('PROJECT_NOT_REGISTERED', 'This workspace has no board yet. Add it with create_project first.');
        args.projectId = registered.id;
      }
      const projects = store.projects();
      return { projects, board: args.projectId ? store.board(args.projectId) : projects.length === 1 ? store.board(projects[0].id) : null, version: '0.1.0' } satisfies InitialData;
    }
    case 'list_projects': return { projects: store.projects() };
    case 'create_project': return { project: store.createProject(args.name, args.root) };
    case 'get_board': return store.board(args.projectId, args.offset, args.archived);
    case 'get_task': return store.detail(args.projectId, args.taskId);
    case 'create_task': return { task: store.createTask(args) };
    case 'update_task': return { task: store.edit(args) };
    case 'move_task': return { task: store.move(args) };
    case 'archive_task': return { task: store.archive(args) };
    case 'link_dependency': return { task: store.dependency(args) };
    case 'claim_task': return store.claim(args);
    case 'prepare_task_launch': {
      const result = store.claim({ ...args, owner: 'New Codex chat', launching: true });
      const p = store.projects().find(p => p.id === args.projectId)!;
      const prompt = `Work on Threadboard task TB-${result.task.number}: ${result.task.title}\n\nWorkspace: ${p.root}\n\nFirst call the Threadboard bind_task_run tool with projectId=${args.projectId}, runId=${result.run.id}, token=${result.token}, and an owner label. If CODEX_THREAD_ID is available from your shell environment, use it as threadId; never guess. Then use get_task to read the local task details and acceptance criteria. Work only on this task, report concise progress, and submit_task with a result summary and validation evidence for the user's review. Do not mark it Done yourself.`;
      const url = `codex://threads/new?path=${encodeURIComponent(p.root)}&prompt=${encodeURIComponent(prompt)}`;
      return { ...result, prompt, url };
    }
    case 'bind_task_run': return store.bind(args);
    case 'release_task': return { task: store.release(args) };
    case 'add_comment': return store.note(args);
    case 'report_progress': return store.note(args);
    case 'submit_task': return store.note({ ...args, submit: true });
    case 'export_board': return store.exportProject(args.projectId);
  }
}

export function freshClaim() { return { attemptId: randomUUID(), token: randomUUID() + randomUUID() }; }
