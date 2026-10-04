import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

test('the native chat receives selected board metadata, shares tasks explicitly, and clears old context', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
    const body = await response.json(); expect(body.error).toBeUndefined(); return body.data;
  };
  const projects = (await call('list_projects', {})).projects;
  const first = projects.find((p: any) => p.name === 'UI workspace 9');
  const second = projects.find((p: any) => p.name === 'UI workspace 10');
  await call('create_task', { projectId: first.id, title: 'Private task fixture', description: 'Private description fixture', criteria: 'Private acceptance fixture', operationId: randomUUID() });
  const initial = await call('open_project_board', { projectId: first.id });
  const registry = join(dirname(dirname(second.root)), 'codex', '.codex-global-state.json');
  expect(second.root).toContain('threadboard-ui-data-');
  const original = readFileSync(registry, 'utf8');
  try {
    await page.route('http://127.0.0.1:4389/', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/<script>window\.__THREADBOARD_PREVIEW__="[a-f0-9]+"<\/script>/, '');
      await route.fulfill({ response, body });
    });
    await page.route('**/board-context-host', route => route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><body style="margin:0"><iframe title="Threadboard" src="/" style="width:100%;height:100vh;border:0"></iframe>
      <script>
        const frame = document.querySelector('iframe'), initial = ${JSON.stringify(initial)}, token = ${JSON.stringify(token)};
        window.contextUpdates = []; window.chatMessages = [];
        const send = message => frame.contentWindow.postMessage(message, location.origin);
        addEventListener('message', async event => {
          if (event.source !== frame.contentWindow || !event.data.method) return;
          const message = event.data;
          if (message.method === 'ui/initialize') send({ jsonrpc: '2.0', id: message.id, result: {
            protocolVersion: message.params.protocolVersion, hostInfo: { name: 'Board context test host', version: '1' },
            hostCapabilities: { serverTools: {}, message: { text: {} }, updateModelContext: { text: {}, structuredContent: {} } }, hostContext: { theme: 'dark' }
          } });
          if (message.method === 'ui/notifications/initialized') send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], _meta: { threadboard: initial } } });
          if (message.method === 'ui/update-model-context') {
            window.contextUpdates.push(message.params);
            send({ jsonrpc: '2.0', id: message.id, result: {} });
          }
          if (message.method === 'ui/message') {
            window.chatMessages.push(message.params);
            send({ jsonrpc: '2.0', id: message.id, result: {} });
          }
          if (message.method === 'tools/call') {
            const response = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ name: message.params.name, args: message.params.arguments }) });
            const body = await response.json();
            send({ jsonrpc: '2.0', id: message.id, result: body.error ? { isError: true, content: [{ type: 'text', text: body.error.message }], structuredContent: { error: body.error } } : { content: [], structuredContent: body.data, _meta: { threadboard: body.data } } });
          }
        });
      </script></body></html>` }));
    await page.goto('/board-context-host');
    const app = page.frameLocator('iframe[title="Threadboard"]');
    const updates = () => page.evaluate(() => (window as any).contextUpdates);
    await expect(app.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
    await expect.poll(async () => (await updates()).length).toBe(1);
    const context = (await updates())[0];
    expect(context.structuredContent.threadboard).toEqual({ projectId: first.id, projectName: first.name, workspaceRoot: first.root, boardId: initial.board.board.id, boardName: 'General' });
    expect(context.content[0]._meta['openai/title']).toBe(`${first.name} / General`);
    expect(JSON.stringify(context)).not.toContain('Private');
    expect(context.content[0].text).toContain('does not change this chat');
    await app.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await expect(app.getByRole('button', { name: 'Refresh board', exact: true })).toBeEnabled();
    expect((await updates()).length).toBe(1);
    await app.getByTestId('task-1').getByRole('button', { name: /Private task fixture/ }).click();
    await app.getByRole('button', { name: 'Share with this chat', exact: true }).click();
    await expect.poll(async () => (await updates()).length).toBe(2);
    expect(JSON.stringify((await updates())[1])).toContain('Private acceptance fixture');
    await app.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await app.getByRole('button', { name: 'New board', exact: true }).click();
    const dialog = app.getByRole('dialog', { name: 'New board', exact: true });
    await dialog.getByRole('textbox', { name: 'Board name', exact: true }).fill('Release');
    await dialog.getByRole('button', { name: 'Create board', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(app.getByRole('button', { name: 'Finish chat setup', exact: true })).toBeEnabled();
    await expect.poll(async () => (await updates()).length).toBe(3);
    const selected = (await updates())[2];
    expect(selected.structuredContent.threadboard.projectId).toBe(first.id);
    expect(selected.structuredContent.threadboard.boardName).toBe('Release');
    expect(JSON.stringify(selected)).not.toContain('Private');
    const messages = await page.evaluate(() => (window as any).chatMessages);
    expect(messages).toHaveLength(1);
    expect(messages[0]._meta['openai/message']).toEqual({ target: 'active', send: true });
    expect(messages[0].content[0].text).toContain('Release Threadboard');
    expect(messages[0].content[0].text).toContain(first.id);
    expect(messages[0].content[0].text).not.toContain('Private');
    await expect(app.locator('.task-card')).toHaveCount(0);
    const boards = (await call('list_boards', { projectId: first.id })).boards;
    const release = boards.find((item: any) => item.name === 'Release');
    const threadId = randomUUID(); // A controlled fixture reference, not a native chat.
    await call('bind_board_chat', { projectId: first.id, boardId: release.id, requestId: release.chatRequestId, threadId });
    await app.getByRole('button', { name: 'New task N', exact: true }).click();
    const taskDialog = app.getByRole('dialog', { name: 'New task', exact: true });
    await taskDialog.getByRole('textbox', { name: 'Title', exact: true }).fill('Release-only card');
    await taskDialog.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(taskDialog).toBeHidden();
    await app.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await expect(app.getByRole('button', { name: 'Open board chat', exact: true })).toBeVisible();
    await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(release.id);
    await expect(app.getByTestId('task-2')).toContainText('Release-only card');
    expect((await updates()).length).toBe(3);
    expect(await page.evaluate(() => (window as any).chatMessages.length)).toBe(1);
    await app.getByRole('combobox', { name: 'Select board', exact: true }).selectOption(initial.board.board.id);
    await expect(app.getByTestId('task-1')).toContainText('Private task fixture');
    await expect(app.getByTestId('task-2')).toHaveCount(0);
    await expect.poll(async () => (await updates()).length).toBe(4);
    await app.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: /^UI workspace 10,/ }).click();
    await expect(app.getByRole('heading', { name: second.name, exact: true })).toBeVisible();
    await expect(app.getByRole('region', { name: 'Board picker' })).toBeVisible();
    await expect.poll(async () => (await updates()).length).toBe(5);
    expect((await updates())[4]).toEqual({ content: [], structuredContent: { threadboard: null } });
    await app.getByRole('button', { name: /^Open General,/ }).click();
    await expect.poll(async () => (await updates()).length).toBe(6);
    const next = (await updates())[5];
    expect(next.structuredContent.threadboard.projectId).toBe(second.id);
    expect(next.structuredContent.threadboard.taskId).toBeUndefined();
    expect(JSON.stringify(next)).not.toContain('Private');
    expect(JSON.stringify(next)).not.toContain(first.id);
    const state = JSON.parse(original); delete state['local-projects'][second.id];
    writeFileSync(registry, JSON.stringify(state));
    await app.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await expect(app.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
    await expect.poll(async () => (await updates()).length).toBe(7);
    expect((await updates())[6]).toEqual({ content: [], structuredContent: { threadboard: null } });
    await expect(app.getByRole('alert')).toHaveCount(0);
  } finally { writeFileSync(registry, original); }
});
