import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const source = new URL('../docs/graphics.html', import.meta.url);
const output = fileURLToPath(new URL('../docs/images/social-preview.png', import.meta.url));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route('http://**/*', route => route.abort());
  await page.route('https://**/*', route => route.abort());
  await page.goto(source.href);
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0)), 'A local graphic is missing.');
  const card = page.locator('.social-card');
  const bounds = await card.boundingBox();
  assert.equal(bounds.width, 1200); assert.equal(bounds.height, 630);
  await card.screenshot({ path: output });
  // Review both banner variants using the same local font renderer.
  for (const theme of ['light', 'dark']) {
    const banner = new URL(`../docs/images/cover${theme === 'dark' ? '-dark' : ''}.svg`, import.meta.url);
    await page.setViewportSize({ width: 1200, height: 280 });
    await page.goto(banner.href);
    await page.screenshot({ path: fileURLToPath(new URL(`../test-results/cover-${theme}.png`, import.meta.url)) });
  }
  console.log('Rendered social-preview.png (1200 × 630) and banner review captures from local assets.');
} finally { await browser.close(); }
