import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Store } from '../src/store.js';
import { fixtureBoard } from './native-fixture.js';

export function seedPerformance(store: Store, root: string, active: number, archived: number, name: string) {
  mkdirSync(root, { recursive: true });
  const project = fixtureBoard(store, name, root);
  const description = 'Representative local task context. '.repeat(230);
  const criteria = 'Verify the resulting behavior. '.repeat(100);
  const tasks: { id: string; version: number }[] = [];
  for (let i = 0; i < active + archived; i++) {
    const task = store.createTask({ projectId: project.id, title: `Representative task ${i + 1}`, description, criteria, status: 'ready', operationId: randomUUID() });
    if (i < active) tasks.push({ id: task.id, version: task.version });
    else store.archive({ projectId: project.id, taskId: task.id, version: task.version, archived: true });
  }
  return { project, tasks };
}
