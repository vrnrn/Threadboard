import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

async function checkLayout(page: Page) {
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('Page scrolls horizontally outside the board.');
    const dialog = document.querySelector<HTMLElement>('.dialog');
    if (dialog && dialog.scrollWidth > dialog.clientWidth + 1) {
      const bounds = dialog.getBoundingClientRect();
      const overflowing = [...dialog.querySelectorAll<HTMLElement>('*:not(option)')].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.right > bounds.right + 1 || rect.left < bounds.left - 1;
      }).map(element => `${element.tagName}.${element.className}`);
      errors.push(`Dialog content overflows horizontally: ${overflowing.join(', ')}`);
    }
    for (const element of document.querySelectorAll<HTMLElement>('.topbar, .board-heading, .board-tile, .board-group-heading, .board-selector-row button, .board-picker, .filters, .filters .select-control, .search')) {
      const rect = element.getBoundingClientRect();
      if (rect.width && (rect.left < -1 || rect.right > innerWidth + 1)) errors.push(`${element.className} escapes the viewport.`);
    }
    for (const element of document.querySelectorAll<HTMLElement>('.select-control')) {
      const select = element.querySelector('select')!.getBoundingClientRect();
      const arrow = element.querySelector('svg')!.getBoundingClientRect();
      if (select.right - arrow.right < 10) errors.push('Dropdown arrow crowds the right border.');
      if (Math.abs(select.top + select.height / 2 - (arrow.top + arrow.height / 2)) > 1) errors.push('Dropdown arrow is vertically misaligned.');
    }
    const filter = document.querySelector('.filter-select')?.getBoundingClientRect();
    const search = document.querySelector('.search')?.getBoundingClientRect();
    if (filter && search && filter.right > search.left - 4) errors.push('Filter crowds the search field.');
    return errors;
  });
  expect(failures).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) test(`review ${theme} controls with long names at desktop, tablet, and phone widths`, async ({ page }, testInfo) => {
  const html = await (await page.request.get('/')).text();
  const token = html.match(/window\.__THREADBOARD_PREVIEW__="([a-f0-9]+)"/)![1];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await page.request.post('/api', { headers: { Authorization: `Bearer ${token}` }, data: { name, args } });
    const body = await response.json(); expect(body.error).toBeUndefined(); return body.data;
  };
  const project = (await call('list_projects')).projects.find((p: any) => p.name === 'Atlas');
  expect(project.root).toContain('threadboard-ui-data-');
  const registry = join(dirname(project.root), 'codex', '.codex-global-state.json');
  const original = readFileSync(registry, 'utf8');
  const longProjectName = 'WorkspaceWithAnUnbrokenNameThatMustNeverPushActionsOutsideThePanel';
  const state = JSON.parse(original); state['local-projects'][project.id].name = longProjectName;
  const boardName = `${theme} release planning with a long name for keyboard and accessibility work`;
  const { board } = await call('create_board', { projectId: project.id, name: boardName, operationId: randomUUID() });
  const args = { projectId: project.id, boardId: board.id };
  const { task } = await call('create_task', { ...args, title: 'Review control spacing and every select field with a long task title', status: 'ready', operationId: randomUUID() });
  await call('claim_task', { projectId: project.id, taskId: task.id, version: task.version, attemptId: randomUUID(), token: randomUUID() + randomUUID(), owner: 'OwnerWithAnUnbrokenNameThatMustTruncateBeforeTheUpdatedTimestamp' });
  await call('create_task', { ...args, title: 'An unusually long prerequisite title that must stay inside the task detail panel', operationId: randomUUID() });
  let last: any;
  for (let index = 0; index < 6; index++) last = (await call('create_task', { ...args, title: `Short card ${index + 1}`, operationId: randomUUID() })).task;
  writeFileSync(registry, JSON.stringify(state));
  try {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your boards', exact: true })).toBeVisible();
    for (const width of [1440, 900, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
      await checkLayout(page);
    }
    await page.getByRole('navigation', { name: 'Project boards' }).getByRole('button', { name: new RegExp(`^${longProjectName},`) }).click();
    await expect(page.getByRole('region', { name: 'Board picker' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('project-picker-320.png'), fullPage: true });
    await checkLayout(page);
    await page.getByTestId(`board-${board.id}`).click();
    for (const width of [1440, 900, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('combobox', { name: 'Filter tasks', exact: true }).selectOption('priority');
      await page.screenshot({ path: testInfo.outputPath(`board-${width}.png`), fullPage: true });
      await checkLayout(page);
      await page.getByRole('combobox', { name: 'Filter tasks', exact: true }).selectOption('all');
      await page.getByRole('button', { name: /^New task/ }).click();
      await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`new-task-${width}.png`) });
      await checkLayout(page);
      await page.getByRole('combobox', { name: 'Priority', exact: true }).focus();
      await page.keyboard.press('u');
      await expect(page.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue('urgent');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'New board', exact: true }).click();
      await page.getByRole('textbox', { name: 'Board name', exact: true }).fill('AReallyLongUnbrokenBoardNameToReviewTheDialogSummaryAndActionLayout');
      await page.screenshot({ path: testInfo.outputPath(`new-board-${width}.png`) });
      await checkLayout(page);
      await page.keyboard.press('Escape');
      await page.getByTestId(`task-${task.number}`).getByRole('button', { name: /Review control spacing/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`task-detail-${width}.png`) });
      await checkLayout(page);
      if (width <= 390) {
        await page.getByRole('combobox', { name: 'Add prerequisite', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`task-detail-aside-${width}.png`) });
      }
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole('button', { name: `Move TB-${last.number}`, exact: true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('last-card-menu.png') });
    const menu = await page.locator('.menu-popover').boundingBox();
    expect(menu!.y).toBeGreaterThanOrEqual(0);
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(900);
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(390);
    const done = page.getByRole('menuitem', { name: 'Done', exact: true });
    expect(await done.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.keyboard.press('End');
    await expect(done).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    const trigger = page.getByRole('button', { name: `Move TB-${last.number}`, exact: true });
    await expect(trigger).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.getByRole('menuitem', { name: 'Ready', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Ready', exact: true }).getByTestId(`task-${last.number}`)).toBeVisible();
  } finally { writeFileSync(registry, original); }
});
