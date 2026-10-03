import { performance } from 'node:perf_hooks';
import { Store } from '../src/store.js';
import { BoardError } from '../src/types.js';
const store = new Store(process.env.THREADBOARD_PERFORMANCE_DIRECTORY!);
process.on('message', (message: any) => {
  if (message.name === 'close') { store.close(); process.exit(0); }
  const start = performance.now();
  try {
    let result: unknown;
    if (message.name === 'read') {
      const board = store.board(message.args.projectId, message.args.offset);
      result = { count: board.tasks.length, total: board.total };
    } else if (message.name === 'write') {
      const task = store.detail(message.args.projectId, message.args.taskId).task;
      store.edit({ ...message.args, version: task.version }); result = {};
    } else if (message.name === 'claim') {
      const claim = store.claim(message.args); result = { runId: claim.run.id };
    } else throw new Error('Unknown performance operation');
    process.send?.({ id: message.id, ok: true, ms: performance.now() - start, result });
  } catch (error) {
    process.send?.({ id: message.id, ok: false, ms: performance.now() - start, code: error instanceof BoardError ? error.code : 'UNEXPECTED_ERROR' });
  }
});
process.send?.({ ready: true });
