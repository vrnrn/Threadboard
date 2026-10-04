import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const site = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: site, env: { ...process.env, THREADBOARD_SITE_PORT: '4402' }, stdio: 'ignore' });
const browser = await chromium.launch();
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch('http://127.0.0.1:4402/assets/share.svg')).ok) break; } catch {}
    if (attempt === 39) throw new Error('Share graphic preview failed to start.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4402/assets/share.svg');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('image').evaluate(async image => { const response = await fetch(image.getAttribute('href')); if (!response.ok) throw new Error('Board capture missing.'); });
  await page.screenshot({ path: fileURLToPath(new URL('../src/assets/share.png', import.meta.url)) });
  console.log('Rendered the 1200 × 630 Threadboard social image from its editable SVG and actual board capture.');
} finally { await browser.close(); server.kill(); }
