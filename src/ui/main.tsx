import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, Clipboard, Download, Flag, FolderOpen, GripVertical, Kanban, Link2, LockKeyhole, MessageSquare, MoreHorizontal, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { call, claimIds, openLink, share, start } from './bridge.js';
import { PRIORITIES, STATUSES, STATUS_LABELS, type Board, type InitialData, type Launch, type Priority, type Project, type Status, type Task, type TaskDetail } from '../types.js';
import './styles.css';

const shortId = (task: Task) => `TB-${task.number}`;
const relative = (date: string) => {
  const seconds = Math.max(0, (Date.now() - Date.parse(date)) / 1000);
  if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`;
};
const priorityName: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const statusIcon: Record<Status, typeof Circle> = { backlog: Circle, ready: CircleDot, in_progress: RefreshCw, review: ShieldCheck, done: CheckCircle2 };

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

function ProjectDialog({ close, create, busy }: { close: () => void; create: (name: string, root: string) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState(''), [root, setRoot] = useState('');
  return <Dialog title="Add a project" close={close}><form onSubmit={event => { event.preventDefault(); void create(name, root); }}>
    <p className="dialog-intro">Give an existing workspace a board. Its tasks stay on this device.</p>
    <label>Project name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="My project" /></label>
    <label>Workspace directory<input required value={root} onChange={e => setRoot(e.target.value)} placeholder="Absolute path to an existing folder" autoComplete="off" /></label>
    <p className="field-hint">Use the same workspace directory you open in Codex.</p>
    <div className="dialog-actions"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={busy || !name.trim() || !root.trim()}><Plus size={15} />Add project</button></div>
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
    <div className="form-row"><label>Priority<select value={priority} onChange={e => setPriority(e.target.value as Priority)}>{PRIORITIES.map(p => <option key={p} value={p}>{priorityName[p]}</option>)}</select></label>
      <label>Column<select value={status} onChange={e => setStatus(e.target.value)}><option value="backlog">Backlog</option><option value="ready">Ready</option></select></label></div>
    <div className="dialog-actions"><span className="field-hint"><LockKeyhole size={13} />Saved locally</span><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={busy || !title.trim()}><Plus size={15} />Create task</button></div>
  </form></Dialog>;
}

function TaskCard({ task, open, move, busy, archived }: { task: Task; open: () => void; move: (status: Status) => void; busy: boolean; archived: boolean }) {
  const [menu, setMenu] = useState(false);
  const blocked = Boolean(task.blockedReason) || task.dependencies.some(d => d.status !== 'done');
  return <article className={`task-card ${blocked ? 'blocked-card' : ''}`} draggable={!archived && !busy}
    onDragStart={event => { event.dataTransfer.setData('text/threadboard-task', task.id); event.dataTransfer.effectAllowed = 'move'; }} data-testid={`task-${task.number}`}>
    <div className="card-meta"><span className="task-id">{shortId(task)}</span><span className={`priority priority-${task.priority}`}><Flag size={11} />{priorityName[task.priority]}</span>
      <div className="card-menu"><button className="icon-button small" aria-label={`Move ${shortId(task)}`} aria-expanded={menu} disabled={busy || archived} onClick={() => setMenu(!menu)}><MoreHorizontal size={17} /></button>
        {menu && <div className="menu-popover" onMouseLeave={() => setMenu(false)}>{STATUSES.map(s => <button key={s} disabled={busy || task.status === s || (s === 'in_progress' && task.run?.state !== 'running')} onClick={() => { setMenu(false); move(s); }}><span className={`status-dot ${s}`} />{STATUS_LABELS[s]}{s === task.status && <Check size={13} />}</button>)}</div>}
      </div>
    </div>
    <button className="card-open" onClick={open}><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}</button>
    {blocked && <span className="blocked-label"><CircleDot size={11} />{task.blockedReason ? 'Blocked' : 'Waiting on prerequisite'}</span>}
    <div className="card-footer">{task.run ? <span className="owner"><span className={`owner-dot ${task.run.state === 'launching' ? 'pending' : ''}`} />{task.run.state === 'launching' ? 'Awaiting new chat' : task.run.owner}</span> : <span className="unassigned">Unassigned</span>}
      <span className="updated" title={new Date(task.updatedAt).toLocaleString()}>{relative(task.updatedAt)}</span></div>
  </article>;
}

function TaskDialog({ detail, project, close, busy, action, launch, startChat, notify, allTasks, reload }: {
  detail: TaskDetail; project: Project; close: () => void; busy: boolean; action: (name: string, args: any) => Promise<any>;
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
    if (pristine || contentUnchanged || saved) setEditVersion(task.version);
    original.current = task;
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
      <div className="form-row"><label>Priority<select value={priority} onChange={e => setPriority(e.target.value as Priority)}>{PRIORITIES.map(p => <option key={p} value={p}>{priorityName[p]}</option>)}</select></label>
        <label>Blocked reason<input maxLength={1000} value={blockedReason} onChange={e => setBlocked(e.target.value)} placeholder="Optional" /></label></div>
      <div className="save-row"><button className="button primary" disabled={busy || !dirty || !title.trim()}><Check size={15} />Save changes</button><button type="button" className="button quiet" disabled={busy || dirty} title={dirty ? 'Save or copy your draft before reloading' : 'Read the latest local task'} onClick={async () => { await reload(); }}><RefreshCw size={13} />Reload task</button>{dirty && <><button type="button" className="button quiet" onClick={() => void copy(JSON.stringify({ title, description, criteria, priority, blockedReason }, null, 2), 'Draft copied. You can now discard it and reload the latest task.')}><Clipboard size={13} />Copy draft</button><button type="button" className="button quiet" disabled={busy} onClick={() => { setTitle(task.title); setDescription(task.description); setCriteria(task.criteria); setPriority(task.priority); setBlocked(task.blockedReason); void reload(); }}>Discard draft</button></>}</div>
      <section className="activity-section"><h3><MessageSquare size={15} />Activity <span>{detail.events.length}</span></h3>
        <textarea aria-label="Add a note" rows={2} maxLength={8000} value={note} onChange={e => setNote(e.target.value)} placeholder="Write a note for the next chat…" />
        <div className="note-actions"><button type="button" className="button" disabled={busy || !note.trim()} onClick={async () => { const result = await action('add_comment', { projectId: task.projectId, taskId: task.id, note }); if (result) setNote(''); }}><Send size={13} />Add note</button></div>
        <div className="events">{detail.events.map(event => <div className="event" key={event.id}><span className="event-dot" /><div><p><strong>{event.actor}</strong> <span>{event.kind.replaceAll('_', ' ')}</span><time title={new Date(event.createdAt).toLocaleString()}>{relative(event.createdAt)}</time></p>{event.note && <div className="event-note">{event.note}</div>}</div></div>)}</div>
      </section>
    </form>
    <aside className="detail-aside"><label>Column<select aria-label="Task column" value={task.status} disabled={busy || task.archived} onChange={e => void action('move_task', { ...args, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s} disabled={s === 'in_progress' && task.run?.state !== 'running'}>{STATUS_LABELS[s]}</option>)}</select></label>
      <div className="owner-section"><span className="section-label">Ownership</span><p>{task.run ? <><span className="avatar">{task.run.owner.slice(0, 1)}</span>{task.run.owner}</> : <><Circle size={15} />No chat assigned</>}</p>{task.run?.state === 'launching' && <p className="field-hint">Open the new chat and send its prefilled prompt to start work.</p>}</div>
      {!task.archived && !isActive && task.status !== 'done' && task.status !== 'review' && <button type="button" className="button primary full" disabled={busy || Boolean(blockedReason) || task.dependencies.some(d => d.status !== 'done') || dirty} onClick={() => void startChat(task)}><ArrowUpRight size={15} />Start in new chat</button>}
      {task.run?.threadId && <button className="button full" onClick={() => void openLink(`codex://threads/${task.run!.threadId}`).catch(error => notify(error.message))}><ArrowUpRight size={15} />Open chat</button>}
      {launch && task.run?.state === 'launching' && <div className="launch-help"><span className="section-label">Launch prepared</span><button className="button full" onClick={() => void openLink(launch.url).catch(error => notify(error.message))}><ArrowUpRight size={15} />Open prepared chat</button><button className="button full quiet" onClick={() => void copy(launch.prompt, 'Task prompt copied. Send it in a new chat for this workspace.')}><Clipboard size={13} />Copy task prompt</button></div>}
      <button className="button full" disabled={busy || dirty} onClick={() => void share(task, project).then(() => notify(window.__THREADBOARD_PREVIEW__ ? 'Task context copied.' : 'Task added to this conversation’s context.')).catch(error => notify(error.message))}><Link2 size={14} />Share with this chat</button>
      {isActive && <button className="button full quiet" disabled={busy} onClick={() => void action('release_task', args)}>Release ownership</button>}
      {task.status === 'review' && !task.archived && <div className="review-actions"><p>Review the result and its validation before accepting.</p><button className="button primary full" disabled={busy} onClick={() => void action('move_task', { ...args, status: 'done' })}><Check size={15} />Accept into Done</button><button className="button full" disabled={busy} onClick={() => void action('move_task', { ...args, status: 'ready' })}>Request changes</button></div>}
      <div className="dependency-section"><span className="section-label">Prerequisites</span>{task.dependencies.length === 0 && <p className="field-hint">No prerequisites</p>}{task.dependencies.map(d => <div className="dependency" key={d.id}><CheckCircle2 size={13} className={d.status === 'done' ? 'complete' : ''} /><span>{`TB-${d.number}`} {d.title}</span><button className="icon-button small" aria-label={`Remove prerequisite TB-${d.number}`} disabled={busy} onClick={() => void action('link_dependency', { ...args, prerequisiteId: d.id, remove: true })}><X size={12} /></button></div>)}
        <select aria-label="Add prerequisite" value={dependency} onChange={e => setDependency(e.target.value)}><option value="">Choose a task…</option>{allTasks.filter(t => t.id !== task.id && !task.dependencies.some(d => d.id === t.id)).map(t => <option key={t.id} value={t.id}>{shortId(t)} · {t.title}</option>)}</select>
        <button className="button quiet full" disabled={busy || !dependency} onClick={async () => { const result = await action('link_dependency', { ...args, prerequisiteId: dependency }); if (result) setDependency(''); }}><Plus size={13} />Add prerequisite</button>
      </div>
      <button className="button quiet full archive-button" disabled={busy || isActive || dirty} onClick={() => void action('archive_task', { ...args, archived: !task.archived })}><Archive size={14} />{task.archived ? 'Restore task' : 'Archive task'}</button>
      <div className="detail-timestamps"><span>Created {new Date(task.createdAt).toLocaleDateString()}</span><span>Updated {relative(task.updatedAt)}</span><span>Version {task.version}</span></div>
    </aside>
  </div></Dialog>;
}

