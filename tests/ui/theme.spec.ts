import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

test('the embedded app uses initial host styles and live theme changes through its MCP bridge', async ({ page }) => {
  const directory = mkdtempSync(join(tmpdir(), 'threadboard-theme-'));
  try {
    const html = await (await page.request.get('/')).text();
    const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
      const body = await response.json(); expect(body.error).toBeUndefined(); return body.data;
    };
    const project = (await call('list_projects', {})).projects.find((p: any) => p.name === 'UI workspace 6');
    await call('create_task', { projectId: project.id, title: 'Use the host theme', operationId: randomUUID() });
    const initial = await call('open_project_board', { projectId: project.id });
    await page.route('http://127.0.0.1:4389/', async route => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace(/<script>window\.__THREADBOARD_PREVIEW__="[a-f0-9]+"<\/script>/, '')
        .replace('</head>', '<style>body { font-family: serif; }</style></head>');
      await route.fulfill({ response, body });
    });
    // A separate parent frame supplies the documented MCP Apps messages. This
    // tests the bundled App/bridge path, rather than the development fetch path.
    await page.route('**/host-fixture', route => route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><body style="margin:0"><iframe title="Threadboard" src="/" style="width:100%;height:100vh;border:0"></iframe>
      <script>
        const frame = document.querySelector('iframe');
        const initial = ${JSON.stringify(initial)}, token = ${JSON.stringify(token)};
        const send = message => frame.contentWindow.postMessage(message, location.origin);
        addEventListener('message', async event => {
          if (event.source !== frame.contentWindow || !event.data.method) return;
          const message = event.data;
          if (message.method === 'ui/initialize') send({ jsonrpc: '2.0', id: message.id, result: {
            protocolVersion: message.params.protocolVersion, hostInfo: { name: 'Theme test host', version: '1' },
            hostCapabilities: { serverTools: {} }, hostContext: { theme: 'dark', styles: { variables: {
              '--color-background-primary': '#151515', '--color-background-secondary': '#262626',
              '--color-text-primary': '#c9c9c9', '--color-text-secondary': '#999999',
              '--color-background-inverse': '#ededed', '--color-text-inverse': '#171717', '--font-sans': 'Arial, sans-serif'
            } } }
          } });
          if (message.method === 'ui/notifications/initialized') send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [], _meta: { threadboard: initial } } });
          if (message.method === 'tools/call') {
            const response = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ name: message.params.name, args: message.params.arguments }) });
            const body = await response.json();
            send({ jsonrpc: '2.0', id: message.id, result: { content: [], structuredContent: body.data, _meta: { threadboard: body.data } } });
          }
        });
      </script></body></html>` }));
    await page.goto('/host-fixture');
    const app = page.frameLocator('iframe[title="Threadboard"]');
    await expect(app.getByRole('heading', { name: 'UI workspace 6', exact: true })).toBeVisible();
    await expect(app.locator('.app-shell')).toHaveCSS('background-color', 'rgb(21, 21, 21)');
    await expect(app.getByTestId('task-1')).toHaveCSS('background-color', 'rgb(38, 38, 38)');
    await expect(app.locator('html')).toHaveCSS('font-family', 'Arial, sans-serif');
    await expect(app.locator('.app-shell')).toHaveCSS('font-family', 'Arial, sans-serif');
    // An explicit host theme takes precedence over the system preference.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(app.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => {
      document.querySelector('iframe')!.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: {
        theme: 'light', styles: { variables: { '--color-background-primary': '#ffffff', '--color-background-secondary': '#f5f5f5', '--color-text-primary': '#202020', '--color-text-secondary': '#737373', '--color-background-inverse': '#202020', '--color-text-inverse': '#ffffff' } },
      } }, location.origin);
    });
    await expect(app.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(app.locator('.app-shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await app.getByRole('button', { name: 'New task N', exact: true }).click();
    const form = app.getByRole('dialog', { name: 'New task', exact: true });
    await expect(form).toHaveCSS('background-color', 'rgb(245, 245, 245)');
    await form.getByRole('textbox', { name: 'Title', exact: true }).fill('Created through the host bridge');
    let calls = 0;
    page.on('request', request => { if (request.url().endsWith('/api') && request.postDataJSON().name !== 'get_board_revision') calls++; });
    // A palette-only notification updates an open dialog without replacing its draft.
    await page.evaluate(() => {
      document.querySelector('iframe')!.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: {
        styles: { variables: { '--color-background-primary': '#f4f6fb', '--color-background-secondary': '#e7eaf3', '--color-background-inverse': '#29354b', '--font-sans': 'Verdana, sans-serif' } },
      } }, location.origin);
    });
    await expect(app.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(app.locator('.app-shell')).toHaveCSS('background-color', 'rgb(244, 246, 251)');
    await expect(form).toHaveCSS('background-color', 'rgb(231, 234, 243)');
    await expect(form).toHaveCSS('font-family', 'Verdana, sans-serif');
    await expect(form.getByRole('button', { name: 'Create task', exact: true })).toHaveCSS('background-color', 'rgb(41, 53, 75)');
    await expect(form.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Created through the host bridge');
    expect(calls).toBe(0);
    await form.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(app.getByTestId('task-2')).toContainText('Created through the host bridge');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('the local preview follows system theme changes without reloading or losing a draft', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name: 'list_projects', args: {} } });
  const project = (await response.json()).data.projects.find((p: any) => p.name === 'UI workspace 7');
  const boardResponse = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name: 'get_board', args: { projectId: project.id } } });
  const board = (await boardResponse.json()).data;
  await page.route('**/api', route => route.fulfill({ json: { data: route.request().postDataJSON().name === 'get_board_revision' ? { revision: board.revision } : { projects: [project], board, revision: board.revision, version: 'fixture' } } }));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'New task N', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'New task', exact: true });
  await form.getByRole('textbox', { name: 'Title', exact: true }).fill('Keep this draft');
  let calls = 0;
  page.on('request', request => { if (request.url().endsWith('/api') && request.postDataJSON().name !== 'get_board_revision') calls++; });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(form).toHaveCSS('background-color', 'rgb(33, 33, 33)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(form).toHaveCSS('background-color', 'rgb(247, 247, 247)');
  await expect(form.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Keep this draft');
  expect(calls).toBe(0);
});
