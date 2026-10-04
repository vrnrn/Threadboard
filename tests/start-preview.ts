import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { nativeProject, writeNativeProjects } from './native-fixture.js';
const data = mkdtempSync(join(tmpdir(), 'threadboard-ui-data-'));
process.env.THREADBOARD_DATA_DIR = data;
process.env.THREADBOARD_CODEX_HOME = join(data, 'codex');
process.env.THREADBOARD_PREVIEW_PORT ||= '4389';
process.on('exit', () => rmSync(data, { recursive: true, force: true }));
if (process.argv.includes('--demo')) {
  const { Store } = await import('../src/store.js');
  const { seedDemo } = await import('./demo.js');
  const store = new Store(data); const project = seedDemo(store, data);
  writeNativeProjects(process.env.THREADBOARD_CODEX_HOME, [
    { id: project.id, name: project.name, rootPaths: project.rootPaths },
    nativeProject('Atlas', join(data, 'atlas')),
    nativeProject('Website', join(data, 'website')),
  ]);
  store.syncProjects(store.projectSource.list());
  const website = store.projects().find(project => project.name === 'Website')!;
  const editorial = store.createBoard({ projectId: website.id, name: 'Editorial', operationId: randomUUID() });
  store.createTask({ projectId: website.id, boardId: editorial.id, title: 'Outline the product launch story', operationId: randomUUID() });
  store.close();
}
if (process.argv.includes('--performance')) {
  const { Store } = await import('../src/store.js');
  const { seedPerformance } = await import('./performance-fixture.js');
  const store = new Store(data); const { project } = seedPerformance(store, join(data, 'workspace'), 2000, 5000, 'Performance board');
  writeNativeProjects(process.env.THREADBOARD_CODEX_HOME, [{ id: project.id, name: project.name, rootPaths: project.rootPaths }]); store.close();
}
if (!process.argv.includes('--demo') && !process.argv.includes('--performance')) {
  writeNativeProjects(process.env.THREADBOARD_CODEX_HOME, Array.from({ length: 10 }, (_, index) => nativeProject(`UI workspace ${index + 1}`, join(data, 'workspaces', String(index + 1)))));
}
await import('../src/preview.js');
