# Threadboard privacy

Last updated: 4 October 2026.

Threadboard is a local Codex plugin. It operates a stdio MCP server and an embedded board. It has no hosted service, login, analytics, advertisements, telemetry, or model API integration. Its runtime makes no outbound network requests.

## Local data

The plugin stores native project IDs, names and canonical workspace paths; named boards, their companion chat IDs and setup request IDs; task titles, descriptions, acceptance criteria, priorities and states; prerequisites; activity notes; and task ownership handles. When supplied explicitly, a native Codex chat ID is stored to enable an Open chat link. Claim tokens are hashed in storage. The plugin does not open Codex transcript files, query chat-content tables, copy conversation history, or read repository file contents. A task's workspace directory is checked for existence before a new-chat launch.

The repository and website preview discovers projects from Codex's local metadata. Its read-only adapter extracts only project IDs, names, and root paths from the desktop state file, excluding ChatGPT cloud project mirrors. Unrelated desktop state is not returned or stored. Threadboard never modifies this source and does not open Codex's conversation database. Project metadata remains local, alongside task data. The published 0.1.1 release instead uses manually associated workspace boards.

While the board is visible, its embedded UI checks an opaque local revision token once per second and reloads local board data only after changes. Checks pause for hidden documents and panels, with retries backing off after failures. These app-only MCP checks contain no task or chat content, do not start model turns, and do not upload or sync conversations. Task states reflect explicit Threadboard tool updates; the plugin does not monitor chat transcripts.

The SQLite database and its journal files live in the user's application data directory, outside the plugin cache. They remain after uninstalling or updating the plugin. Local operating system file permissions protect the files; Threadboard does not add database encryption. Device backups may include these files under the user's own backup settings.

## Using Codex

Task information returned by MCP tools can become context in a Codex chat. Selecting a board attaches its board and project IDs, names, and primary workspace path to the host chat as model context. It does not automatically attach task content or change the chat's native project membership or working directory. Switching boards replaces the context and clears any card previously shared from a different board. Creating a named board sends a setup request containing board/project metadata to the native Codex chat. Codex uses its own project-aware tools to create and link a companion chat; existing default boards request setup only when you choose Create board chat. These requests contain no task content or transcript. This uses your normal Codex model allowance. The Share with this chat action deliberately sends selected task context to that chat. Starting a new chat passes a task title, workspace path, IDs, and a claim token into the local Codex composer. Sending its prompt allows Codex to retrieve and process task details under the user's normal Codex account, permissions, and OpenAI terms. This plugin does not change Codex's own data handling. Local storage does not mean Codex's model processing occurs locally.

## Export and removal

Export creates a local JSON snapshot with task content, all activity notes, workspace paths, prerequisites, and current chat/run references. It does not upload the snapshot or export chat transcripts. JSON import is not provided in this release. Keep exports private if they contain private project information.

Archiving a card preserves it for restoration. Uninstalling the plugin preserves the database. To remove all Threadboard data, first stop the plugin and delete its application data directory using your operating system's file manager. See [the user guide](docs/usage.md#data-and-updates) for platform-specific locations and backup instructions.

## Support

Use the [public issue tracker](https://github.com/vrnrn/Threadboard/issues) for support. Do not include private task exports, workspace paths, claim tokens, or personal information in public issues. Any information you choose to publish there is handled by GitHub.
