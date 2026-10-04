import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function fixture(page: Page) {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
    const body = await response.json(); expect(body.error).toBeUndefined(); return body.data;
  };
  const project = (await call('list_projects')).projects.find((p: any) => p.name === 'UI workspace 5');
  const { board } = await call('create_board', { projectId: project.id, name: `Full view ${randomUUID()}`, operationId: randomUUID() });
  const initial = await call('open_project_board');
  const path = (archive = false) => `/?${new URLSearchParams({ projectId: project.id, boardId: board.id, ...(archive ? { archived: '1' } : {}) })}`;
  const mount = async (deepLink?: object, rejectLink = false) => {
    await page.route('http://127.0.0.1:4389/', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace(/<script>window\.__THREADBOARD_PREVIEW__="[a-f0-9]+"<\/script>/, '') });
    });
    await page.route('**/navigation-host', route => route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><body style="margin:0;background:#111"><iframe title="Threadboard" src="/" style="width:100%;height:100vh;border:0"></iframe>
      <script>
        const frame = document.querySelector('iframe');
        const initial = ${JSON.stringify(initial)}, token = ${JSON.stringify(token)};
        window.openedLinks = []; window.toolCalls = []; window.displayRequests = [];
        const send = message => frame.contentWindow.postMessage(message, location.origin);
        addEventListener('message', async event => {
          if (event.source !== frame.contentWindow || !event.data.method) return;
          const message = event.data;
          if (message.method === 'ui/initialize') send({ jsonrpc: '2.0', id: message.id, result: {
            protocolVersion: message.params.protocolVersion, hostInfo: { name: 'Navigation test host', version: '1' },
            hostCapabilities: { serverTools: {}, openLinks: {} }, hostContext: {
              theme: 'dark', displayMode: 'fullscreen', availableDisplayModes: ['fullscreen'],
              ${deepLink ? `'openai/deepLink': ${JSON.stringify(deepLink)}` : ''}
            }
          } });
          if (message.method === 'ui/notifications/initialized') send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], _meta: { threadboard: initial } } });
          if (message.method === 'ui/open-link') {
            window.openedLinks.push(message.params.url);
            send({ jsonrpc: '2.0', id: message.id, result: { isError: ${rejectLink} } });
          }
          if (message.method === 'ui/request-display-mode') {
            window.displayRequests.push(message.params);
            send({ jsonrpc: '2.0', id: message.id, result: { mode: 'fullscreen' } });
          }
          if (message.method === 'tools/call') {
            window.toolCalls.push(message.params);
            const response = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ name: message.params.name, args: message.params.arguments }) });
            const body = await response.json();
            send({ jsonrpc: '2.0', id: message.id, result: body.error ? { isError: true, content: [{ type: 'text', text: body.error.message }], structuredContent: { error: body.error } } : { content: [], structuredContent: body.data, _meta: { threadboard: body.data } } });
          }
        });
      </script></body></html>` }));
    await page.goto('/navigation-host');
    return page.frameLocator('iframe[title="Threadboard"]');
  };
  const sendPath = async (url: string) => page.evaluate(url => {
    document.querySelector('iframe')!.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { 'openai/deepLink': { url } } }, location.origin);
  }, url);
  return { call, project, board, path, mount, sendPath };
}

test('full view links retain the overview, project, named board and archive using references only', async ({ page }) => {
  const f = await fixture(page);
  await f.call('create_task', { projectId: f.project.id, boardId: f.board.id, title: 'Private title stays local', description: 'Private contents stay local', operationId: randomUUID() });
  const app = await f.mount();
  const clickFullView = async () => {
    const count = await page.evaluate(() => (window as any).openedLinks.length);
    await app.getByRole('button', { name: 'Open full view', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).openedLinks.length)).toBe(count + 1);
    const raw = await page.evaluate(() => (window as any).openedLinks.at(-1));
    const url = new URL(raw);
    expect(url.protocol).toBe('codex:');
    expect(url.host).toBe('plugins');
    expect(url.pathname).toBe('/threadboard@threadboard-plugins/app/open_project_board');
    expect(raw).not.toContain('Private');
    expect(raw).not.toContain(encodeURIComponent(f.project.root));
    return url.searchParams.get('path');
  };
  await expect(app.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  expect(await clickFullView()).toBe('/');
  await app.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: /^UI workspace 5,/ }).click();
  expect(await clickFullView()).toBe(`/?${new URLSearchParams({ projectId: f.project.id })}`);
  await app.getByTestId(`board-${f.board.id}`).click();
  await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(f.board.id);
  expect(await clickFullView()).toBe(f.path());
  await app.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(app.getByRole('button', { name: 'Archive', exact: true })).toHaveClass('active');
  expect(await clickFullView()).toBe(f.path(true));
  expect(await page.evaluate(() => (window as any).displayRequests)).toEqual([]);
  const tools = await page.evaluate(() => (window as any).toolCalls.map((call: any) => call.name));
  expect(tools.every((name: string) => ['get_board', 'get_board_revision', 'list_projects'].includes(name))).toBe(true);
  // Render the actual native bridge controls in the width seen in the report.
  await page.setViewportSize({ width: 1040, height: 760 });
  await expect(app.getByRole('button', { name: 'Open full view', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/threadboard-full-view-dark.png' });
  await page.setViewportSize({ width: 320, height: 760 });
  const topbar = await app.locator('.topbar').boundingBox();
  const expand = await app.getByRole('button', { name: 'Open full view', exact: true }).boundingBox();
  expect(expand!.x + expand!.width).toBeLessThanOrEqual(topbar!.x + topbar!.width);
  await page.screenshot({ path: 'test-results/threadboard-full-view-mobile-dark.png' });
  await page.evaluate(() => {
    document.querySelector('iframe')!.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'light' } }, location.origin);
  });
  await page.setViewportSize({ width: 390, height: 760 });
  await expect(app.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(f.board.id);
  await expect(app.getByRole('button', { name: 'Archive', exact: true })).toHaveClass('active');
  await page.screenshot({ path: 'test-results/threadboard-full-view-mobile-light.png' });
});

test('initial and later host deep links restore named boards and archives without changing task data', async ({ page }) => {
  const f = await fixture(page);
  const { task } = await f.call('create_task', { projectId: f.project.id, boardId: f.board.id, title: 'Archived route fixture', operationId: randomUUID() });
  await f.call('archive_task', { projectId: f.project.id, taskId: task.id, version: task.version, archived: true });
  const app = await f.mount({ url: f.path(true) });
  await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(f.board.id);
  await expect(app.getByRole('button', { name: 'Archive', exact: true })).toHaveClass('active');
  await expect(app.getByTestId(`task-${task.number}`)).toContainText('Archived route fixture');
  await f.sendPath('/');
  await expect(app.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  await f.sendPath(`/?projectId=${f.project.id}`);
  await expect(app.getByRole('heading', { name: f.project.name, exact: true })).toBeVisible();
  await expect(app.getByRole('region', { name: 'Board picker' })).toBeVisible();
  await f.sendPath(f.path());
  await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(f.board.id);
  await expect(app.getByRole('button', { name: 'Board', exact: true })).toHaveClass('active');
  await expect(app.getByTestId(`task-${task.number}`)).toHaveCount(0);
  const calls = await page.evaluate(() => (window as any).toolCalls);
  expect(calls.filter((call: any) => call.name === 'get_board')).toHaveLength(2);
});

test('legacy host links work; failed, malformed and missing destinations preserve a usable view and drafts', async ({ page }) => {
  const f = await fixture(page);
  const app = await f.mount({ path: [], query: [['projectId', f.project.id], ['boardId', f.board.id]] }, true);
  await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(f.board.id);
  await app.getByRole('button', { name: 'Open full view', exact: true }).click();
  await expect(app.getByRole('status')).toContainText('Open Threadboard from the Codex sidebar');
  await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(f.board.id);
  const before = await page.evaluate(() => (window as any).toolCalls.filter((call: any) => call.name === 'get_board').length);
  for (const path of ['https://example.com/', '//example.com/', '/?boardId=orphan', '/?projectId=one&projectId=two', '/unknown', '/?projectId=']) await f.sendPath(path);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).toolCalls.filter((call: any) => call.name === 'get_board').length)).toBe(before);
  await expect(app.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(f.board.id);
  await app.getByRole('button', { name: 'New task N', exact: true }).click();
  const dialog = app.getByRole('dialog', { name: 'New task', exact: true });
  await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('Keep this unfinished draft');
  await f.sendPath('/');
  await expect(dialog.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Keep this unfinished draft');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(app.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  await f.sendPath(`/?projectId=${f.project.id}&boardId=missing`);
  await expect(app.getByRole('heading', { name: f.project.name, exact: true })).toBeVisible();
  await expect(app.getByRole('status')).toContainText('That board is no longer available');
  await f.sendPath('/?projectId=removed');
  await expect(app.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  await expect(app.getByRole('status')).toContainText('That Codex project is no longer available');
});