function Threadboard() {
  const [projects, setProjects] = useState<Project[]>([]), [board, setBoard] = useState<Board | null>(null), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [projectDialog, setProjectDialog] = useState(false), [newTaskStatus, setNewTaskStatus] = useState<Status | null>(null), [detail, setDetail] = useState<TaskDetail | null>(null);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<'all'|'priority'|'unassigned'>('all'), [archived, setArchived] = useState(false), [dragOver, setDragOver] = useState<Status | null>(null);
  const [launches, setLaunches] = useState<Record<string, Launch>>({});
  const searchRef = useRef<HTMLInputElement>(null), selectedProject = useRef<string | null>(null), inFlight = useRef(false);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    let alive = true;
    void start(theme => { document.documentElement.dataset.theme = theme; }).then((data: InitialData) => {
      if (!alive) return; setProjects(data.projects); setBoard(data.board); selectedProject.current = data.board?.project.id || null;
    }).catch(error => alive && setError(error.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 8000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (projectDialog || newTaskStatus || detail || ['INPUT','TEXTAREA','SELECT'].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key.toLowerCase() === 'n' && board) { event.preventDefault(); setNewTaskStatus('backlog'); }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  }, [board, projectDialog, newTaskStatus, detail]);

  async function load(projectId: string, showArchive = archived) {
    const next = await call<Board>('get_board', { projectId, archived: showArchive });
    if (selectedProject.current === projectId) setBoard(next);
    return next;
  }
  async function selectProject(projectId: string) {
    selectedProject.current = projectId; setLoading(true); setDetail(null); setQuery(''); setArchived(false); setError('');
    try { await load(projectId, false); } catch (error: any) { setError(error.message); } finally { setLoading(false); }
  }
  async function refresh() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    const selected = selectedProject.current;
    try { const data = await call<{projects: Project[]}>('list_projects'); setProjects(data.projects); if (selected) await load(selected); }
    catch (error: any) { setError(error.message); } finally { inFlight.current = false; setBusy(false); }
  }
  async function action(name: string, args: any) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await call(name, args);
      try {
        if (selectedProject.current === args.projectId) {
          await load(args.projectId);
          if (detail && detail.task.id === args.taskId) setDetail(await call('get_task', { projectId: args.projectId, taskId: args.taskId }));
        }
        setProjects((await call<{projects: Project[]}>('list_projects')).projects);
      } catch {
        setError('Your change was saved. Refresh the board to see the latest state.');
      }
      return result;
    } catch (error: any) { setError(error.message); notify(error.message); return undefined; }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function openTask(task: Task) {
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
      const data = await call('export_board', { projectId: board.project.id });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `threadboard-${board.project.name.replace(/[^a-z0-9_-]/gi, '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Local board export saved.');
    } catch (error: any) { notify(error.message); }
  }
  const tasks = (board?.tasks || []).filter(t => (!query || `${t.title} ${t.description} ${shortId(t)} ${t.run?.owner || ''}`.toLowerCase().includes(query.toLowerCase())) && (filter !== 'priority' || ['high','urgent'].includes(t.priority)) && (filter !== 'unassigned' || !t.run));
  const doneRatio = board?.total ? Math.round((board.counts.done / board.total) * 100) : 0;

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={event => event.preventDefault()}><span className="brand-icon"><Kanban size={19} /></span>Threadboard<span className="version-tag">LOCAL</span></a>
      <div className="sidebar-label">WORKSPACES <button className="icon-button small" aria-label="Add project" onClick={() => setProjectDialog(true)}><Plus size={16} /></button></div>
      <nav aria-label="Project boards">{projects.map(p => <button key={p.id} aria-label={`${p.name}, ${p.taskCount} tasks`} title={p.name} className={`project-nav ${board?.project.id === p.id ? 'selected' : ''}`} onClick={() => void selectProject(p.id)} disabled={busy}><span className="project-initial">{p.name.slice(0, 1).toUpperCase()}</span><span className="project-name">{p.name}</span><span className="project-count">{p.taskCount}</span></button>)}</nav>
      {!projects.length && <p className="sidebar-empty">Add your first project to start planning.</p>}
      <button className="sidebar-add" onClick={() => setProjectDialog(true)}><Plus size={15} />Add project</button>
      <div className="sidebar-bottom"><span><LockKeyhole size={14} />Stored on this device</span><p>No account. No cloud sync.</p></div>
    </aside>
    <main className="workspace"><header className="topbar"><div className="breadcrumb"><span>Projects</span><ChevronRight size={14} /><strong>{board?.project.name || 'Your boards'}</strong></div><div className="topbar-right"><span className="local-indicator"><span />Local</span><button className="icon-button" aria-label="Refresh board" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={16} className={busy ? 'spin' : ''} /></button></div></header>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void refresh()} disabled={busy}>Retry</button><button className="icon-button small" aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}
      {loading ? <div className="loading-state"><div className="skeleton-title" /><div className="skeleton-board">{[0,1,2,3,4].map(n => <div key={n}><div className="skeleton-card" /><div className="skeleton-card" /></div>)}</div></div> : !board ? <div className="welcome"><div className="welcome-icon"><Kanban size={34} strokeWidth={1.5} /></div><span className="eyebrow">A PLACE FOR THE NEXT STEP</span><h1>Less scattered.<br />More finished.</h1><p>A local board for your project and the Codex chats working on it. Plan the work, give it an owner, and bring the result back for review.</p><button className="button primary" onClick={() => setProjectDialog(true)}><Plus size={16} />{projects.length ? 'Add a project' : 'Create your first board'}</button>{projects.length > 0 && <p className="welcome-hint">Or choose an existing workspace from the sidebar.</p>}<div className="welcome-features"><span><LockKeyhole size={15} />Local by default</span><span><MessageSquare size={15} />Built around chats</span><span><CheckCircle2 size={15} />Review before Done</span></div></div> : <>
        <section className="board-heading"><div><div className="eyebrow">PROJECT BOARD</div><h1>{board.project.name}</h1><p>{board.total - board.counts.done} open {board.total - board.counts.done === 1 ? 'task' : 'tasks'}<span>·</span>{board.counts.review} ready for review</p></div><div className="heading-actions"><button className="button" aria-label="Export board" onClick={() => void download()}><Download size={15} /><span>Export</span></button><button className="button primary" disabled={busy} onClick={() => setNewTaskStatus('backlog')}><Plus size={16} />New task<kbd>N</kbd></button></div></section>
        <div className="board-toolbar"><div className="view-tabs"><button className={!archived ? 'active' : ''} disabled={busy} onClick={async () => { setArchived(false); await load(board.project.id, false); }}><Kanban size={14} />Board</button><button className={archived ? 'active' : ''} disabled={busy} onClick={async () => { setArchived(true); await load(board.project.id, true); }}><Archive size={14} />Archive</button></div>
          <div className="filters"><select aria-label="Filter tasks" value={filter} onChange={e => setFilter(e.target.value as any)}><option value="all">All tasks</option><option value="priority">High priority</option><option value="unassigned">Unassigned</option></select><label className="search"><Search size={15} /><input ref={searchRef} aria-label="Search tasks" placeholder="Find a task…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label></div>
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
        {board.nextOffset !== null && <div className="load-more"><button className="button" disabled={busy} onClick={async () => { setBusy(true); try { const more = await call<Board>('get_board', { projectId: board.project.id, offset: board.nextOffset, archived }); if (selectedProject.current === more.project.id) setBoard({ ...more, tasks: [...board.tasks, ...more.tasks] }); } catch (error: any) { notify(error.message); } finally { setBusy(false); } }}><ArrowDown size={14} />Load more tasks ({board.tasks.length} of {board.total})</button></div>}
        <footer className="board-footer"><span><LockKeyhole size={12} />Local board<span className="footer-dot">·</span>Refreshed {relative(board.fetchedAt)}</span><div className="progress-summary"><span>{doneRatio}% complete</span><div className="progress-track"><i style={{ width: `${doneRatio}%` }} /></div><span>{board.counts.done}/{board.total}</span></div></footer>
      </>}
    </main>
    {projectDialog && <ProjectDialog close={() => setProjectDialog(false)} busy={busy} create={async (name, root) => { setBusy(true); try { const result = await call<{project: Project}>('create_project', { name, root }); setProjects((await call<{projects: Project[]}>('list_projects')).projects); setProjectDialog(false); await selectProject(result.project.id); } catch (error: any) { notify(error.message); } finally { setBusy(false); } }} />}
    {newTaskStatus && board && <NewTaskDialog initialStatus={newTaskStatus} close={() => setNewTaskStatus(null)} busy={busy} create={async values => { const result = await action('create_task', { projectId: board.project.id, ...values }); if (result) { setNewTaskStatus(null); notify(`${shortId(result.task)} created.`); } }} />}
    {detail && board && <TaskDialog key={detail.task.id} detail={detail} project={board.project} close={() => setDetail(null)} busy={busy} action={action} launch={launches[detail.task.id]} startChat={startChat} notify={notify} allTasks={board.tasks} reload={() => openTask(detail.task)} />}
    {toast && <div className="toast" role="status" aria-live="polite"><span>{toast}</span><button className="icon-button small" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<Threadboard />);
