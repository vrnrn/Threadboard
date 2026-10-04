import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { canonicalRoot } from '../src/codex-projects.js';
import type { NativeProject } from '../src/types.js';
import type { Store } from '../src/store.js';

export function nativeProject(name: string, root: string, id: string = randomUUID()): NativeProject {
  mkdirSync(root, { recursive: true });
  return { id, name, rootPaths: [canonicalRoot(root)] };
}
export function writeNativeProjects(home: string, projects: readonly NativeProject[]) {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, '.codex-global-state.json'), JSON.stringify({ 'local-projects': Object.fromEntries(projects.map(p => [p.id, p])) }));
}
export function fixtureBoard(store: Store, name: string, root: string) {
  const project = nativeProject(name, root);
  store.syncProjects([project]);
  return store.projects(project.id)[0];
}
