import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
test('capture the release board and detail with isolated demonstration data', async ({ page }) => {
  const folder = fileURLToPath(new URL('../../docs/', import.meta.url));
  mkdirSync(folder, { recursive: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Orbit', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Done', exact: true }).getByTestId('task-9')).toBeVisible();
  await page.screenshot({ path: folder + 'board.png', fullPage: true });
  await page.getByTestId('task-7').getByRole('button', { name: /Package a one-command installation/ }).click();
  await expect(page.getByRole('button', { name: 'Accept into Done', exact: true })).toBeVisible();
  await page.screenshot({ path: folder + 'task-detail.png', fullPage: true });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Orbit', exact: true })).toBeVisible();
  await page.screenshot({ path: folder + 'board-dark.png', fullPage: true });
});
