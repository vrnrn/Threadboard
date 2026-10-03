import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

async function api(page: Page, name: string, args: Record<string, unknown> = {}) {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
  const body = await response.json();
  expect(body.error, JSON.stringify(body)).toBeUndefined();
  return body.data;
}

async function workspace(page: Page) {
  const root = mkdtempSync(join(tmpdir(), 'threadboard-ui-workspace-'));
  const name = `Workspace ${randomUUID().slice(0, 8)}`;
  const { project } = await api(page, 'create_project', { name, root });
  await page.goto('/');
  if (await page.getByRole('heading', { name, exact: true }).count() === 0) {
    await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: new RegExp(name) }).click();
  }
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return { project, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('create, edit, note, move, archive and restore survive a reload', async ({ page }) => {
  const w = await workspace(page);
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
    await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: new RegExp(w.project.name) }).click();
    await expect(page.getByRole('region', { name: 'Ready', exact: true }).getByTestId('task-1')).toBeVisible();
  } finally { w.cleanup(); }
});

test('a conflicting save preserves the draft and can reload the latest content', async ({ page }) => {
  const w = await workspace(page);
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
  const w = await workspace(page);
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
  const w = await workspace(page);
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
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toBeFocused();
  } finally { w.cleanup(); }
});

test('idle boards do not poll or load remote assets, and remain usable on small screens', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4389')) external.push(request.url()); });
  const w = await workspace(page);
  try {
    let calls = 0;
    page.on('request', request => { if (request.url().endsWith('/api')) calls++; });
    await page.waitForTimeout(2200); // Deliberately measure idle traffic.
    expect(calls).toBe(0); expect(external).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: /^New task/ })).toBeVisible();
    await page.getByRole('button', { name: /^New task/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible();
  } finally { w.cleanup(); }
});
