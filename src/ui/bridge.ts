import { App } from '@modelcontextprotocol/ext-apps';
import type { InitialData, Project, Task } from '../types.js';

declare global { interface Window { __THREADBOARD_PREVIEW__?: string; } }
let app: App | undefined;
let connection: Promise<void> | undefined;
let initial: InitialData | undefined;
let receiveInitial: ((data: InitialData) => void) | undefined;

function dataFrom(result: any) {
  if (result.isError || result.structuredContent?.error) {
    const error = result.structuredContent?.error;
    throw new Error(error?.message || result.content?.find((c: any) => c.type === 'text')?.text || 'The board could not complete this action.');
  }
  return result._meta?.threadboard ?? result.structuredContent;
}

async function connect(onTheme: (theme: string) => void) {
  if (window.__THREADBOARD_PREVIEW__) { onTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); return; }
  if (!connection) {
    app = new App({ name: 'Threadboard', version: '0.1.0' }, {});
    app.ontoolresult = params => {
      const data = dataFrom(params);
      if (data && 'projects' in data && 'board' in data) { initial = data; receiveInitial?.(data); }
    };
    app.onhostcontextchanged = context => { if (context.theme) onTheme(context.theme); };
    connection = app.connect().then(() => { onTheme(app!.getHostContext()?.theme || 'light'); });
  }
  await connection;
}

export async function call<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (window.__THREADBOARD_PREVIEW__) {
    const response = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${window.__THREADBOARD_PREVIEW__}` }, body: JSON.stringify({ name, args }) });
    const body = await response.json();
    if (body.error) throw new Error(body.error.message);
    return body.data;
  }
  await connection;
  if (!app) throw new Error('The Codex host connection is unavailable. Reopen Threadboard in Codex.');
  return dataFrom(await app.callServerTool({ name, arguments: args }));
}

export async function start(onTheme: (theme: string) => void): Promise<InitialData> {
  await connect(onTheme);
  if (window.__THREADBOARD_PREVIEW__) return call('open_project_board');
  if (initial) return initial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { receiveInitial = undefined; call<InitialData>('open_project_board').then(resolve, reject); }, 750);
    receiveInitial = data => { clearTimeout(timer); receiveInitial = undefined; resolve(data); };
  });
}

export async function openLink(url: string) {
  if (!url.startsWith('codex://threads/')) throw new Error('Only native Codex chat links can open from this board.');
  if (window.__THREADBOARD_PREVIEW__) { window.location.href = url; return; }
  if (!app) throw new Error('Open Threadboard in Codex to launch a chat.');
  const result = await app.openLink({ url });
  if (result.isError) throw new Error('Codex could not open the chat link. Copy the task prompt, open a new chat in this workspace, and send it there. The reservation is preserved.');
}

export async function share(task: Task, project: Project) {
  const text = `Threadboard TB-${task.number}: ${task.title}\nProject: ${project.name}\nTask ID: ${task.id}\nProject ID: ${project.id}\nState: ${task.status}\n\nGoal:\n${task.description.slice(0, 3500)}\n\nAcceptance criteria:\n${task.criteria.slice(0, 2000)}`;
  if (window.__THREADBOARD_PREVIEW__) { await navigator.clipboard.writeText(text); return; }
  if (!app) throw new Error('The Codex conversation is unavailable.');
  await app.updateModelContext({ content: [{ type: 'text', text }] });
}

export function claimIds() { return { attemptId: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID() }; }
