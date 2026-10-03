Threadboard 0.1.0 is a fully local preview for Codex desktop. It includes a compiled board, stdio MCP server, workflow skill, and one-command installer. No hosted service, account, telemetry, or separate model API is required.

Download `threadboard-0.1.0.zip`, extract it, and run `node install.mjs` in the extracted directory. Reopen Codex and open Threadboard from your installed plugins. Node.js 22.13+ and the Codex CLI are required; no npm installation or build step is needed. Check the ZIP against `SHA256SUMS` if desired. See the [installation guide](https://github.com/vrnrn/Threadboard#install-a-release).

Included features:

- Workspace boards with five columns, task details, priorities, prerequisites, activity notes, archive/restore, search, and local JSON export.
- Atomic ownership shared across chats, conditional edits that preserve newer work, and owner submissions into Review for explicit user acceptance.
- Card launches using native Codex links with a prefilled prompt. The user sends it to bind and start the task; launching does not automatically send a message.
- Light/dark presentation, keyboard navigation, responsive layouts, and refresh after deliberate actions instead of periodic polling.

Validation: ten storage/protocol tests, five browser workflow tests, clean CLI installation and cache execution, persistence after reinstall, zero observed idle/remote browser requests, and a source/bundle audit. [CI passed](https://github.com/vrnrn/Threadboard/actions/runs/37156379133) on Linux with Node 22.13 and 24; local checks used macOS and Node 26.3.1. The UI is 145.6 KiB gzip. On the development M1 Pro, 200 summaries from 2,000 cards measured 2.82 ms p95; twelve fresh-server starts measured 244.35 ms p95 to an empty-board response and a maximum observed 85.81 MiB RSS.

Preview limitations: actual native desktop entrypoint rendering and card-to-chat launch behavior are awaiting host validation. Boards associate with canonical workspace directories, rather than saved native Codex project IDs. Search applies to loaded cards, with pagination above 200. JSON import is not provided. Windows and the broader concurrent performance matrix are unvalidated. The release is independently distributed through its GitHub repository marketplace and is not an OpenAI universal-directory listing.

Task storage survives plugin removal and updates. Task information deliberately used in a Codex chat is subject to Codex's own processing and permissions. See the [privacy details](https://github.com/vrnrn/Threadboard/blob/main/PRIVACY.md).
