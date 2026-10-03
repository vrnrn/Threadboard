export const STATUSES = ['backlog', 'ready', 'in_progress', 'review', 'done'] as const;
export type Status = typeof STATUSES[number];
export const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog', ready: 'Ready', in_progress: 'In progress', review: 'Review', done: 'Done',
};
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = typeof PRIORITIES[number];

export interface Project {
  id: string; name: string; root: string; revision: number; taskCount: number; doneCount: number;
}
export interface Task {
  id: string; projectId: string; number: number; title: string; description: string; criteria: string;
  status: Status; priority: Priority; blockedReason: string; rank: number; version: number;
  archived: boolean; createdAt: string; updatedAt: string;
  run: Run | null; dependencies: { id: string; number: number; title: string; status: Status }[];
}
export interface Run {
  id: string; taskId: string; state: 'launching' | 'running' | 'submitted' | 'released' | 'failed';
  owner: string; threadId: string | null; createdAt: string; expiresAt: string | null;
}
export interface TaskEvent {
  id: number; taskId: string; kind: string; actor: string; note: string; createdAt: string;
}
export interface Board {
  project: Project; tasks: Task[]; total: number; nextOffset: number | null;
  counts: Record<Status, number>; fetchedAt: string;
}
export interface TaskDetail { task: Task; events: TaskEvent[]; }
export interface InitialData { projects: Project[]; board: Board | null; version: string; }
export interface Launch { run: Run; task: Task; url: string; prompt: string; token: string; }

export class BoardError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'BoardError'; }
}
