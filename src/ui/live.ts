// One revision read per second, with no overlapping requests or hidden-panel work.
// Failures back off to 30 seconds; returning to the panel retries immediately.
export function watchLocalChanges(check: () => Promise<void>, onError: (failed: boolean) => void) {
  let stopped = false, running = false, wakePending = false, surfaceVisible = true, delay = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => !stopped && surfaceVisible && document.visibilityState !== 'hidden';
  const schedule = (wait: number) => { clearTimeout(timer); if (visible()) timer = setTimeout(() => void tick(), wait); };
  const tick = async () => {
    if (!visible()) return;
    if (running) { wakePending = true; return; }
    running = true;
    try { await check(); delay = 1000; if (!stopped) onError(false); }
    catch { delay = Math.min(delay * 2, 30_000); if (!stopped) onError(true); }
    finally { running = false; schedule(wakePending ? 0 : delay); wakePending = false; }
  };
  const wake = () => { clearTimeout(timer); if (visible()) void tick(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  const observer = new IntersectionObserver(entries => {
    const next = entries[0].isIntersecting;
    if (next !== surfaceVisible) { surfaceVisible = next; wake(); }
  });
  observer.observe(document.getElementById('root')!);
  schedule(1000);
  return () => { stopped = true; clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake); };
}
