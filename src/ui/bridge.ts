import { App, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { OpenAIMessageParams } from '@openai/mcp-extensions/app';
import type { InitialData, Project, ProjectBoard, Task } from '../types.js';
import { VERSION } from '../version.js';
import { fullViewUrl, readHostLocation, type BoardLocation } from './navigation.js';

declare global { interface Window { __THREADBOARD_PREVIEW__?: string; } }
let app: App | undefined;
let connection: Promise<void> | undefined;
let initial: InitialData | undefined;
let receiveInitial: ((data: InitialData) => void) | undefined;

function taskContext(task: Task, project: Project): string {
  return `Threadboard TB-${task.number}: ${task.title}\nProject: ${project.name}\nTask ID: ${task.id}\nProject ID: ${project.id}\nBoard ID: ${task.boardId}\nState: ${task.status}\n\nGoal:\n${task.description.slice(0, 3500)}\n\nAcceptance criteria:\n${task.criteria.slice(0, 2000)}`;
}

function boardContext(project: Project | null, board?: ProjectBoard) {
  const content = project ? [{ type: 'text' as const,
    text: `Selected Threadboard board: ${board?.name || 'General'}\nBoard ID: ${board?.id || 'General (default)'}\nNative Codex project: ${project.name}\nNative Codex project ID: ${project.id}\nWorkspace: ${project.root}\n\nUse this project ID and board ID for Threadboard tools. This identifies the selected board; it does not change this chat's native project membership or working directory.`,
    _meta: { 'openai/title': `${project.name} / ${board?.name || 'General'}` },
  }] : [];
  return { content, structuredContent: { threadboard: project ? {
    projectId: project.id, projectName: project.name, workspaceRoot: project.root, boardId: board?.id, boardName: board?.name,
  } : null } };
}

export async function setBoardContext(project: Project | null, board?: ProjectBoard) {
  if (window.__THREADBOARD_PREVIEW__) return;
  await connection;
  if (!app?.getHostCapabilities()?.updateModelContext) return;
  await app.updateModelContext(boardContext(project, board));
}

export async function requestBoardChat(prompt: string): Promise<boolean> {
  if (window.__THREADBOARD_PREVIEW__ || !app?.getHostCapabilities()?.message) {
    await navigator.clipboard.writeText(prompt);
    return false;
  }
  const params: OpenAIMessageParams = { role: 'user', content: [{ type: 'text', text: prompt }],
    _meta: { 'openai/message': { target: 'active', send: true } } };
  const result = await app.sendMessage(params);
  if (result.isError) throw new Error('The board was saved, but Codex could not receive its chat setup request. Use Finish chat setup to recover.');
  return true;
}

function dataFrom(result: any) {
  if (result.isError || result.structuredContent?.error) {
    const error = result.structuredContent?.error;
    throw new Error(error?.message || result.content?.find((c: any) => c.type === 'text')?.text || 'The board could not complete this action.');
  }
  return result._meta?.threadboard ?? result.structuredContent;
}

async function connect(onTheme: (theme: string) => void, signal: AbortSignal, onNavigate?: (location: BoardLocation) => void) {
  if (window.__THREADBOARD_PREVIEW__) {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => onTheme(preference.matches ? 'dark' : 'light');
    updateTheme();
    preference.addEventListener('change', updateTheme, { signal });
    return;
  }
  if (!connection) {
    app = new App({ name: 'Threadboard', version: VERSION }, {});
    const navigate = () => {
      const location = readHostLocation(app?.getHostContext()?.['openai/deepLink']);
      if (location && !signal.aborted) onNavigate?.(location);
    };
    app.ontoolresult = params => {
      const data = dataFrom(params);
      if (data && 'projects' in data && 'board' in data) { initial = data; receiveInitial?.(data); }
    };
    app.onhostcontextchanged = context => {
      if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
      if (context.theme) onTheme(context.theme);
      if ('openai/deepLink' in context) navigate();
    };
    connection = app.connect().then(() => {
      const context = app!.getHostContext();
      if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
      onTheme(context?.theme || 'light');
      navigate();
    });
  }
  await connection;
}

export async function call<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (window.__THREADBOARD_PREVIEW__) {
    const response = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${window.__THREADBOARD_PREVIEW__}` }, body: JSON.stringify({ name, args }), ...(name === 'get_board_revision' ? { signal: AbortSignal.timeout(5000) } : {}) });
    const body = await response.json();
    if (body.error) throw new Error(body.error.message);
    return body.data;
  }
  await connection;
  if (!app) throw new Error('The Codex host connection is unavailable. Reopen Threadboard in Codex.');
  return dataFrom(await app.callServerTool({ name, arguments: args }, name === 'get_board_revision' ? { timeout: 5000 } : undefined));
}

export async function start(onTheme: (theme: string) => void, signal: AbortSignal, onNavigate?: (location: BoardLocation) => void): Promise<InitialData> {
  await connect(onTheme, signal, onNavigate);
  if (window.__THREADBOARD_PREVIEW__) return call('open_project_board');
  if (initial) return initial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { receiveInitial = undefined; call<InitialData>('open_project_board').then(resolve, reject); }, 750);
    receiveInitial = data => { clearTimeout(timer); receiveInitial = undefined; resolve(data); };
  });
}

export async function openFullView(location: BoardLocation) {
  await connection;
  if (!app || window.__THREADBOARD_PREVIEW__) throw new Error('Open Threadboard in Codex to use full view.');
  // Both a side panel and the sidebar app report "fullscreen". Navigate to
  // the documented global entrypoint rather than requesting the same mode.
  const result = await app.openLink({ url: fullViewUrl(location) }, { timeout: 5000 });
  if (result.isError) throw new Error('Codex could not open full view. Open Threadboard from the Codex sidebar to return to its main view.');
}

export async function openLink(url: string) {
  if (!url.startsWith('codex://threads/')) throw new Error('Only native Codex chat links can open from this board.');
  if (window.__THREADBOARD_PREVIEW__) { window.location.href = url; return; }
  if (!app) throw new Error('Open Threadboard in Codex to launch a chat.');
  const result = await app.openLink({ url });
  if (result.isError) throw new Error('Codex could not open the chat link. Copy the task prompt, open a new chat in this workspace, and send it there. The reservation is preserved.');
}

export async function share(task: Task, project: Project, board: ProjectBoard) {
  const text = taskContext(task, project);
  if (window.__THREADBOARD_PREVIEW__) { await navigator.clipboard.writeText(text); return; }
  if (!app?.getHostCapabilities()?.updateModelContext) throw new Error('The Codex conversation cannot receive app context in this view.');
  const context = boardContext(project, board);
  context.content.push({ type: 'text', text, _meta: { 'openai/title': `TB-${task.number}: ${task.title}` } });
  await app.updateModelContext({ ...context, structuredContent: { threadboard: {
    ...context.structuredContent.threadboard, taskId: task.id, state: task.status,
  } } });
}

export function claimIds() { return { attemptId: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID() }; }
