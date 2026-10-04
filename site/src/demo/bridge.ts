// The website bundles the real app UI. Only its native transport is replaced;
// example tasks live in this document's memory and never reach an MCP server.
import seed from "./seed.json";
import type { BoardLocation } from "../../../src/ui/navigation.js";
import type {
  InitialData,
  Project,
  ProjectBoard,
  Task,
  TaskEvent,
} from "../../../src/types.js";
interface DemoState {
  projects: Project[];
  boards: ProjectBoard[];
  tasks: Task[];
  events: Record<string, TaskEvent[]>;
  projectId: string;
  boardId: string;
}
const state = structuredClone(seed) as DemoState;
const now = () => new Date().toISOString();
for (const task of state.tasks) {
  task.createdAt = now();
  task.updatedAt = now();
}
for (const entries of Object.values(state.events))
  for (const event of entries) event.createdAt = now();
let revision = 1;
let eventId = Math.max(0, ...Object.values(state.events).flat().map(event => event.id));
const copy = <T>(value: T): T => structuredClone(value);
const token = () => `website-demo-${revision}`;
function catalogue() {
  const counts = (items: any[]) => ({
    taskCount: items.length,
    doneCount: items.filter((task) => task.status === "done").length,
  });
  const tasks = state.tasks.filter((task: Task) => !task.archived);
  return {
    revision: token(),
    projects: state.projects.map((project: Project) => ({
      ...project,
      revision,
      ...counts(tasks.filter((task: Task) => task.projectId === project.id)),
    })),
    boards: state.boards.map((board: ProjectBoard) => ({
      ...board,
      ...counts(tasks.filter((task: Task) => task.boardId === board.id)),
    })),
  };
}
function board(projectId: string, boardId?: string, archived = false) {
  const data = catalogue();
  const project = data.projects.find((item: Project) => item.id === projectId);
  const boards = data.boards.filter(
    (item: ProjectBoard) => item.projectId === projectId,
  );
  const selected = boards.find((item: ProjectBoard) =>
    boardId ? item.id === boardId : item.isDefault,
  );
  if (!project || !selected)
    throw new Error("Choose a demo project and board.");
  const tasks = state.tasks.filter(
    (task: Task) => task.boardId === selected.id && task.archived === archived,
  );
  const counts = Object.fromEntries(
    ["backlog", "ready", "in_progress", "review", "done"].map((status) => [
      status,
      tasks.filter((task: Task) => task.status === status).length,
    ]),
  );
  return {
    project,
    board: selected,
    boards,
    tasks,
    total: tasks.length,
    nextOffset: null,
    counts,
    fetchedAt: now(),
    revision: token(),
  };
}
function taskFor(args: any): Task {
  const task = state.tasks.find(
    (item: Task) =>
      item.id === args.taskId && item.projectId === args.projectId,
  );
  if (!task) throw new Error("This demo card is no longer available.");
  if (args.version && args.version !== task.version)
    throw new Error("This card changed. Refresh to read the latest version.");
  return task;
}
function note(task: Task, text: string, kind = "comment", actor = "You") {
  (state.events[task.id] ||= []).push({
    id: ++eventId,
    taskId: task.id,
    kind,
    actor,
    note: text,
    createdAt: now(),
  });
}
function changed(task?: Task) {
  revision++;
  if (task) {
    task.version++;
    task.updatedAt = now();
    for (const dependent of state.tasks)
      for (const dependency of dependent.dependencies) {
        if (dependency.id === task.id) {
          dependency.status = task.status;
          dependency.title = task.title;
        }
      }
  }
}
export async function call<T = any>(name: string, args: any = {}): Promise<T> {
  let result: any;
  switch (name) {
    case "open_project_board":
      result = {
        ...catalogue(),
        board: board(state.projectId, state.boardId),
        version: "website-demo",
      };
      break;
    case "list_projects":
      result = catalogue();
      break;
    case "get_board_revision":
      result = { revision: token() };
      break;
    case "list_boards":
      result = {
        boards: catalogue().boards.filter(
          (item: ProjectBoard) => item.projectId === args.projectId,
        ),
      };
      break;
    case "get_board":
      result = board(args.projectId, args.boardId, args.archived);
      break;
    case "get_task": {
      const task = taskFor(args);
      result = { task, events: [...(state.events[task.id] || [])].sort((a, b) => b.id - a.id).slice(0, 50) };
      break;
    }
    case "create_task": {
      const selected = board(args.projectId, args.boardId);
      const task: Task = {
        id: crypto.randomUUID(),
        projectId: args.projectId,
        boardId: selected.board.id,
        number:
          Math.max(
            0,
            ...state.tasks
              .filter((task: Task) => task.projectId === args.projectId)
              .map((task: Task) => task.number),
          ) + 1,
        title: args.title.trim(),
        description: args.description || "",
        criteria: args.criteria || "",
        status: args.status || "backlog",
        priority: args.priority || "normal",
        blockedReason: "",
        rank: Date.now(),
        version: 1,
        archived: false,
        createdAt: now(),
        updatedAt: now(),
        run: null,
        dependencies: [],
      };
      state.tasks.push(task);
      note(task, "Created in the interactive demo.", "created");
      changed();
      result = { task };
      break;
    }
    case "update_task": {
      const task = taskFor(args);
      for (const key of [
        "title",
        "description",
        "criteria",
        "priority",
        "blockedReason",
      ])
        if (args[key] !== undefined) (task as any)[key] = args[key];
      changed(task);
      result = { task };
      break;
    }
    case "move_task": {
      const task = taskFor(args);
      if (task.archived) throw new Error("Restore this task before moving it.");
      if (task.status === args.status && (args.rank === undefined || args.rank === task.rank)) {
        result = { task };
        break;
      }
      if (args.status === "in_progress" && task.run?.state !== "running")
        throw new Error(
          "Use Start in new chat to give a chat this task first.",
        );
      if (args.status === "review" && task.run?.state === "launching")
        throw new Error("Send the prepared prompt before submitting work.");
      if (args.status !== task.status && args.status !== "in_progress" && task.run) {
        if (args.status === "review" && task.run.state === "running") task.run.state = "submitted";
        else if (!(args.status === "done" && task.run.state === "submitted")) task.run = null;
      }
      task.status = args.status;
      if (args.rank !== undefined) task.rank = args.rank;
      note(task, `Moved to ${args.status.replace("_", " ")}.`, "moved");
      changed(task);
      result = { task };
      break;
    }
    case "archive_task": {
      const task = taskFor(args);
      if (["running", "launching"].includes(task.run?.state || ""))
        throw new Error("Release the active chat before archiving its task.");
      task.archived = args.archived;
      changed(task);
      result = { task };
      break;
    }
    case "add_comment": {
      const task = taskFor(args);
      note(task, args.note);
      changed(task);
      result = { task };
      break;
    }
    case "link_dependency": {
      const task = taskFor(args);
      const prerequisite = state.tasks.find(
        (item: Task) =>
          item.id === args.prerequisiteId && item.boardId === task.boardId,
      );
      if (!prerequisite || prerequisite.id === task.id)
        throw new Error("Choose another card on this board.");
      const reaches = (id: string, visited = new Set<string>()): boolean => {
        if (id === task.id) return true;
        if (visited.has(id)) return false;
        visited.add(id);
        return (
          state.tasks
            .find((item: Task) => item.id === id)
            ?.dependencies.some((item: any) => reaches(item.id, visited)) ||
          false
        );
      };
      if (!args.remove && reaches(prerequisite.id))
        throw new Error("This prerequisite would create a cycle.");
      task.dependencies = task.dependencies.filter(
        (item) => item.id !== prerequisite.id,
      );
      if (!args.remove)
        task.dependencies.push({
          id: prerequisite.id,
          number: prerequisite.number,
          title: prerequisite.title,
          status: prerequisite.status,
        });
      changed(task);
      result = { task };
      break;
    }
    case "prepare_task_launch": {
      const task = taskFor(args);
      if (task.archived || task.status === "review" || task.status === "done")
        throw new Error("Restore this task or move it to Ready before starting work.");
      if (task.blockedReason || task.dependencies.some(item => item.status !== "done"))
        throw new Error("Resolve this task’s blockers and prerequisites first.");
      if (task.run && ["running", "launching"].includes(task.run.state))
        throw new Error("This card already has a chat owner.");
      task.run = {
        id: crypto.randomUUID(),
        taskId: task.id,
        state: "launching",
        owner: "New Codex chat",
        threadId: null,
        createdAt: now(),
        expiresAt: null,
      };
      changed(task);
      result = {
        task,
        run: task.run,
        token: args.token,
        url: `demo:task:${task.id}`,
        prompt: `TB-${task.number}: ${task.title}\n\n${task.description}\n\n${task.criteria}`,
      };
      break;
    }
    case "release_task": {
      const task = taskFor(args);
      if (!task.run || !["running", "launching"].includes(task.run.state))
        throw new Error("There is no active claim to release.");
      task.run = null;
      task.status = "ready";
      changed(task);
      result = { task };
      break;
    }
    case "create_board": {
      if (state.boards.some(item => item.projectId === args.projectId && item.name.toLowerCase() === args.name.trim().toLowerCase()))
        throw new Error("This project already has a board with that name.");
      const item = {
        id: crypto.randomUUID(),
        projectId: args.projectId,
        name: args.name.trim(),
        isDefault: false,
        taskCount: 0,
        doneCount: 0,
        threadId: null,
        chatRequestId: crypto.randomUUID(),
        createdAt: now(),
      };
      state.boards.push(item);
      changed();
      result = {
        board: item,
        chat: {
          board: item,
          shouldCreate: true,
          requestId: item.chatRequestId,
          title: `${item.name} Threadboard`,
          prompt: "",
        },
      };
      break;
    }
    case "prepare_board_chat":
      throw new Error(
        "Companion chats are available in Codex. Try starting a Ready card here to see the demo handoff.",
      );
    case "export_board": {
      const selected = board(args.projectId, args.boardId);
      result = {
        format: "threadboard-website-demo",
        ...selected,
        events: Object.fromEntries(
          selected.tasks.map((task: Task) => [
            task.id,
            state.events[task.id] || [],
          ]),
        ),
      };
      break;
    }
    default:
      throw new Error(
        "This action is available in the installed Codex plugin.",
      );
  }
  return copy(result);
}
export async function start(
  onTheme: (theme: string) => void,
  signal: AbortSignal,
): Promise<InitialData> {
  window.__THREADBOARD_PREVIEW__ = "website-demo";
  const theme = () => {
    let selected =
      new URLSearchParams(location.search).get("theme") === "light"
        ? "light"
        : "dark";
    try {
      if (window.parent !== window)
        selected =
          window.parent.document.documentElement.dataset.theme || selected;
    } catch {}
    onTheme(selected);
  };
  theme();
  const observer = new MutationObserver(theme);
  try {
    observer.observe(window.parent.document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  } catch {}
  let modalCount = 0;
  const modals = new MutationObserver(() => {
    const count = document.querySelectorAll(
      ".modal-backdrop, dialog[open]",
    ).length;
    if (count > modalCount && window.parent !== window)
      window.parent.postMessage(
        { type: "threadboard-demo-dialog" },
        location.origin,
      );
    modalCount = count;
  });
  modals.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      modals.disconnect();
    },
    { once: true },
  );
  return call("open_project_board");
}
export async function setBoardContext() {}
export async function requestBoardChat() {
  throw new Error("Install Threadboard to create real Codex chats.");
}
export async function openFullView(_location: BoardLocation) {
  window.open(
    `/demo/?theme=${document.documentElement.dataset.theme}`,
    "_blank",
    "noopener",
  );
}
export async function share(
  _task: Task,
  _project: Project,
  _board: ProjectBoard,
) {
  throw new Error(
    "Sending to Codex is available after installation. Demo cards stay in this tab.",
  );
}
export function claimIds() {
  return {
    attemptId: crypto.randomUUID(),
    token: crypto.randomUUID() + crypto.randomUUID(),
  };
}
export async function openLink(url: string) {
  const task = state.tasks.find(
    (item: Task) =>
      url === `demo:task:${item.id}` ||
      (item.run?.threadId && url === `codex://threads/${item.run.threadId}`),
  );
  if (!task?.run) throw new Error("This demo card no longer has a chat.");
  const run = task.run;
  const dialog = document.createElement("dialog");
  dialog.className = "demo-chat";
  dialog.setAttribute("aria-label", "Demo chat handoff");
  const heading = document.createElement("h2");
  heading.textContent = "Demo chat";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "demo-close";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close demo chat");
  const title = document.createElement("h3");
  title.textContent = `TB-${task.number}: ${task.title}`;
  const message = document.createElement("p");
  message.textContent =
    "This simulates the handoff. No Codex chat is created and no model is called.";
  const status = document.createElement("p");
  status.className = "demo-chat-status";
  status.setAttribute("role", "status");
  let submitted = !["launching", "running"].includes(run.state);
  const pending = run.state === "launching";
  status.textContent = pending
    ? "The prompt is ready. Send it to give this demo chat ownership."
    : submitted
      ? "This example result has been submitted. Return to the card to review it."
      : "This demo chat owns the card. Simulate a result to send it to Review.";
  const action = document.createElement("button");
  action.type = "button";
  action.className = "button primary";
  action.textContent = pending
    ? "Send demo prompt"
    : submitted
      ? "Back to the board"
      : "Submit demo result";
  action.addEventListener("click", () => {
    if (task.run !== run) { dialog.close(); return; }
    if (submitted) {
      dialog.close();
      return;
    }
    if (run.state === "launching") {
      run.state = "running";
      run.owner = "Demo chat";
      run.threadId = crypto.randomUUID();
      task.status = "in_progress";
      note(
        task,
        "Demo chat accepted the task and is checking its acceptance criteria.",
        "claimed",
        "Demo chat",
      );
      changed(task);
      status.textContent =
        "The card is now In progress, with one owner. Simulate a result to send it to Review.";
      action.textContent = "Submit demo result";
    } else {
      run.state = "submitted";
      task.status = "review";
      note(
        task,
        "Demo result: completed the example task. Checked each acceptance criterion and verified keyboard navigation. Ready for your review.",
        "submitted",
        "Demo chat",
      );
      changed(task);
      status.textContent =
        "The result is in Review. Close this chat, open the card, and accept it into Done or request changes.";
      action.textContent = "Back to the board";
      submitted = true;
    }
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.append(heading, close, title, message, status, action);
  document.body.append(dialog);
  dialog.showModal();
}
