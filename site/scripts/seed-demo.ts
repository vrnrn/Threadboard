import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  nativeProject,
  writeNativeProjects,
} from "../../tests/native-fixture.js";
const data = mkdtempSync(join(tmpdir(), "threadboard-site-demo-"));
process.env.THREADBOARD_CODEX_HOME = join(data, "codex");
try {
  const { Store } = await import("../../src/store.js");
  const { seedDemo } = await import("../../tests/demo.js");
  const store = new Store(data);
  try {
    const orbit = seedDemo(store, join(data, "orbit"));
    writeNativeProjects(process.env.THREADBOARD_CODEX_HOME, [
      { id: orbit.id, name: orbit.name, rootPaths: orbit.rootPaths },
      nativeProject("Atlas", join(data, "atlas")),
      nativeProject("Website", join(data, "website")),
    ]);
    store.syncProjects(store.projectSource.list());
    const website = store
      .projects()
      .find((project) => project.name === "Website")!;
    const editorial = store.createBoard({
      projectId: website.id,
      name: "Editorial",
      operationId: randomUUID(),
    });
    store.createTask({
      projectId: website.id,
      boardId: editorial.id,
      title: "Outline the product launch story",
      operationId: randomUUID(),
    });
    const boards = store.boards();
    const tasks = boards
      .flatMap(
        (board) => store.board(board.projectId, 0, false, board.id).tasks,
      )
      .map((task) => store.detail(task.projectId, task.id).task);
    const events = Object.fromEntries(
      tasks.map((task) => [
        task.id,
        store.detail(task.projectId, task.id).events,
      ]),
    );
    const projects = store
      .projects()
      .map((project) => ({
        ...project,
        root: `/workspaces/${project.name.toLowerCase()}`,
        rootPaths: [`/workspaces/${project.name.toLowerCase()}`],
      }));
    writeFileSync(
      new URL("../src/demo/seed.json", import.meta.url),
      JSON.stringify(
        {
          projects,
          boards,
          tasks,
          events,
          projectId: orbit.id,
          boardId: boards.find(
            (board) => board.projectId === orbit.id && board.name === "Product",
          )!.id,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `Generated ${tasks.length} example cards from the real app fixtures.`,
    );
  } finally {
    store.close();
  }
} finally {
  rmSync(data, { recursive: true, force: true });
}
