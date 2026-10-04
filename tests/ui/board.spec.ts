import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

async function api(page: Page, name: string, args: Record<string, unknown> = {}) {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
  const body = await response.json();
  expect(body.error, JSON.stringify(body)).toBeUndefined();
  return body.data;
}

async function workspace(page: Page, number: number) {
  const name = `UI workspace ${number}`;
  const project = (await api(page, 'list_projects')).projects.find((p: any) => p.name === name);
  await page.goto('/');
  if (await page.getByRole('heading', { name, exact: true }).count() === 0) {
    await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: new RegExp(`^${name},`) }).click();
  }
  await page.getByRole('button', { name: `Open General, ${name}, ${project.taskCount} tasks`, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return { project, cleanup: () => {} }; // The preview process owns and removes fixture directories.
}

test('create, edit, note, move, archive and restore survive a reload', async ({ page }) => {
  const w = await workspace(page, 1);
  try {
    await page.getByRole('button', { name: 'New task N', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'New task', exact: true });
    await form.getByRole('textbox', { name: 'Title', exact: true }).fill('Ship the welcome flow');
    await form.getByRole('textbox', { name: 'Description', exact: true }).fill('Useful local context');
    await form.getByRole('textbox', { name: 'Acceptance criteria', exact: true }).fill('First-run steps are clear');
    await form.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('high');
    await form.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByTestId('task-1').getByRole('button', { name: /Ship the welcome flow/ }).click();
    const detail = page.getByRole('dialog');
    await expect(detail.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Useful local context');
    await detail.getByRole('textbox', { name: 'Task title', exact: true }).fill('Ship a clearer welcome flow');
    await detail.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(detail.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await detail.getByRole('textbox', { name: 'Add a note', exact: true }).fill('Keep the first step small.');
    await detail.getByRole('button', { name: 'Add note', exact: true }).click();
    await expect(detail.getByRole('textbox', { name: 'Add a note', exact: true })).toHaveValue('');
    await expect(detail.getByText('Keep the first step small.', { exact: true })).toBeVisible();
    await detail.getByRole('combobox', { name: 'Task column', exact: true }).selectOption('ready');
    await expect(detail.getByRole('combobox', { name: 'Task column', exact: true })).toHaveValue('ready');
    await detail.getByRole('button', { name: 'Archive task', exact: true }).click();
    await detail.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByTestId('task-1')).toHaveCount(0);
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByTestId('task-1').getByRole('button', { name: /Ship a clearer welcome flow/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restore task', exact: true }).click();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.reload();
    await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: new RegExp(`^${w.project.name},`) }).click();
    await page.getByRole('button', { name: /^Open General,/ }).click();
    await expect(page.getByRole('region', { name: 'Ready', exact: true }).getByTestId('task-1')).toBeVisible();
  } finally { w.cleanup(); }
});

test('closing a card while its saved change refreshes keeps it closed', async ({ page }) => {
  const w = await workspace(page, 1);
  const { task } = await api(page, 'create_task', { projectId: w.project.id, title: 'Close during refresh', operationId: randomUUID() });
  await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
  await page.getByRole('button', { name: 'Close during refresh', exact: true }).click();
  let release!: () => void, captured!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { captured = resolve; });
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON();
    if (body.name === 'get_task' && body.args.taskId === task.id) {
      const response = await route.fetch(); captured(); await blocked;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await page.getByRole('dialog').getByRole('button', { name: 'Archive task', exact: true }).click();
    await waiting;
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Archive', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close during refresh', exact: true })).toBeVisible();
});

test('a conflicting save preserves the draft and can reload the latest content', async ({ page }) => {
  const w = await workspace(page, 2);
  try {
    const { task } = await api(page, 'create_task', { projectId: w.project.id, title: 'Original title', operationId: randomUUID() });
    await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await page.getByTestId('task-1').getByRole('button', { name: 'Original title', exact: true }).click();
    const detail = page.getByRole('dialog');
    const title = detail.getByRole('textbox', { name: 'Task title', exact: true });
    await title.fill('My unsaved draft');
    await api(page, 'update_task', { projectId: w.project.id, taskId: task.id, version: task.version, title: 'Another chat’s edit' });
    await detail.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('changed in another chat');
    await expect(title).toHaveValue('My unsaved draft');
    expect((await api(page, 'get_task', { projectId: w.project.id, taskId: task.id })).task.title).toBe('Another chat’s edit');
    await detail.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await expect(title).toHaveValue('Another chat’s edit');
    await expect(detail.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  } finally { w.cleanup(); }
});

test('manual refresh sees claimed progress, submission requires explicit acceptance', async ({ page }) => {
  const w = await workspace(page, 3);
  try {
    const { task } = await api(page, 'create_task', { projectId: w.project.id, title: 'Owner workflow', status: 'ready', operationId: randomUUID() });
    const token = randomUUID() + randomUUID();
    const claimed = await api(page, 'claim_task', { projectId: w.project.id, taskId: task.id, version: task.version, token, attemptId: randomUUID(), owner: 'Implementation chat' });
    await api(page, 'submit_task', { projectId: w.project.id, taskId: task.id, runId: claimed.run.id, token, note: 'Implemented with validation evidence.' });
    await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Review', exact: true }).getByTestId('task-1')).toBeVisible();
    await page.getByTestId('task-1').getByRole('button', { name: 'Owner workflow', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Implemented with validation evidence.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Accept into Done', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Task column', exact: true })).toHaveValue('done');
  } finally { w.cleanup(); }
});

