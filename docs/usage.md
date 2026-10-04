# Using Threadboard

This guide describes the current `0.1.4-dev.6` preview. The downloadable `0.1.1` release uses manually associated workspace boards and manual refresh.

## Open your projects


In the current preview, the **Your boards** overview lists boards grouped by existing Codex projects. Select a project in the sidebar to see its boards, then choose a board. The sidebar and breadcrumb provide a path back to the overview. Threadboard uses Codex's project IDs, names, and workspace roots. Renames update on refresh. Removing a project hides its board and retains its saved tasks; a different native project gets a separate board even if it uses the same directory. Older workspace boards migrate automatically when exactly one native project matches their directory. Unmatched or ambiguous older boards remain saved instead of being merged.

Each project can have multiple named boards. Use the **Board** picker to switch. Existing cards stay on **General**; task numbers remain unique across the project. Cards, archives, dependencies, and exports belong to their selected board.

If Codex leaves Threadboard beside a blank chat after navigating Back, use **Open full view** (the expand icon beside Refresh). It opens Threadboard’s sidebar app through the [documented app deep link](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#deep-links), restoring the current project, named board, and archive view. Links contain only IDs and the archive flag. Codex controls its native Back history and pane arrangement; both a side panel and a sidebar app can report the `fullscreen` display mode. This control requests navigation to the sidebar app; its native layout still needs host verification. Incoming links wait for an open dialog to close, preserving unfinished drafts in that instance.

The workflow is **Backlog → Ready → In progress → Review → Done**. Cards support descriptions, acceptance criteria, priorities, blocked reasons, prerequisites, activity notes, archiving and local JSON export. Use the card's move menu or the detail panel for keyboard-accessible moves; drag between columns with a pointer.

- **Existing chat:** Ask the chat to pick up a specified Threadboard card. The workflow skill reads the card, claims it atomically, reports concise progress, and submits it for review.
- **New chat:** Open a card and choose **Start in new chat**. A native Codex desktop link opens a workspace chat with a prefilled prompt. **Send the prompt** to bind the chat and start work. Preparing the link only reserves the task. It does not auto-send a message or guarantee placement in a particular saved Codex project.
- **Review:** Read the owner's result and validation. Choose **Accept into Done** or **Request changes**.
- **Board companion chat:** Creating a board asks Codex to create `<board name> Threadboard` inside its native project through Codex’s own project-aware chat tool. The board saves only its chat ID. **Open board chat** becomes available when linked and navigates to it. Existing General boards have **Create board chat**. Interrupted setup offers **Finish chat setup**, which checks for an existing chat before recovery. This experiment requires the native host chat tools; unsupported hosts copy a setup prompt for you to send in Codex. It uses a normal Codex model turn, with no separate API integration.
- **Floating chat context:** The native chat bubble receives the selected board and project IDs, names, and workspace as context. Switching boards replaces that context and clears a previously shared card. Automatic task contents are not attached. This context does not assign the host-created chat to the native project or change its working directory; use the chat's **Project** menu for membership. The current extension API has no native project destination parameter.
- **Other chats' changes:** Visible boards check a small local revision token once per second and reload cards only after local storage or project metadata changes. Checks pause when the document or panel is hidden and resume immediately on returning. Open drafts, unsent notes, and loaded pages are preserved. Temporary failures back off to 30 seconds; **Refresh board** remains available. This updates states reported through Threadboard tools; it does not infer progress from chat content or generate model turns.

Chat links use explicitly supplied native chat IDs. The plugin does not inspect transcripts. If a launch is interrupted, reopen its prepared link while the board remains open or copy its prompt. After reopening the board, release the old reservation and start again if its prompt is unavailable. Reservations expire for binding after 15 minutes and require explicit release to reuse the task. Quiet running chats keep ownership until submission or explicit release.

Shortcuts: **N** creates a task, **⌘/Ctrl K** focuses search, **Escape** closes a dialog. Search and filters apply to loaded cards; use **Load more tasks** for boards above 200 cards. Task detail displays the latest 50 activity events; export includes all events.

## Data and updates

Database location:

| Platform | Directory |
| --- | --- |
| macOS | `~/Library/Application Support/Threadboard` |
| Windows | `%LOCALAPPDATA%\Threadboard` |
| Linux | `$XDG_DATA_HOME/threadboard`, or `~/.local/share/threadboard` |

`THREADBOARD_DATA_DIR` can override the database location with an absolute path. The downloadable installer stores plugin files in a separate `marketplace` subdirectory under the default application-data directory. `THREADBOARD_INSTALL_DIR` can override that installation directory.

Native project discovery uses a read-only compatibility adapter for Codex's local project metadata under `CODEX_HOME` (normally `~/.codex`). It extracts project IDs, names, and workspace roots from the desktop registry, excluding local mirrors of ChatGPT cloud projects. It never writes Codex's metadata or opens transcript files. This metadata format is internal to Codex and can change; an unreadable registry reports an error while preserving saved tasks. Metadata is cached; the visible board's revision checks stat the source and reread it only when its filesystem signature changes. No checks run without an open visible board surface.

To update, download the new package and run its installer. It replaces only its marked installation directory; the database remains separate. If you upgrade or relocate Node and Codex can no longer start the plugin, rerun the installer. Repository users can refresh their marketplace and reinstall the newer plugin with the Codex CLI.

For a restorable database backup, stop Codex/plugin processes first, then copy `threadboard.sqlite` and any adjacent `threadboard.sqlite-wal` and `threadboard.sqlite-shm` files together. Restore the files only while the plugin is stopped. JSON export is a readable snapshot, with no JSON import in this release.

To uninstall:

```sh
codex plugin remove threadboard@threadboard-plugins
codex plugin marketplace remove threadboard-plugins
```

Uninstalling preserves task data. See [the privacy policy](../PRIVACY.md) for what is stored and how task context reaches Codex when you choose to use it there.
