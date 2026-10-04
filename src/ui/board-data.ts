import type { Board } from '../types.js';

// Offset pages are safe to combine only while their revision stays unchanged.
export async function readBoardPages(read: (offset: number) => Promise<Board>, wanted = 200): Promise<Board> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let snapshot = await read(0);
    let changed = false;
    while (snapshot.nextOffset !== null && snapshot.tasks.length < wanted) {
      const next = await read(snapshot.nextOffset);
      if (next.revision !== snapshot.revision) { changed = true; break; }
      snapshot = { ...next, tasks: [...snapshot.tasks, ...next.tasks] };
    }
    if (!changed) return snapshot;
  }
  throw new Error('The board changed while loading. Refresh to try again.');
}