test('keyboard focus stays in dialogs and task text cannot inject HTML', async ({ page }) => {
  const w = await workspace(page, 4);
  try {
    await api(page, 'create_task', { projectId: w.project.id, title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', operationId: randomUUID() });
    await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await expect(page.getByTestId('task-1')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('img')).toHaveCount(0);
    await page.keyboard.press('n');
    const dialog = page.getByRole('dialog', { name: 'New task', exact: true });
    await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toBeFocused();
  } finally { w.cleanup(); }
});

test('idle visible boards only check revisions, load no remote assets, and remain usable on small screens', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4389')) external.push(request.url()); });
  const w = await workspace(page, 5);
  try {
    const calls: string[] = [];
    page.on('request', request => { if (request.url().endsWith('/api')) calls.push(request.postDataJSON().name); });
    await page.waitForTimeout(2200); // Deliberately measure idle traffic.
    expect(calls.length).toBeGreaterThanOrEqual(2); expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls.every(name => name === 'get_board_revision')).toBe(true); expect(external).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: /^New task/ })).toBeVisible();
    await page.getByRole('button', { name: /^New task/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible();
  } finally { w.cleanup(); }
});

test('existing Codex projects start empty and refresh native renames and removals', async ({ page }) => {
  const { projects } = await api(page, 'list_projects');
  const project = projects.find((p: any) => p.name === 'UI workspace 8');
  expect(project.taskCount).toBe(0);
  expect(project.root).toContain('threadboard-ui-data-');
  const registry = join(dirname(dirname(project.root)), 'codex', '.codex-global-state.json');
  const original = readFileSync(registry, 'utf8');
  const state = JSON.parse(original);
  try {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Project boards' });
    await expect(nav.getByRole('button')).toHaveCount(10);
    await expect(page.getByRole('button', { name: /Add project/ })).toHaveCount(0);
    await nav.getByRole('button', { name: 'UI workspace 8, 0 tasks', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'UI workspace 8', exact: true })).toBeVisible();
    await expect(page.locator('.task-card')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Board picker', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Open General,/ }).click();
    await expect(page.getByRole('region', { name: 'Kanban board', exact: true })).toBeVisible();
    await api(page, 'create_task', { projectId: project.id, title: 'Native project work', operationId: randomUUID() });
    state['local-projects'][project.id].name = 'Renamed in Codex';
    writeFileSync(registry, JSON.stringify(state));
    await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Renamed in Codex', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Renamed in Codex, 1 tasks', exact: true })).toBeVisible();
    await expect(page.getByTestId('task-1')).toContainText('Native project work');
    delete state['local-projects'][project.id];
    writeFileSync(registry, JSON.stringify(state));
    await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
    await expect(nav.getByRole('button')).toHaveCount(9);
    await expect(page.getByRole('alert')).toHaveCount(0);
    writeFileSync(registry, original);
    await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
    await nav.getByRole('button', { name: 'UI workspace 8, 1 tasks', exact: true }).click();
    await page.getByRole('button', { name: /^Open General,/ }).click();
    await expect(page.getByTestId('task-1')).toContainText('Native project work');
  } finally { writeFileSync(registry, original); }
});

test('long activity names and last-card menus fit narrow panels and remain keyboard usable', async ({ page }) => {
  const w = await workspace(page, 5);
  const { board } = await api(page, 'create_board', { projectId: w.project.id, name: 'Control regression checks', operationId: randomUUID() });
  const args = { projectId: w.project.id, boardId: board.id };
  const { task: owned } = await api(page, 'create_task', { ...args, title: 'Long owner name', status: 'ready', operationId: randomUUID() });
  await api(page, 'claim_task', { projectId: w.project.id, taskId: owned.id, version: owned.version, attemptId: randomUUID(), token: randomUUID() + randomUUID(), owner: 'OwnerWithAnUnbrokenNameThatMustStayInsideTheTaskActivityPanel' });
  let last: any;
  for (let index = 0; index < 8; index++) last = (await api(page, 'create_task', { ...args, title: `Menu check ${index}`, operationId: randomUUID() })).task;
  await page.getByRole('button', { name: 'Refresh board', exact: true }).click();
  await page.getByRole('combobox', { name: 'Select board', exact: true }).selectOption(board.id);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByTestId(`task-${owned.number}`).getByRole('button', { name: 'Long owner name', exact: true }).click();
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  expect(await detail.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const priority = detail.getByRole('combobox', { name: 'Priority', exact: true });
  await priority.focus();
  await page.keyboard.press('u');
  await expect(priority).toHaveValue('urgent');
  await page.keyboard.press('Escape');
  const trigger = page.getByRole('button', { name: `Move TB-${last.number}`, exact: true });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const done = page.getByRole('menuitem', { name: 'Done', exact: true });
  expect(await done.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await page.keyboard.press('End');
  await expect(done).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Ready', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ready', exact: true }).getByTestId(`task-${last.number}`)).toBeVisible();
  expect((await api(page, 'get_task', { projectId: w.project.id, taskId: last.id })).task.status).toBe('ready');
});
