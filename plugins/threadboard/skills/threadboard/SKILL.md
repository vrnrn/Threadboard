---
name: threadboard
description: Use Threadboard's fully local Codex project boards to create, find, claim, start, update, review, or archive tasks. Use when the user names Threadboard, asks to work from its board, or supplies a Threadboard task/run handle. Coordinate existing and new Codex chats through Threadboard MCP tools.
---

# Threadboard

Threadboard stores tasks and deliberate progress notes locally. Use its MCP tools; do not open or modify its SQLite database directly. Do not read Codex transcript files, copy conversation history into cards, or upload board data.

## Select a board

Call `list_projects` to discover existing local Codex projects, including projects with no tasks. Use the exact native project ID returned by the tool. Match the current workspace against `rootPaths`; if multiple projects share it, select the project the user requested instead of guessing. Project IDs are opaque strings, not necessarily UUIDs. Call `list_boards` for that project, then `open_project_board` with projectId and boardId to show a named board inside Codex. Omitting boardId selects General, never all boards.

Projects are created, renamed, and removed in Codex itself. Threadboard cannot create independent projects. If the workspace is missing from the list, explain that it must first be saved as a project in Codex, then refresh. Removing a Codex project hides its board while retaining saved tasks.

The native board chat may receive selected-board context with projectId, boardId, their names, and a workspace. Use both exact IDs as the default selection for a requested board operation, while honoring any project the user explicitly specifies. This context does not change native chat membership or the shell's working directory. Do not claim a task merely because the board is selected or the user says hello.

Supply boardId on `open_project_board`, `get_board`, `create_task`, and `export_board`. Other card actions use projectId and taskId; do not add unsupported fields. Use `get_board` with the selected boardId for bounded summaries. Follow `nextOffset` to see additional tasks. Use `get_task` for full content and the latest 50 deliberate notes. IDs and versions come from tools; never invent them.

## Companion chats

Each project can contain named boards. `create_board` returns the board and one companion chat setup request. When the user requests a board with its companion chat, or sends the UI-generated setup prompt, use Codex's native `list_projects` and `create_thread` tools to create “<board name> Threadboard” in the exact native project, with a local environment. Never use projectless creation or infer project membership from the workspace path. If these tools are unavailable, leave setup pending and explain how to send the setup prompt in the Codex desktop app.

Read `list_boards` first. If threadId is set, use that chat. For an interrupted or uncertain request, check native `list_threads` for the exact title and project ID before retrying creation. Only one request is reserved; shouldCreate=false means creation has already been requested or completed, not permission to silently create another chat. Explicit Finish chat setup authorizes recovery after this check. Ask the new companion chat to acknowledge and wait without claiming cards or changing files. Verify native project membership, then call `bind_board_chat` with the returned threadId and the exact projectId, boardId, and requestId. If binding fails after successful creation, retry the binding only. Store no transcript.

## Work in an existing chat

1. Read the requested card and its acceptance criteria with `get_task`.
2. Generate a UUID `attemptId` and an unpredictable claim token of at least 32 characters. Keep both stable if retrying the same claim. Generate them with the local runtime or shell.
3. If available, read the current native chat's ID from `CODEX_THREAD_ID` in the shell environment. Never search transcripts or guess an ID. If unavailable, omit `threadId`.
4. Call `claim_task` with the latest card version, a concise owner label, and the claim values before doing work. A rejected claim means another chat owns the task or a prerequisite is unresolved. Do not steal or release that claim.
5. Keep the returned run ID and token in this chat's working context. A run in `released` or `submitted` state is no longer permission to work.
6. Use `report_progress` for meaningful changes, not constant narration. Include concise, deliberately written facts; omit raw output, private reasoning, and transcript excerpts.
7. Finish with `submit_task`, summarizing the result, validation, and remaining limitations. This moves the card to Review. The user accepts it into Done.

## Bind a card-launched chat

When the launch prompt contains `projectId`, `runId`, and `token`, call `bind_task_run` first with those exact values, an owner label, and a known `CODEX_THREAD_ID` if available. Only begin work after binding succeeds. Then read the task. An expired or released reservation requires the user's explicit restart; do not work under the old handle.

## Board changes

- Create cards with the selected boardId, a clear goal and acceptance criteria. Use a stable UUID `operationId` to avoid duplicates on retries. Start in Backlog or Ready.
- Use the most recently read version for edits, moves, dependencies, archiving, and release. On a version conflict, read the new version and reconcile the user's intended edit; do not blindly overwrite another chat's work.
- Use `link_dependency` for same-board prerequisites. Cycles are rejected. Do not mark a prerequisite Done just to bypass it.
- Reserve a new chat with `prepare_task_launch` only when the user requests a new chat. The returned desktop link opens a workspace chat with a prefilled prompt; the user sends it. Never promise automatic sending, silently open duplicate chats, or claim native project placement without evidence.
- `release_task`, accepting Done, requesting changes, and archiving are explicit user actions. Do not release another owner because it is quiet. Do not accept your own work into Done.
- `export_board` returns a local JSON snapshot containing private task content. Save it only to the destination the user requests. Do not upload it.

## Privacy and cost

The plugin has no account, hosted backend, analytics, or model API integration. Task context deliberately shared with a Codex chat is processed by Codex under the user's normal account and permissions. Avoid saying that such chat context never leaves the device.
