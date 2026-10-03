---
name: threadboard
description: Use Threadboard's fully local Codex project boards to create, find, claim, start, update, review, or archive tasks. Use when the user names Threadboard, asks to work from its board, or supplies a Threadboard task/run handle. Coordinate existing and new Codex chats through Threadboard MCP tools.
---

# Threadboard

Threadboard stores tasks and deliberate progress notes locally. Use its MCP tools; do not open or modify its SQLite database directly. Do not read Codex transcript files, copy conversation history into cards, or upload board data.

## Select a board

Call `list_projects` and match the current workspace to its registered canonical root. Use the exact returned project ID. If the user wants a board for an unregistered workspace, call `create_project` with its existing absolute directory and a short name. This associates a local board with a workspace; it does not create a saved native Codex project. Call `open_project_board` to show the board inside Codex.

Use `get_board` for bounded summaries. Follow `nextOffset` to see additional tasks. Use `get_task` for full content and the latest 50 deliberate notes. IDs and versions come from tools; never invent them.

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

- Create cards with a clear goal and acceptance criteria. Use a stable UUID `operationId` to avoid duplicates on retries. Start in Backlog or Ready.
- Use the most recently read version for edits, moves, dependencies, archiving, and release. On a version conflict, read the new version and reconcile the user's intended edit; do not blindly overwrite another chat's work.
- Use `link_dependency` for same-board prerequisites. Cycles are rejected. Do not mark a prerequisite Done just to bypass it.
- Reserve a new chat with `prepare_task_launch` only when the user requests a new chat. The returned desktop link opens a workspace chat with a prefilled prompt; the user sends it. Never promise automatic sending, silently open duplicate chats, or claim native project placement without evidence.
- `release_task`, accepting Done, requesting changes, and archiving are explicit user actions. Do not release another owner because it is quiet. Do not accept your own work into Done.
- `export_board` returns a local JSON snapshot containing private task content. Save it only to the destination the user requests. Do not upload it.

## Privacy and cost

The plugin has no account, hosted backend, analytics, or model API integration. Task context deliberately shared with a Codex chat is processed by Codex under the user's normal account and permissions. Avoid saying that such chat context never leaves the device.
