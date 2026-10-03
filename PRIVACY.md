# Threadboard privacy

Last updated: 3 October 2026.

Threadboard's first release is a fully local Codex plugin. It operates a stdio MCP server and an embedded board. It has no hosted service, login, analytics, advertisements, telemetry, or model API integration. Its runtime makes no outbound network requests.

## Local data

The plugin stores project names and canonical workspace paths; task titles, descriptions, acceptance criteria, priorities and states; prerequisites; deliberate activity notes; and task ownership handles. When supplied explicitly, a native Codex chat ID is stored to enable an Open chat link. Claim tokens are hashed in storage. The plugin does not read Codex transcripts, chat messages, reasoning, or repository file contents. A task's workspace directory is checked for existence.

The SQLite database and its journal files live in the user's application data directory, outside the plugin cache. They remain after uninstalling or updating the plugin. Local operating system file permissions protect the files; Threadboard does not add database encryption. Device backups may include these files under the user's own backup settings.

## Using Codex

Task information returned by MCP tools can become context in a Codex chat. The Share with this chat action deliberately sends selected task context to that chat. Starting a new chat passes a task title, workspace path, IDs, and a claim token into the local Codex composer. Sending its prompt allows Codex to retrieve and process task details under the user's normal Codex account, permissions, and OpenAI terms. This plugin does not change Codex's own data handling. Local storage does not mean Codex's model processing occurs locally.

## Export and removal

Export creates a local JSON snapshot with task content, all deliberate activity notes, workspace paths, prerequisites, and current chat/run references. It does not upload the snapshot or export chat transcripts. JSON import is not provided in this release. Keep exports private if they contain private project information.

Archiving a card preserves it for restoration. Uninstalling the plugin preserves the database. To remove all Threadboard data, first stop the plugin and delete its application data directory using your operating system's file manager. See README.md for the platform-specific locations and backup instructions.

## Support

Use the [public issue tracker](https://github.com/vrnrn/Threadboard/issues) for support. Do not include private task exports, workspace paths, claim tokens, or personal information in public issues. Any information you choose to publish there is handled by GitHub.
