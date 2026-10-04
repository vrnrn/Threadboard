import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function fixture(page: Page, name: string) {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
    const body = await response.json(); expect(body.error).toBeUndefined(); return body.data;
  };
  const project = (await call('list_projects')).projects.find((p: any) => p.name === 'UI workspace 8');
  const { board } = await call('create_board', { projectId: project.id, name, operationId: randomUUID() });
  const args = { projectId: project.id, boardId: board.id };
  const open = async () => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: /^UI workspace 8,/ }).click();
    await page.getByTestId(`board-${board.id}`).click();
  };
  return { call, project, board, args, open };
}

test('external runs update cards and activity promptly while drafts and conflict versions survive repeated updates', async ({ page }) => {
  const f = await fixture(page, 'Live workflow');
  const { task } = await f.call('create_task', { ...f.args, title: 'Live work', status: 'ready', operationId: randomUUID() });
  await f.open();
  await page.getByTestId(`task-${task.number}`).getByRole('button', { name: 'Live work', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Task title', exact: true }).fill('My unsaved title');
  await dialog.getByRole('textbox', { name: 'Add a note', exact: true }).fill('My unsent note');
  const claim = await f.call('claim_task', { projectId: f.project.id, taskId: task.id, version: task.version, attemptId: randomUUID(), token: randomUUID() + randomUUID(), owner: 'Other working chat' });
  await expect(dialog.getByRole('combobox', { name: 'Task column', exact: true })).toHaveValue('in_progress', { timeout: 2500 });
  await expect(dialog.getByRole('textbox', { name: 'Task title', exact: true })).toHaveValue('My unsaved title');
  await f.call('update_task', { projectId: f.project.id, taskId: task.id, version: claim.task.version, title: 'Another chat’s edit' });
  await expect(dialog.getByText('This task was edited in another chat.', { exact: false })).toBeVisible({ timeout: 2500 });
  await f.call('report_progress', { projectId: f.project.id, taskId: task.id, runId: claim.run.id, token: claim.token, note: 'External progress arrives automatically.' });
  await expect(dialog.getByText('External progress arrives automatically.', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(dialog.getByRole('textbox', { name: 'Add a note', exact: true })).toHaveValue('My unsent note');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'changed in another chat' })).toBeVisible();
  expect((await f.call('get_task', { projectId: f.project.id, taskId: task.id })).task.title).toBe('Another chat’s edit');
  await f.call('submit_task', { projectId: f.project.id, taskId: task.id, runId: claim.run.id, token: claim.token, note: 'Ready for review.' });
  await expect(dialog.getByRole('combobox', { name: 'Task column', exact: true })).toHaveValue('review', { timeout: 2500 });
  await expect(dialog.getByRole('textbox', { name: 'Task title', exact: true })).toHaveValue('My unsaved title');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Review', exact: true }).getByTestId(`task-${task.number}`)).toBeVisible();
  const current = (await f.call('get_task', { projectId: f.project.id, taskId: task.id })).task;
  await f.call('move_task', { projectId: f.project.id, taskId: task.id, version: current.version, status: 'done' });
  await expect(page.getByRole('region', { name: 'Done', exact: true }).getByTestId(`task-${task.number}`)).toBeVisible({ timeout: 2500 });
});

test('hidden documents and hidden panels stop checking and resume immediately', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).fixtureVisibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => (window as any).fixtureVisibility });
  });
  const f = await fixture(page, 'Visibility checks');
  const { task } = await f.call('create_task', { ...f.args, title: 'Hidden work', operationId: randomUUID() });
  await f.open();
  const checks: number[] = [];
  page.on('request', request => { if (request.url().endsWith('/api') && request.postDataJSON().name === 'get_board_revision') checks.push(Date.now()); });
  await expect.poll(() => checks.length).toBeGreaterThan(0);
  await page.evaluate(() => { (window as any).fixtureVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
  const before = checks.length;
  await f.call('move_task', { projectId: f.project.id, taskId: task.id, version: task.version, status: 'ready' });
  await page.waitForTimeout(2200); // Measure the absence of hidden-panel checks.
  expect(checks.length).toBe(before);
  await page.evaluate(() => { (window as any).fixtureVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('region', { name: 'Ready', exact: true }).getByTestId(`task-${task.number}`)).toBeVisible({ timeout: 900 });
  await page.evaluate(() => { document.getElementById('root')!.style.display = 'none'; });
  await page.waitForTimeout(100); // Allow IntersectionObserver to report the hidden surface.
  const concealed = checks.length;
  await page.waitForTimeout(2200);
  expect(checks.length).toBe(concealed);
  await page.evaluate(() => { document.getElementById('root')!.style.display = ''; });
  await expect.poll(() => checks.length, { timeout: 900 }).toBeGreaterThan(concealed);
});

test('a delayed background reload cannot replace a newly selected board', async ({ page }) => {
  const f = await fixture(page, 'Race first');
  await f.call('create_task', { ...f.args, title: 'First-board card', operationId: randomUUID() });
  const { board: second } = await f.call('create_board', { projectId: f.project.id, name: 'Race second', operationId: randomUUID() });
  await f.call('create_task', { projectId: f.project.id, boardId: second.id, title: 'Second-board card', operationId: randomUUID() });
  await f.open();
  let release!: () => void, captured!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { captured = resolve; });
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON();
    if (body.name === 'get_board' && body.args.boardId === f.board.id) {
      const response = await route.fetch(); captured(); await blocked;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await f.call('create_task', { ...f.args, title: 'A delayed external card', operationId: randomUUID() });
    await waiting;
    await page.getByRole('combobox', { name: 'Select board', exact: true }).selectOption(second.id);
    await expect(page.getByRole('button', { name: 'Second-board card', exact: true })).toBeVisible();
  } finally { release(); }
  await expect(page.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(second.id);
  await expect(page.getByRole('button', { name: 'A delayed external card', exact: true })).toHaveCount(0);
});

test('live updates retain all loaded pages rather than resetting to the first 200 cards', async ({ page }) => {
  const f = await fixture(page, 'Live pagination');
  let last: any;
  for (let index = 0; index < 205; index++) last = (await f.call('create_task', { ...f.args, title: `Page card ${index}`, operationId: randomUUID() })).task;
  await f.open();
  await page.getByRole('button', { name: 'Load more tasks (200 of 205)', exact: true }).click();
  await expect(page.locator('.task-card')).toHaveCount(205);
  await f.call('move_task', { projectId: f.project.id, taskId: last.id, version: last.version, status: 'ready' });
  await expect(page.getByRole('region', { name: 'Ready', exact: true }).getByTestId(`task-${last.number}`)).toBeVisible({ timeout: 2500 });
  await expect(page.locator('.task-card')).toHaveCount(205);
  await expect(page.getByRole('button', { name: /Load more tasks/ })).toHaveCount(0);
});

test('slow revision checks never overlap and failures back off until the panel is revisited', async ({ page }) => {
  const f = await fixture(page, 'Retry checks');
  await f.open();
  let release!: () => void, captured!: () => void, fail = true;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { captured = resolve; });
  let calls = 0;
  await page.route('**/api', async route => {
    if (route.request().postDataJSON().name !== 'get_board_revision') { await route.continue(); return; }
    calls++;
    if (calls === 1) { captured(); await blocked; }
    if (fail) await route.fulfill({ status: 503, json: { error: { message: 'Controlled temporary failure' } } });
    else await route.continue();
  });
  try {
    await waiting;
    await page.waitForTimeout(1600); // A slow response must not start a second check.
    expect(calls).toBe(1);
  } finally { release(); }
  await expect(page.locator('.board-footer').getByText('Reconnecting…', { exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  expect(calls).toBe(1); // First failed check waits 2 seconds before retrying.
  await expect.poll(() => calls, { timeout: 1500 }).toBe(2);
  await page.waitForTimeout(1200);
  expect(calls).toBe(2); // A second failure backs off to 4 seconds.
  fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.board-footer').getByText('Live', { exact: true })).toBeVisible({ timeout: 900 });
});

test('pagination recovers from changes between pages and manual refresh keeps loaded cards', async ({ page }) => {
  const f = await fixture(page, 'Changing pagination');
  const tasks: import('../../src/types.js').Task[] = [];
  for (let index = 0; index < 205; index++) tasks.push((await f.call('create_task', { ...f.args, title: `Changing page ${index}`, operationId: randomUUID() })).task);
  await f.open();
  let changed = false;
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON();
    if (!changed && body.name === 'get_board' && body.args.offset === 200) {
      changed = true;
      await f.call('archive_task', { projectId: f.project.id, taskId: tasks[0].id, version: tasks[0].version, archived: true });
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Load more tasks (200 of 205)', exact: true }).click();
  await expect(page.locator('.task-card')).toHaveCount(204);
  await expect(page.getByTestId(`task-${tasks[0].number}`)).toHaveCount(0);
  await expect(page.getByTestId(`task-${tasks[200].number}`)).toHaveCount(1);
  await expect(page.getByTestId(`task-${tasks[204].number}`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh board', exact: true })).toBeEnabled();
  await expect(page.locator('.task-card')).toHaveCount(204);
});
