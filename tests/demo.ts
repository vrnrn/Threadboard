import { randomUUID } from 'node:crypto';
import type { Store } from '../src/store.js';

export function seedDemo(store: Store, root: string) {
  const project = store.createProject('Orbit', root);
  const cards = [
    ['Make onboarding feel effortless', 'Help a new user get from installation to their first useful task. Keep the flow short and make each next step clear.', 'backlog', 'high', ''],
    ['Add quick filters to the board', 'Find high-priority work and unassigned tasks without leaving the board.', 'backlog', 'low', ''],
    ['Make every action work with a keyboard', 'Keep focus visible and provide a clear path through each dialog.', 'ready', 'normal', ''],
    ['Polish the empty and error states', 'Give every screen a useful next step, including interrupted launches.', 'ready', 'low', ''],
    ['Preserve tasks across plugin updates', 'Store project data outside the replaceable plugin cache.', 'in_progress', 'high', 'Storage chat'],
    ['Make conflicting edits safe', 'Preserve unsaved drafts when another chat changes a task.', 'in_progress', 'normal', 'Interface chat'],
    ['Package a one-command installation', 'Ship the compiled board, server, workflow skill, and licenses together.', 'review', 'high', 'Release chat'],
    ['Verify atomic task ownership', 'Race independent processes for a card and keep exactly one owner.', 'review', 'normal', 'Testing chat'],
    ['Keep idle boards quiet', 'Refresh after deliberate actions and avoid periodic polling.', 'done', 'normal', 'Performance chat'],
  ] as const;
  for (const [title, description, status, priority, owner] of cards) {
    let task = store.createTask({ projectId: project.id, title, description, criteria: 'The result is clear, usable, and covered by the appropriate checks.', status: status === 'backlog' ? 'backlog' : 'ready', priority, operationId: randomUUID() });
    if (['in_progress','review','done'].includes(status)) {
      const claim = store.claim({ projectId: project.id, taskId: task.id, version: task.version, owner, attemptId: randomUUID(), token: randomUUID() + randomUUID() });
      task = claim.task;
      if (status !== 'in_progress') task = store.note({ projectId: project.id, taskId: task.id, runId: claim.run.id, token: claim.token, note: 'Implemented the planned behavior. Validation passed; ready for review.', submit: true }).task;
      if (status === 'done') store.move({ projectId: project.id, taskId: task.id, version: task.version, status: 'done' });
    }
  }
  return project;
}
