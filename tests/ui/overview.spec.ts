import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function fixture(page: Page) {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
    const body = await response.json(); expect(body.error).toBeUndefined(); return body.data;
  };
  const project = (await call('list_projects')).projects.find((p: any) => p.name === 'UI workspace 7');
  return { call, project };
}

test('home and project pickers expose named and empty boards before loading tasks, with paths back', async ({ page }) => {
  const f = await fixture(page);
  const { board } = await f.call('create_board', { projectId: f.project.id, name: 'Navigation release', operationId: randomUUID() });
  const { task } = await f.call('create_task', { projectId: f.project.id, boardId: board.id, title: 'Release-only task', operationId: randomUUID() });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api')) requests.push(request.postDataJSON().name); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  const tile = page.getByTestId(`board-${board.id}`);
  await expect(tile).toContainText('1 open · 0 done');
  await expect(page.getByRole('button', { name: 'Open General, UI workspace 6, 0 tasks', exact: true })).toContainText('No tasks yet');
  expect(requests).not.toContain('get_board');
  const reads = requests.filter(name => name === 'list_projects').length;
  await page.waitForTimeout(2200); // Idle overview should only check its lightweight revision.
  expect(requests.filter(name => name === 'list_projects')).toHaveLength(reads);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Your boards', exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: /^UI workspace 7,/ }).click();
  await expect(page.getByRole('heading', { name: f.project.name, exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Board picker' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open General, UI workspace 6,/ })).toHaveCount(0);
  expect(requests).not.toContain('get_board');
  await tile.focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId(`task-${task.number}`)).toContainText('Release-only task');
  await expect(page.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(board.id);
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: f.project.name, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Board picker' })).toBeVisible();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await tile.click();
  await page.getByRole('button', { name: 'Your boards', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open General, UI workspace 6, 0 tasks', exact: true })).toBeVisible();
  await page.reload();
  await expect(tile).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kanban board' })).toHaveCount(0);
});

test('overview and project picker update new boards and task counts without opening a board', async ({ page }) => {
  const f = await fixture(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  const { board } = await f.call('create_board', { projectId: f.project.id, name: 'Live overview', operationId: randomUUID() });
  const tile = page.getByTestId(`board-${board.id}`);
  await expect(tile).toContainText('No tasks yet', { timeout: 2500 });
  const { task } = await f.call('create_task', { projectId: f.project.id, boardId: board.id, title: 'Overview work', operationId: randomUUID() });
  await expect(tile).toContainText('1 open · 0 done', { timeout: 2500 });
  await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: /^UI workspace 7,/ }).click();
  await f.call('move_task', { projectId: f.project.id, taskId: task.id, version: task.version, status: 'done' });
  await expect(tile).toContainText('0 open · 1 done', { timeout: 2500 });
  await expect(page.getByRole('heading', { name: f.project.name, exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Board picker' })).toBeVisible();
});

test('new boards can be created from the project picker without opening General', async ({ page }) => {
  const f = await fixture(page);
  await page.context().grantPermissions(['clipboard-write']);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: /^UI workspace 7,/ }).click();
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New board', exact: true });
  await dialog.getByRole('textbox', { name: 'Board name', exact: true }).fill('Created from picker');
  await dialog.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: 'Kanban board' })).toBeVisible();
  const selected = (await f.call('list_boards', { projectId: f.project.id })).boards.find((board: any) => board.name === 'Created from picker');
  await expect(page.getByRole('combobox', { name: 'Select board', exact: true })).toHaveValue(selected.id);
  await expect(page.getByRole('button', { name: 'Finish chat setup', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Your boards', exact: true }).first().click();
  await expect(page.getByTestId(`board-${selected.id}`)).toBeVisible();
});

test('returning home during a slow board open discards the old response', async ({ page }) => {
  const f = await fixture(page);
  const { board } = await f.call('create_board', { projectId: f.project.id, name: 'Slow board open', operationId: randomUUID() });
  let release!: () => void, captured!: () => void, completed!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { captured = resolve; });
  const delivered = new Promise<void>(resolve => { completed = resolve; });
  await page.route('**/api', async route => {
    if (route.request().postDataJSON().name !== 'get_board') { await route.continue(); return; }
    const response = await route.fetch(); captured(); await blocked;
    await route.fulfill({ response }); completed();
  });
  await page.goto('/');
  await page.getByTestId(`board-${board.id}`).click();
  await waiting;
  try {
    await page.getByRole('button', { name: 'Your boards', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
  } finally { release(); }
  await delivered;
  await expect(page.getByRole('region', { name: 'Board picker' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kanban board' })).toHaveCount(0);
});
