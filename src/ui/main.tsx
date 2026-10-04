import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Archive, ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, Clipboard, Download, Flag, FolderOpen, GripVertical, Kanban, Link2, LockKeyhole, Maximize2, MessageSquare, MoreHorizontal, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { call, claimIds, openFullView, openLink, requestBoardChat, setBoardContext, share, start } from './bridge.js';
import type { BoardLocation } from './navigation.js';
import { watchLocalChanges } from './live.js';
import { PRIORITIES, STATUSES, STATUS_LABELS, type Board, type BoardChatRequest, type InitialData, type Launch, type Priority, type Project, type ProjectBoard, type ProjectCatalogue, type Status, type Task, type TaskDetail } from '../types.js';
import './styles.css';

const shortId = (task: Task) => `TB-${task.number}`;
const relative = (date: string) => {
  const seconds = Math.max(0, (Date.now() - Date.parse(date)) / 1000);
  if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`;
};
const priorityName: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const statusIcon: Record<Status, typeof Circle> = { backlog: Circle, ready: CircleDot, in_progress: RefreshCw, review: ShieldCheck, done: CheckCircle2 };

function SelectControl({ children, className = '', ...props }: React.ComponentProps<'select'>) {
  return <span className={`select-control ${className}`}><select {...props}>{children}</select><ChevronDown className="select-chevron" size={16} aria-hidden="true" /></span>;
}

function Dialog({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), label = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const selector = 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]';
    ref.current?.querySelector<HTMLElement>(selector)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(selector) || []).filter(el => el.getClientRects().length);
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey); return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={label} ref={ref}>
      <div className="dialog-heading"><h2 id={label}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button></div>
      {children}
    </div>
  </div>;
}

function NewBoardDialog({ close, create, busy, projectName }: { close: () => void; create: (values: any) => Promise<void>; busy: boolean; projectName: string }) {
  const operationId = useRef(crypto.randomUUID());
  const [name, setName] = useState('');
  return <Dialog title="New board" close={close}><form onSubmit={event => { event.preventDefault(); void create({ name, operationId: operationId.current }); }}>
    <label>Board name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Release planning" /></label>
    <p className="field-hint">Codex will also create “{name.trim() || 'Board name'} Threadboard” in {projectName}. It uses your normal Codex chat and waits for your instructions.</p>
    <div className="dialog-actions"><span className="field-hint"><LockKeyhole size={13} />Saved locally</span><button type="button" className="button" disabled={busy} onClick={close}>Cancel</button><button className="button primary" disabled={busy || !name.trim()}><Plus size={15} />Create board</button></div>
  </form></Dialog>;
}

function NewTaskDialog({ close, create, busy, initialStatus }: { close: () => void; create: (values: any) => Promise<void>; busy: boolean; initialStatus: Status }) {
  const operationId = useRef(crypto.randomUUID());
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [criteria, setCriteria] = useState('');
  const [priority, setPriority] = useState<Priority>('normal'), [status, setStatus] = useState(initialStatus === 'ready' ? 'ready' : 'backlog');
  return <Dialog title="New task" close={close}><form onSubmit={event => { event.preventDefault(); void create({ title, description, criteria, priority, status, operationId: operationId.current }); }}>
    <label>Title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to happen?" /></label>
    <label>Description<textarea rows={4} maxLength={20_000} value={description} onChange={e => setDescription(e.target.value)} placeholder="The goal, useful context, and any constraints." /></label>
    <label>Acceptance criteria<textarea rows={3} maxLength={10_000} value={criteria} onChange={e => setCriteria(e.target.value)} placeholder="How will we know this is finished?" /></label>
    <div className="form-row"><label>Priority<SelectControl value={priority} onChange={e => setPriority(e.target.value as Priority)}>{PRIORITIES.map(p => <option key={p} value={p}>{priorityName[p]}</option>)}</SelectControl></label>
      <label>Column<SelectControl value={status} onChange={e => setStatus(e.target.value)}><option value="backlog">Backlog</option><option value="ready">Ready</option></SelectControl></label></div>
    <div className="dialog-actions"><span className="field-hint"><LockKeyhole size={13} />Saved locally</span><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={busy || !title.trim()}><Plus size={15} />Create task</button></div>
  </form></Dialog>;
}

function TaskMoveMenu({ task, busy, anchor, id, close, move }: { task: Task; busy: boolean; anchor: HTMLButtonElement; id: string; close: (restoreFocus?: boolean) => void; move: (status: Status) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const menu = ref.current!, bounds = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(bounds.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8));
    const top = bounds.bottom + 4 + menu.offsetHeight <= innerHeight - 8 ? bounds.bottom + 4 : Math.max(8, bounds.top - menu.offsetHeight - 4);
    setPosition({ left, top });
  }, [anchor]);
  useLayoutEffect(() => { if (position) ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }, [position]);
  useEffect(() => {
    const bounds = anchor.getBoundingClientRect();
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) close(); };
    const dismiss = () => close();
    const scroll = (event: Event) => {
      const current = anchor.getBoundingClientRect();
      if (!ref.current?.contains(event.target as Node) && (Math.abs(current.left - bounds.left) > 1 || Math.abs(current.top - bounds.top) > 1)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', dismiss); };
  }, [anchor, close]);
  return createPortal(<div className="menu-popover" role="menu" aria-label={`Move ${shortId(task)} to column`} id={id} ref={ref} style={position || { visibility: 'hidden' }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Tab') close(true);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
    }
  }}>{STATUSES.map(s => <button role="menuitem" tabIndex={-1} key={s} disabled={busy || task.status === s || (s === 'in_progress' && task.run?.state !== 'running')} onClick={() => { close(true); move(s); }}><span className={`status-dot ${s}`} />{STATUS_LABELS[s]}{s === task.status && <Check size={13} />}</button>)}</div>, document.body);
}

function TaskCard({ task, open, move, busy, archived }: { task: Task; open: () => void; move: (status: Status) => void; busy: boolean; archived: boolean }) {
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null), menuId = useId();
  const closeMenu = useCallback((restoreFocus = false) => { setMenu(false); if (restoreFocus) menuButton.current?.focus({ preventScroll: true }); }, []);
  const blocked = Boolean(task.blockedReason) || task.dependencies.some(d => d.status !== 'done');
  return <article className={`task-card ${blocked ? 'blocked-card' : ''}`} draggable={!archived && !busy}
    onDragStart={event => { event.dataTransfer.setData('text/threadboard-task', task.id); event.dataTransfer.effectAllowed = 'move'; }} data-testid={`task-${task.number}`}>
    <div className="card-meta"><span className="task-id">{shortId(task)}</span><span className={`priority priority-${task.priority}`}><Flag size={11} />{priorityName[task.priority]}</span>
      <div className="card-menu"><button ref={menuButton} className="icon-button small" aria-label={`Move ${shortId(task)}`} aria-haspopup="menu" aria-controls={menu ? menuId : undefined} aria-expanded={menu} disabled={busy || archived} onClick={() => setMenu(!menu)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setMenu(true); } }}><MoreHorizontal size={17} /></button>
        {menu && menuButton.current && <TaskMoveMenu task={task} busy={busy} anchor={menuButton.current} id={menuId} close={closeMenu} move={move} />}
      </div>
    </div>
    <button className="card-open" onClick={open}><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}</button>
    {blocked && <span className="blocked-label"><CircleDot size={11} />{task.blockedReason ? 'Blocked' : 'Waiting on prerequisite'}</span>}
    <div className="card-footer">{task.run ? <span className="owner"><span className={`owner-dot ${task.run.state === 'launching' ? 'pending' : ''}`} /><span className="owner-name">{task.run.state === 'launching' ? 'Awaiting new chat' : task.run.owner}</span></span> : <span className="unassigned">Unassigned</span>}
      <span className="updated" title={new Date(task.updatedAt).toLocaleString()}>{relative(task.updatedAt)}</span></div>
  </article>;
}

function TaskDialog({ detail, project, projectBoard, close, busy, action, launch, startChat, notify, allTasks, reload }: {
  detail: TaskDetail; project: Project; projectBoard: ProjectBoard; close: () => void; busy: boolean; action: (name: string, args: any) => Promise<any>;
  launch?: Launch; startChat: (task: Task) => Promise<void>; notify: (message: string) => void; allTasks: Task[]; reload: () => Promise<void>;
}) {
  const task = detail.task;
  const [title, setTitle] = useState(task.title), [description, setDescription] = useState(task.description), [criteria, setCriteria] = useState(task.criteria);
  const [priority, setPriority] = useState(task.priority), [blockedReason, setBlocked] = useState(task.blockedReason), [note, setNote] = useState(''), [dependency, setDependency] = useState('');
  const [editVersion, setEditVersion] = useState(task.version);
  const original = useRef(task);
  useEffect(() => {
    const before = original.current;
    const draft = { title, description, criteria, priority, blockedReason };
    const pristine = Object.entries(draft).every(([key, value]) => value === before[key as keyof Task]);
    const contentUnchanged = Object.keys(draft).every(key => task[key as keyof Task] === before[key as keyof Task]);
    const saved = Object.entries(draft).every(([key, value]) => value === task[key as keyof Task]);
    if (pristine) {
      setTitle(task.title); setDescription(task.description); setCriteria(task.criteria); setPriority(task.priority); setBlocked(task.blockedReason);
    }
    if (pristine || contentUnchanged || saved) { setEditVersion(task.version); original.current = task; }
  }, [task]);
  const dirty = title !== task.title || description !== task.description || criteria !== task.criteria || priority !== task.priority || blockedReason !== task.blockedReason;
  const args = { projectId: task.projectId, taskId: task.id, version: task.version };
  const isActive = task.run?.state === 'running' || task.run?.state === 'launching';
  const copy = async (text: string, message: string) => { try { await navigator.clipboard.writeText(text); notify(message); } catch { notify('Clipboard access is unavailable. Select and copy the text manually.'); } };
  return <Dialog title={`${shortId(task)} · ${project.name}`} close={close} wide><div className="task-detail-layout">
    <form className="detail-main" onSubmit={async event => { event.preventDefault(); await action('update_task', { ...args, version: editVersion, title, description, criteria, priority, blockedReason }); }}>
      <label className="title-label">Title<input className="task-title-input" aria-label="Task title" required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Description<textarea rows={5} maxLength={20_000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Add context for the chat that picks this up." /></label>
      <label>Acceptance criteria<textarea rows={4} maxLength={10_000} value={criteria} onChange={e => setCriteria(e.target.value)} placeholder="Describe the finished result and checks." /></label>
      <div className="form-row"><label>Priority<SelectControl value={priority} onChange={e => setPriority(e.target.value as Priority)}>{PRIORITIES.map(p => <option key={p} value={p}>{priorityName[p]}</option>)}</SelectControl></label>
        <label>Blocked reason<input maxLength={1000} value={blockedReason} onChange={e => setBlocked(e.target.value)} placeholder="Optional" /></label></div>
      <div className="save-row"><button className="button primary" disabled={busy || !dirty || !title.trim()}><Check size={15} />Save changes</button><button type="button" className="button quiet" disabled={busy || dirty} title={dirty ? 'Save or copy your draft before reloading' : 'Read the latest local task'} onClick={async () => { await reload(); }}><RefreshCw size={13} />Reload task</button>{dirty && <><button type="button" className="button quiet" onClick={() => void copy(JSON.stringify({ title, description, criteria, priority, blockedReason }, null, 2), 'Draft copied. You can now discard it and reload the latest task.')}><Clipboard size={13} />Copy draft</button><button type="button" className="button quiet" disabled={busy} onClick={() => { setTitle(task.title); setDescription(task.description); setCriteria(task.criteria); setPriority(task.priority); setBlocked(task.blockedReason); void reload(); }}>Discard draft</button></>}</div>
      {dirty && editVersion !== task.version && <p className="field-hint draft-conflict" role="status">This task was edited in another chat. Your draft is preserved. Copy or discard it to review the latest content.</p>}
      <section className="activity-section"><h3><MessageSquare size={15} />Activity <span>{detail.events.length}</span></h3>
        <textarea aria-label="Add a note" rows={2} maxLength={8000} value={note} onChange={e => setNote(e.target.value)} placeholder="Write a note for the next chat…" />
        <div className="note-actions"><button type="button" className="button" disabled={busy || !note.trim()} onClick={async () => { const result = await action('add_comment', { projectId: task.projectId, taskId: task.id, note }); if (result) setNote(''); }}><Send size={13} />Add note</button></div>
        <div className="events">{detail.events.map(event => <div className="event" key={event.id}><span className="event-dot" /><div><p><strong>{event.actor}</strong> <span>{event.kind.replaceAll('_', ' ')}</span><time title={new Date(event.createdAt).toLocaleString()}>{relative(event.createdAt)}</time></p>{event.note && <div className="event-note">{event.note}</div>}</div></div>)}</div>
      </section>
    </form>
    <aside className="detail-aside"><label>Column<SelectControl aria-label="Task column" value={task.status} disabled={busy || task.archived} onChange={e => void action('move_task', { ...args, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s} disabled={s === 'in_progress' && task.run?.state !== 'running'}>{STATUS_LABELS[s]}</option>)}</SelectControl></label>
      <div className="owner-section"><span className="section-label">Ownership</span><p>{task.run ? <><span className="avatar">{task.run.owner.slice(0, 1)}</span>{task.run.owner}</> : <><Circle size={15} />No chat assigned</>}</p>{task.run?.state === 'launching' && <p className="field-hint">Open the new chat and send its prefilled prompt to start work.</p>}</div>
      {!task.archived && !isActive && task.status !== 'done' && task.status !== 'review' && <button type="button" className="button primary full" disabled={busy || Boolean(blockedReason) || task.dependencies.some(d => d.status !== 'done') || dirty} onClick={() => void startChat(task)}><ArrowUpRight size={15} />Start in new chat</button>}
      {task.run?.threadId && <button className="button full" onClick={() => void openLink(`codex://threads/${task.run!.threadId}`).catch(error => notify(error.message))}><ArrowUpRight size={15} />Open chat</button>}
      {launch && task.run?.state === 'launching' && <div className="launch-help"><span className="section-label">Launch prepared</span><button className="button full" onClick={() => void openLink(launch.url).catch(error => notify(error.message))}><ArrowUpRight size={15} />Open prepared chat</button><button className="button full quiet" onClick={() => void copy(launch.prompt, 'Task prompt copied. Send it in a new chat for this workspace.')}><Clipboard size={13} />Copy task prompt</button></div>}
      <button className="button full" disabled={busy || dirty} onClick={() => void share(task, project, projectBoard).then(() => notify(window.__THREADBOARD_PREVIEW__ ? 'Task context copied.' : 'Task added to this conversation’s context.')).catch(error => notify(error.message))}><Link2 size={14} />Share with this chat</button>
      {isActive && <button className="button full quiet" disabled={busy} onClick={() => void action('release_task', args)}>Release ownership</button>}
      {task.status === 'review' && !task.archived && <div className="review-actions"><p>Review the result and its validation before accepting.</p><button className="button primary full" disabled={busy} onClick={() => void action('move_task', { ...args, status: 'done' })}><Check size={15} />Accept into Done</button><button className="button full" disabled={busy} onClick={() => void action('move_task', { ...args, status: 'ready' })}>Request changes</button></div>}
      <div className="dependency-section"><span className="section-label">Prerequisites</span>{task.dependencies.length === 0 && <p className="field-hint">No prerequisites</p>}{task.dependencies.map(d => <div className="dependency" key={d.id}><CheckCircle2 size={13} className={d.status === 'done' ? 'complete' : ''} /><span>{`TB-${d.number}`} {d.title}</span><button className="icon-button small" aria-label={`Remove prerequisite TB-${d.number}`} disabled={busy} onClick={() => void action('link_dependency', { ...args, prerequisiteId: d.id, remove: true })}><X size={12} /></button></div>)}
        <SelectControl aria-label="Add prerequisite" value={dependency} onChange={e => setDependency(e.target.value)}><option value="">Choose a task…</option>{allTasks.filter(t => t.id !== task.id && !task.dependencies.some(d => d.id === t.id)).map(t => <option key={t.id} value={t.id}>{shortId(t)} · {t.title}</option>)}</SelectControl>
        <button className="button quiet full" disabled={busy || !dependency} onClick={async () => { const result = await action('link_dependency', { ...args, prerequisiteId: dependency }); if (result) setDependency(''); }}><Plus size={13} />Add prerequisite</button>
      </div>
      <button className="button quiet full archive-button" disabled={busy || isActive || dirty} onClick={() => void action('archive_task', { ...args, archived: !task.archived })}><Archive size={14} />{task.archived ? 'Restore task' : 'Archive task'}</button>
      <div className="detail-timestamps"><span>Created {new Date(task.createdAt).toLocaleDateString()}</span><span>Updated {relative(task.updatedAt)}</span><span>Version {task.version}</span></div>
    </aside>
  </div></Dialog>;
}

