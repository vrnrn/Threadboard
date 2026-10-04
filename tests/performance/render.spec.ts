import { test, expect } from '@playwright/test';
test('measure useful rendering with 2,000 active and 5,000 archived cards at 4x CPU throttling', async ({ page, browser }) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const metrics = { dataReady: 0, firstPaint: 0, longTasks: [] as number[] };
    (window as any).__THREADBOARD_PERFORMANCE__ = metrics;
    new PerformanceObserver(list => metrics.longTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask', buffered: true });
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args), json = response.json.bind(response);
      response.json = async () => { const data = await json(); if (data.data?.tasks) metrics.dataReady = performance.now(); return data; };
      return response;
    };
    const observer = new MutationObserver(() => {
      if (metrics.dataReady && !metrics.firstPaint && document.querySelector('[data-testid="task-1"]')) {
        observer.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => { metrics.firstPaint = performance.now(); }));
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const samples: number[] = [], longTasks: number[] = [];
  for (let i = 0; i < 20; i++) {
    if (i === 0) await page.goto('/'); else await page.reload();
    await page.getByRole('button', { name: 'Open General, Performance board, 2000 tasks', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Performance board', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__THREADBOARD_PERFORMANCE__.firstPaint)).toBeGreaterThan(0);
    const metrics = await page.evaluate(() => (window as any).__THREADBOARD_PERFORMANCE__);
    samples.push(metrics.firstPaint - metrics.dataReady); longTasks.push(...metrics.longTasks);
    await expect(page.getByTestId('task-1')).toBeVisible();
    await expect(page.getByText('Load more tasks (200 of 2000)', { exact: true })).toBeVisible();
  }
  samples.sort((a,b) => a-b); longTasks.sort((a,b) => a-b);
  console.log(JSON.stringify({ samples: samples.length, cpuThrottle: 4, activeTasks: 2000, archivedTasks: 5000, renderedPage: 200, dataReadyToFirstPaintP50ms: Math.round(samples[9]), dataReadyToFirstPaintP95ms: Math.round(samples[18]), observedLongestTaskMs: Math.round(longTasks.at(-1) || 0), browser: browser.version(), measurement: 'Local preview JSON consumed to two animation frames after card DOM commit; excludes native bridge overhead and initial script loading.' }, null, 2));
  expect(samples[18]).toBeLessThanOrEqual(1000);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
