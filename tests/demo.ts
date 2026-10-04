import { randomUUID } from 'node:crypto';
import type { Store } from '../src/store.js';
import { fixtureBoard } from './native-fixture.js';

export function seedDemo(store: Store, root: string) {
  const project = fixtureBoard(store, 'Orbit', root);
  const product = store.createBoard({ projectId: project.id, name: 'Product', operationId: randomUUID() });
  const release = store.createBoard({ projectId: project.id, name: 'Release', operationId: randomUUID() });
  const cards = [
    ['Guide users through their first task', 'Show new users how to open a board, add a task, and start a chat.', 'backlog', 'high', ''],
    ['Add quick filters to the board', 'Find high-priority work and unassigned tasks without leaving the board.', 'backlog', 'low', ''],
    ['Make every action work with a keyboard', 'Keep focus visible and provide a clear path through each dialog.', 'ready', 'normal', ''],
    ['Polish the empty and error states', 'Give every screen a useful next step, including interrupted launches.', 'ready', 'low', ''],
    ['Preserve tasks across plugin updates', 'Store project data outside the replaceable plugin cache.', 'in_progress', 'high', 'Storage chat'],
    ['Make conflicting edits safe', 'Preserve unsaved drafts when another chat changes a task.', 'in_progress', 'normal', 'Interface chat'],
    ['Package a one-command installation', 'Ship the compiled board, server, workflow skill, and licenses together.', 'review', 'high', 'Release chat'],
    ['Verify atomic task ownership', 'Race independent processes for a card and keep exactly one owner.', 'review', 'normal', 'Testing chat'],
    ['Keep live updates lightweight', 'Check a small local revision while visible and reload cards only when the board changes.', 'done', 'normal', 'Performance chat'],
  ] as const;
  for (const [title, description, status, priority, owner] of cards) {
    let task = store.createTask({ projectId: project.id, boardId: product.id, title, description, criteria: title === 'Package a one-command installation' ? 'Package versions agree.\nA clean Codex profile opens the board.\nUpgrading preserves existing tasks.' : title === 'Verify atomic task ownership' ? '100 claim requests produce exactly one owner.\nOther claimants receive a conflict without changing the card.' : title === 'Keep live updates lightweight' ? 'Check only a local revision while visible.\nPause hidden panels.\nDo not refetch unchanged cards.' : 'Keep keyboard navigation working.\nVerify the changed behavior in the board.', status: status === 'backlog' ? 'backlog' : 'ready', priority, operationId: randomUUID() });
    if (['in_progress','review','done'].includes(status)) {
      const claim = store.claim({ projectId: project.id, taskId: task.id, version: task.version, owner, attemptId: randomUUID(), token: randomUUID() + randomUUID() });
      task = claim.task;
      if (status !== 'in_progress') task = store.note({ projectId: project.id, taskId: task.id, runId: claim.run.id, token: claim.token, note: title === 'Package a one-command installation' ? 'Clean installation passed. Upgrading retained the saved task. All 36 packaged files verified.' : title === 'Verify atomic task ownership' ? '100 requests across independent processes produced one owner and 99 conflicts.' : 'Visible boards use a small revision check. Hidden panels pause; unchanged boards do not reload cards.', submit: true }).task;
      if (status === 'done') store.move({ projectId: project.id, taskId: task.id, version: task.version, status: 'done' });
    }
  }
  for (const [title, status, priority] of [
    ['Refresh the product screenshots', 'ready', 'high'],
    ['Write the next release notes', 'backlog', 'normal'],
    ['Verify the clean installation', 'ready', 'normal'],
  ] as const) store.createTask({ projectId: project.id, boardId: release.id, title, status, priority, operationId: randomUUID() });
  return project;
}