function BoardOverview({ projects, boards, projectId, busy, open, selectProject, create }: {
  projects: Project[]; boards: ProjectBoard[]; projectId: string | null; busy: boolean;
  open: (projectId: string, boardId: string) => void; selectProject: (projectId: string) => void; create: () => void;
}) {
  const groups = new Map<string, ProjectBoard[]>();
  for (const board of boards) {
    const group = groups.get(board.projectId) || [];
    group.push(board); groups.set(board.projectId, group);
  }
  const visible = projectId ? projects.filter(project => project.id === projectId) : projects;
  const count = visible.reduce((sum, project) => sum + (groups.get(project.id)?.length || 0), 0);
  return <>
    <section className="board-heading overview-heading"><div><h1>{projectId ? visible[0]?.name : 'Your boards'}</h1><p>{count} {count === 1 ? 'board' : 'boards'}{!projectId && <><span>·</span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</>}</p></div>
      {projectId && <button className="button primary" disabled={busy} onClick={create}><Plus size={16} />New board</button>}
    </section>
    <div className="board-overview" role="region" aria-label="Board picker">{visible.map(project => <section className="board-group" aria-label={`${project.name} boards`} key={project.id}>
      {!projectId && <div className="board-group-heading"><h2><FolderOpen size={16} />{project.name}</h2><button className="icon-button" aria-label={`View ${project.name} boards`} title={`View ${project.name} boards`} disabled={busy} onClick={() => selectProject(project.id)}><ArrowRight size={16} /></button></div>}
      <div className="board-grid">{(groups.get(project.id) || []).map(item => <button key={item.id} className="board-tile" data-testid={`board-${item.id}`} aria-label={`Open ${item.name}, ${project.name}, ${item.taskCount} tasks`} disabled={busy} onClick={() => open(project.id, item.id)}>
        <span className="board-tile-heading"><span className="board-tile-icon"><Kanban size={19} /></span><span className="board-tile-name">{item.name}</span><ChevronRight size={16} /></span>
        <span className="board-tile-summary">{item.taskCount ? `${item.taskCount - item.doneCount} open · ${item.doneCount} done` : 'No tasks yet'}</span>
        <span className="board-tile-progress" aria-hidden="true"><i style={{ width: `${item.taskCount ? item.doneCount / item.taskCount * 100 : 0}%` }} /></span>
      </button>)}</div>
    </section>)}</div>
  </>;
}

