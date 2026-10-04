export interface BoardLocation {
  projectId: string | null;
  boardId?: string;
  archived?: boolean;
}

// App links carry references only, never workspace paths or task contents.
export function boardPath(location: BoardLocation): string {
  if (!location.projectId) return '/';
  const query = new URLSearchParams({ projectId: location.projectId });
  if (location.boardId) {
    query.set('boardId', location.boardId);
    if (location.archived) query.set('archived', '1');
  }
  return `/?${query}`;
}

export function readBoardPath(path: string): BoardLocation | undefined {
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 2048) return;
  let url: URL;
  try { url = new URL(path, 'https://threadboard.invalid'); } catch { return; }
  if (url.origin !== 'https://threadboard.invalid' || url.pathname !== '/' || url.hash) return;
  const allowed = new Set(['projectId', 'boardId', 'archived']);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return;
  const projectId = url.searchParams.get('projectId'), boardId = url.searchParams.get('boardId');
  const archived = url.searchParams.get('archived');
  for (const id of [projectId, boardId]) if (id !== null && (!id.trim() || id.length > 256 || /[\u0000-\u001f]/.test(id))) return;
  if ((!projectId && boardId) || (archived !== null && (archived !== '1' || !boardId))) return;
  return { projectId, ...(boardId ? { boardId, archived: archived === '1' } : {}) };
}

export function fullViewUrl(location: BoardLocation): string {
  return `codex://plugins/threadboard@threadboard-plugins/app/open_project_board?path=${encodeURIComponent(boardPath(location))}`;
}

export function readHostLocation(value: unknown): BoardLocation | undefined {
  if (!value || typeof value !== 'object') return;
  const state = value as { url?: unknown; path?: unknown; query?: unknown };
  if (typeof state.url === 'string') return readBoardPath(state.url);
  // Older desktop hosts use path/query arrays, as normalized by OpenAI's SDK.
  // Read only this small extension field without bundling unrelated SDK APIs.
  if (!Array.isArray(state.path) || state.path.length !== 0 || !Array.isArray(state.query) || state.query.length > 3) return;
  const pairs: [string, string][] = [];
  for (const pair of state.query) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(value => typeof value !== 'string')) return;
    pairs.push(pair as [string, string]);
  }
  const query = new URLSearchParams(pairs).toString();
  return readBoardPath(query ? `/?${query}` : '/');
}