function Threadboard() {
  const [projects, setProjects] = useState<Project[]>([]), [board, setBoard] = useState<Board | null>(null), [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<ProjectBoard[]>([]), [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [liveError, setLiveError] = useState(false);
  const [navigation, setNavigation] = useState<BoardLocation | null>(null), [openingFullView, setOpeningFullView] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<Status | null>(null), [detail, setDetail] = useState<TaskDetail | null>(null);
  const [newBoard, setNewBoard] = useState(false);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<'all'|'priority'|'unassigned'>('all'), [archived, setArchived] = useState(false), [dragOver, setDragOver] = useState<Status | null>(null);
  const [launches, setLaunches] = useState<Record<string, Launch>>({});
  const searchRef = useRef<HTMLInputElement>(null), selectedProject = useRef<string | null>(null), selectedBoard = useRef<string | null>(null), inFlight = useRef(false);
  const liveRevision = useRef<string | undefined>(undefined), interaction = useRef(0), liveChecking = useRef(false);
  const liveView = useRef({ board, detail, busy, loading, dragOver });
  liveView.current = { board, detail, busy, loading, dragOver };
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    void start(theme => { if (alive) document.documentElement.dataset.theme = theme; }, controller.signal, location => { if (alive) setNavigation(location); }).then((data: InitialData) => {
      if (!alive) return; liveRevision.current = data.revision; setProjects(data.projects); setBoards(data.boards || data.board?.boards || []); setBoard(data.board); setProjectId(data.board?.project.id || null); selectedProject.current = data.board?.project.id || null; selectedBoard.current = data.board?.board.id || null;
    }).catch(error => alive && setError(error.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; controller.abort(); };
  }, []);
  useEffect(() => {
    // A host link can arrive before initial data or while a dialog has a draft.
    // Wait for the current interaction to finish instead of discarding it.
    if (!navigation || loading || busy || detail || newBoard || newTaskStatus) return;
    setNavigation(null);
    const project = projects.find(project => project.id === navigation.projectId);
    if (!navigation.projectId) { showOverview(); return; }
    if (!project) { showOverview(); notify('That Codex project is no longer available. Choose a project from Your boards.'); return; }
    if (!navigation.boardId) { showOverview(project.id); return; }
    if (!boards.some(item => item.projectId === project.id && item.id === navigation.boardId)) {
      showOverview(project.id); notify('That board is no longer available. Choose a board from this project.'); return;
    }
    if (selectedProject.current === project.id && selectedBoard.current === navigation.boardId && archived === !!navigation.archived) return;
    void openBoard(project.id, navigation.boardId, !!navigation.archived);
  }, [navigation, loading, busy, detail, newBoard, newTaskStatus, projects, boards]);
  useEffect(() => {
    if (loading) return;
    let alive = true;
    const stop = watchLocalChanges(async () => {
      const snapshot = liveView.current, epoch = interaction.current;
      if (snapshot.busy || snapshot.loading || snapshot.dragOver || inFlight.current || liveChecking.current) return;
      const current = () => alive && document.visibilityState !== 'hidden' && interaction.current === epoch
        && !inFlight.current && !liveView.current.busy && !liveView.current.loading && !liveView.current.dragOver
        && liveView.current.board === snapshot.board && liveView.current.detail === snapshot.detail;
      liveChecking.current = true;
      try {
        const { revision } = await call<{ revision: string }>('get_board_revision');
        if (typeof revision !== 'string') throw new Error('The local revision response is unavailable.');
        if (!current() || revision === liveRevision.current) return;
        const { projects, boards } = await call<ProjectCatalogue>('list_projects');
        if (!current()) return;
        let next: Board | null = null, nextDetail: TaskDetail | null = null;
        if (snapshot.board && projects.some(project => project.id === snapshot.board!.project.id)) {
          const args = { projectId: snapshot.board.project.id, boardId: snapshot.board.board.id, archived };
          let refreshed: Board = await call<Board>('get_board', args);
          // Keep pages the user already loaded. Retry if a writer changes the
          // database between pages, rather than combining different snapshots.
          const wanted = Math.max(200, Math.ceil(snapshot.board.tasks.length / 200) * 200);
          while (refreshed.nextOffset !== null && refreshed.tasks.length < wanted) {
            if (!current()) return;
            const more: Board = await call<Board>('get_board', { ...args, offset: refreshed.nextOffset });
            if (more.revision !== refreshed.revision) return;
            refreshed = { ...more, tasks: [...refreshed.tasks, ...more.tasks] };
          }
          next = refreshed;
          if (!current()) return;
          if (snapshot.detail) nextDetail = await call<TaskDetail>('get_task', { projectId: args.projectId, taskId: snapshot.detail.task.id });
        }
        if (!current()) return;
        // Acknowledge the token checked before these reads, so a concurrent
        // change during the reload still triggers the next check.
        liveRevision.current = revision;
        setProjects(projects); setBoards(boards); setBoard(next); setDetail(nextDetail);
        if (selectedProject.current && !projects.some(project => project.id === selectedProject.current)) { selectedProject.current = null; setProjectId(null); }
        if (!next) selectedBoard.current = null;
      } finally { liveChecking.current = false; }
    }, setLiveError);
    return () => { alive = false; stop(); };
  }, [loading, board?.project.id, board?.board.id, archived]);
  useEffect(() => {
    if (loading || error) return;
    let alive = true;
    void setBoardContext(board?.project || null, board?.board).catch(() => {
      if (alive) notify('The board is ready, but its chat context could not be updated. Reopen the board to retry.');
    });
    return () => { alive = false; };
  }, [loading, board?.project.id, board?.project.name, board?.project.root, board?.board.id, board?.board.name]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 8000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (newBoard || newTaskStatus || detail) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (['INPUT','TEXTAREA','SELECT'].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key.toLowerCase() === 'n' && board) { event.preventDefault(); setNewTaskStatus('backlog'); }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  }, [board, newBoard, newTaskStatus, detail]);

  async function load(projectId: string, showArchive = archived, boardId = selectedBoard.current) {
    const epoch = ++interaction.current;
    const next = await call<Board>('get_board', { projectId, ...(boardId ? { boardId } : {}), archived: showArchive });
    if (interaction.current === epoch && selectedProject.current === projectId && selectedBoard.current === boardId) { liveRevision.current = next.revision; selectedBoard.current = next.board.id; setBoard(next); }
    return next;
  }
  function showOverview(projectId: string | null = null) {
    if (inFlight.current) return;
    interaction.current++;
    selectedProject.current = projectId; selectedBoard.current = null; setProjectId(projectId); setBoard(null); setLoading(false); setDetail(null); setNewBoard(false); setNewTaskStatus(null); setQuery(''); setArchived(false); setError(''); setDragOver(null);
    window.scrollTo(0, 0);
  }
  async function openBoard(projectId: string, boardId: string, showArchive = false) {
    if (inFlight.current) return;
    selectedProject.current = projectId; selectedBoard.current = boardId; setProjectId(projectId); setLoading(true); setDetail(null); setQuery(''); setFilter('all'); setArchived(showArchive); setError('');
    window.scrollTo(0, 0);
    const pending = load(projectId, showArchive, boardId), epoch = interaction.current;
    try { await pending; } catch (error: any) { if (interaction.current === epoch) setError(error.message); }
    finally { if (interaction.current === epoch) setLoading(false); }
  }
  async function selectBoard(boardId: string) {
    if (!board || inFlight.current) return;
    await openBoard(board.project.id, boardId);
  }
  async function expandBoard() {
    if (openingFullView || busy || loading) return;
    setOpeningFullView(true);
    try { await openFullView({ projectId, boardId: board?.board.id, archived }); }
    catch (error: any) { notify(error.message); }
    finally { setOpeningFullView(false); }
  }
  async function setupBoardChat(request?: BoardChatRequest) {
    if ((!board && !request) || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const chat = request || await call<BoardChatRequest>('prepare_board_chat', { projectId: board!.project.id, boardId: board!.board.id });
      if (chat.board.threadId) { await openLink(`codex://threads/${chat.board.threadId}`); return; }
      const sent = await requestBoardChat(chat.prompt);
      notify(sent ? 'Codex is setting up the board chat. Refresh when it finishes.' : 'Chat setup prompt copied. Send it to Codex to create the companion chat.');
      await load(chat.board.projectId);
    } catch (error: any) { notify(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function createBoard(values: any) {
    if (!projectId) return;
    const result = await action('create_board', { projectId, ...values });
    if (!result) return;
    setNewBoard(false);
    await openBoard(projectId, result.board.id);
    if (result.chat.shouldCreate) await setupBoardChat(result.chat);
    else notify('Board saved. Its companion chat setup is already pending.');
  }
  async function refresh() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    interaction.current++;
    const selected = selectedProject.current;
    try {
      const data = await call<ProjectCatalogue>('list_projects'); setProjects(data.projects); setBoards(data.boards);
      if (selected && data.projects.some(p => p.id === selected)) {
        if (selectedBoard.current) await load(selected);
        else liveRevision.current = data.revision;
      } else { liveRevision.current = data.revision; selectedProject.current = null; selectedBoard.current = null; setProjectId(null); setBoard(null); setDetail(null); }
    }
    catch (error: any) { setError(error.message); } finally { inFlight.current = false; setBusy(false); }
  }
  async function action(name: string, args: any) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    interaction.current++;
    try {
      const result = await call(name, args);
      try {
        if (selectedProject.current === args.projectId && selectedBoard.current) {
          await load(args.projectId);
          if (detail && detail.task.id === args.taskId) {
            const refreshed = await call<TaskDetail>('get_task', { projectId: args.projectId, taskId: args.taskId });
            // A saved change must not reopen a dialog the user closed while its
            // refresh was pending, or replace another card they opened.
            setDetail(current => current?.task.id === args.taskId ? refreshed : current);
          }
        }
        const catalogue = await call<ProjectCatalogue>('list_projects'); setProjects(catalogue.projects); setBoards(catalogue.boards);
      } catch {
        setError('Your change was saved. Refresh the board to see the latest state.');
      }
      return result;
    } catch (error: any) { setError(error.message); notify(error.message); return undefined; }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function openTask(task: Task) {
    interaction.current++;
    try { setDetail(await call('get_task', { projectId: task.projectId, taskId: task.id })); } catch (error: any) { notify(error.message); }
  }
  async function move(task: Task, status: Status) {
    if (!board || task.status === status || busy) return;
    await action('move_task', { projectId: task.projectId, taskId: task.id, version: task.version, status });
  }
  async function startChat(task: Task) {
    const result: Launch | undefined = await action('prepare_task_launch', { projectId: task.projectId, taskId: task.id, version: task.version, ...claimIds() });
    if (!result) return;
    setLaunches(prev => ({ ...prev, [task.id]: result }));
    try { await openLink(result.url); notify('New workspace chat opened. Send its prefilled prompt to begin.'); }
    catch (error: any) { notify(error.message); }
  }
  async function download() {
    if (!board) return;
    try {
      const data = await call('export_board', { projectId: board.project.id, boardId: board.board.id });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `threadboard-${board.project.name.replace(/[^a-z0-9_-]/gi, '-')}-${board.board.name.replace(/[^a-z0-9_-]/gi, '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Local board export saved.');
    } catch (error: any) { notify(error.message); }
  }
  const tasks = (board?.tasks || []).filter(t => (!query || `${t.title} ${t.description} ${shortId(t)} ${t.run?.owner || ''}`.toLowerCase().includes(query.toLowerCase())) && (filter !== 'priority' || ['high','urgent'].includes(t.priority)) && (filter !== 'unassigned' || !t.run));
  const doneRatio = board?.total ? Math.round((board.counts.done / board.total) * 100) : 0;
  const activeProject = projects.find(project => project.id === projectId);

  return <div className="app-shell">
    <aside className="sidebar">
      <button className={`project-nav overview-nav ${!projectId ? 'selected' : ''}`} aria-label="Your boards" aria-current={!projectId ? 'page' : undefined} title="Your boards" disabled={busy} onClick={() => showOverview()}><Kanban size={16} /><span className="project-name">Your boards</span></button>
      <div className="sidebar-label">Projects</div>
      <nav aria-label="Project boards">{projects.map(p => <button key={p.id} aria-label={`${p.name}, ${p.taskCount} tasks`} aria-current={projectId === p.id ? 'page' : undefined} title={p.name} className={`project-nav ${projectId === p.id ? 'selected' : ''}`} onClick={() => showOverview(p.id)} disabled={busy}><FolderOpen size={16} /><span className="project-name">{p.name}</span><span className="project-count">{p.taskCount}</span></button>)}</nav>
      {!projects.length && <p className="sidebar-empty">Projects you create in Codex will appear here.</p>}
      <div className="sidebar-bottom"><span><LockKeyhole size={14} />Stored on this device</span><p>No account. No cloud sync.</p></div>
    </aside>
    <main className="workspace"><header className="topbar"><nav className="breadcrumb" aria-label="Breadcrumb"><button disabled={busy} onClick={() => showOverview()}>Your boards</button>{activeProject && <><ChevronRight size={14} />{board ? <button className="breadcrumb-project" title={activeProject.name} disabled={busy} onClick={() => showOverview(activeProject.id)}>{activeProject.name}</button> : <strong>{activeProject.name}</strong>}</>}{board && <><ChevronRight size={14} /><strong title={board.board.name}>{board.board.name}</strong></>}</nav><div className="topbar-right"><span className="local-indicator"><LockKeyhole size={12} />Local</span>{!window.__THREADBOARD_PREVIEW__ && <button className="icon-button" aria-label="Open full view" title="Open full view" disabled={busy || loading || openingFullView} onClick={() => void expandBoard()}><Maximize2 size={16} /></button>}<button className="icon-button" aria-label="Refresh board" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={16} className={busy ? 'spin' : ''} /></button></div></header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void refresh()} disabled={busy}>Retry</button><button className="icon-button small" aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}
      {loading ? <div className="loading-state"><div className="skeleton-title" /><div className="skeleton-board">{[0,1,2,3,4].map(n => <div key={n}><div className="skeleton-card" /><div className="skeleton-card" /></div>)}</div></div> : !board ? projects.length ? <BoardOverview projects={projects} boards={boards} projectId={projectId} busy={busy} open={(projectId, boardId) => void openBoard(projectId, boardId)} selectProject={showOverview} create={() => setNewBoard(true)} /> : <div className="welcome"><div className="welcome-icon"><Kanban size={34} strokeWidth={1.5} /></div><h1>No Codex projects yet</h1><p>Create a project in Codex, then refresh to see its boards here.</p><button className="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} />Refresh projects</button></div> : <>
        <section className="board-heading"><div><h1>{board.project.name}</h1><p>{board.total - board.counts.done} open {board.total - board.counts.done === 1 ? 'task' : 'tasks'}<span>·</span>{board.counts.review} ready for review</p></div><div className="heading-actions"><button className="button" aria-label="Export board" onClick={() => void download()}><Download size={15} /><span>Export</span></button><button className="button primary" disabled={busy} onClick={() => setNewTaskStatus('backlog')}><Plus size={16} />New task<kbd>N</kbd></button></div></section>
        <div className="board-selector-row"><label className="board-picker"><Kanban size={15} /><span>Board</span><SelectControl aria-label="Select board" value={board.board.id} disabled={busy || loading} onChange={event => void selectBoard(event.target.value)}>{board.boards.map(item => <option key={item.id} value={item.id}>{item.name} · {item.taskCount}</option>)}</SelectControl></label><button className="button quiet" disabled={busy} onClick={() => setNewBoard(true)}><Plus size={14} />New board</button><button className="button board-chat-button" disabled={busy} onClick={() => void setupBoardChat()}><MessageSquare size={14} />{board.board.threadId ? 'Open board chat' : board.board.chatRequestId ? 'Finish chat setup' : 'Create board chat'}</button></div>
        <div className="board-toolbar"><div className="view-tabs"><button className={!archived ? 'active' : ''} disabled={busy} onClick={async () => { setArchived(false); await load(board.project.id, false); }}><Kanban size={14} />Board</button><button className={archived ? 'active' : ''} disabled={busy} onClick={async () => { setArchived(true); await load(board.project.id, true); }}><Archive size={14} />Archive</button></div>
          <div className="filters"><SelectControl className="filter-select" aria-label="Filter tasks" value={filter} onChange={e => setFilter(e.target.value as any)}><option value="all">All tasks</option><option value="priority">High priority</option><option value="unassigned">Unassigned</option></SelectControl><label className="search"><Search size={15} /><input ref={searchRef} aria-label="Search tasks" placeholder="Find a task…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label></div>
        </div>
        {board.total === 0 && !archived && <div className="first-task-banner"><Sparkles size={18} /><div><strong>Start with one clear task.</strong><p>Add a goal and acceptance criteria so any chat can pick it up.</p></div><button className="button" onClick={() => setNewTaskStatus('backlog')}><Plus size={14} />Add a task</button></div>}
        <div className="kanban-board" role="region" aria-label="Kanban board">{STATUSES.map(status => {
          const Icon = statusIcon[status], columnTasks = tasks.filter(t => t.status === status);
          return <section className={`column column-${status} ${dragOver === status ? 'drag-over' : ''}`} key={status} aria-label={STATUS_LABELS[status]}
            onDragOver={event => { if (!archived) { event.preventDefault(); setDragOver(status); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }}
            onDrop={event => { event.preventDefault(); setDragOver(null); const taskId = event.dataTransfer.getData('text/threadboard-task'); const target = board.tasks.find(t => t.id === taskId); if (target && !archived) void move(target, status); }}>
            <div className="column-heading"><Icon size={15} /><h2>{STATUS_LABELS[status]}</h2><span className="column-count">{columnTasks.length}</span>{!archived && ['backlog','ready'].includes(status) && <button className="icon-button small" aria-label={`Add task to ${STATUS_LABELS[status]}`} onClick={() => setNewTaskStatus(status)}><Plus size={15} /></button>}</div>
            <div className="column-cards">{columnTasks.map(t => <TaskCard key={t.id} task={t} open={() => void openTask(t)} move={s => void move(t, s)} busy={busy} archived={archived} />)}
              {!columnTasks.length && <div className="column-empty"><span className={`status-dot ${status}`} /><p>{query || filter !== 'all' ? 'No matching tasks' : status === 'backlog' ? 'Ideas start here' : status === 'ready' ? 'Ready for the next chat' : status === 'in_progress' ? 'Claim a task to begin' : status === 'review' ? 'Results come back here' : 'A little progress, every day'}</p></div>}
            </div>{!archived && ['backlog','ready'].includes(status) && <button className="column-add" onClick={() => setNewTaskStatus(status)}><Plus size={14} />Add task</button>}
          </section>;
        })}</div>
        {board.nextOffset !== null && <div className="load-more"><button className="button" disabled={busy} onClick={async () => { interaction.current++; setBusy(true); try { const more = await call<Board>('get_board', { projectId: board.project.id, boardId: board.board.id, offset: board.nextOffset, archived }); if (selectedProject.current === more.project.id && selectedBoard.current === more.board.id) setBoard({ ...more, tasks: [...board.tasks, ...more.tasks] }); } catch (error: any) { notify(error.message); } finally { setBusy(false); } }}><ArrowDown size={14} />Load more tasks ({board.tasks.length} of {board.total})</button></div>}
        <footer className="board-footer"><span><LockKeyhole size={12} />Local board<span className="footer-dot">·</span><span title={liveError ? 'Automatic updates are retrying. You can also refresh manually.' : 'Checks local changes once per second while visible.'}>{liveError ? 'Reconnecting…' : 'Live'}</span></span><div className="progress-summary"><span>{doneRatio}% complete</span><div className="progress-track"><i style={{ width: `${doneRatio}%` }} /></div><span>{board.counts.done}/{board.total}</span></div></footer>
      </>}
    </main>
    {newBoard && activeProject && <NewBoardDialog projectName={activeProject.name} close={() => setNewBoard(false)} busy={busy} create={createBoard} />}
    {newTaskStatus && board && <NewTaskDialog initialStatus={newTaskStatus} close={() => setNewTaskStatus(null)} busy={busy} create={async values => { const result = await action('create_task', { projectId: board.project.id, boardId: board.board.id, ...values }); if (result) { setNewTaskStatus(null); notify(`${shortId(result.task)} created.`); } }} />}
    {detail && board && <TaskDialog key={detail.task.id} detail={detail} project={board.project} projectBoard={board.board} close={() => setDetail(null)} busy={busy} action={action} launch={launches[detail.task.id]} startChat={startChat} notify={notify} allTasks={board.tasks} reload={() => openTask(detail.task)} />}
    {toast && <div className="toast" role="status" aria-live="polite"><span>{toast}</span><button className="icon-button small" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<Threadboard />);
