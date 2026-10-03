Threadboard 0.1.1 is a fully local preview for Codex desktop. It includes a compiled board, stdio MCP server, workflow skill, and one-command installer. No hosted service, account, telemetry, or separate model API is required.

Download `threadboard-0.1.1.zip`, extract it, and run `node install.mjs` in the extracted directory. Reopen Codex and open Threadboard from your installed plugins. Node.js 22.13+ and the Codex CLI are required; no npm installation or build step is needed. The same installer updates an existing installation while preserving task data. Check the ZIP against `SHA256SUMS` if desired. See the [installation guide](https://github.com/vrnrn/Threadboard#install-a-release).

This patch reduces server startup and memory overhead and rejects unsupported MCP tool arguments before any board action. OpenAI UI metadata is type checked and validated in the packaged protocol test. Concurrent storage, populated runtime, and throttled browser benchmarks now run in CI.

Included features:

- Workspace boards with five columns, task details, priorities, prerequisites, activity notes, archive/restore, search, and local JSON export.
- Atomic ownership shared across chats, conditional edits that preserve newer work, and owner submissions into Review for explicit user acceptance.
- Card launches using native Codex links with a prefilled prompt. The user sends it to bind and start the task; launching does not automatically send a message.
- Light/dark presentation, keyboard navigation, responsive layouts, and refresh after deliberate actions instead of periodic polling.

Local validation: ten storage/protocol tests, five browser workflow tests, a throttled browser benchmark, and source/bundle checks. On an M1 Pro with Node 26.3.1, twelve fresh-server starts measured 144.84 ms p95. Thirty packaged responses with 2,000 active and 5,000 archived tasks measured 5.43 ms p95 and 90.97 MiB maximum sampled server RSS. Twenty callers across four processes measured storage reads under 5 ms p95; 100 claim requests produced one owner. A 200-card page rendered in 381 ms p95 under 4× CPU throttling in Chromium 153, excluding native bridge and initial script loading. UI JavaScript and CSS total 145.6 KiB gzip. Full methodology and limits are recorded in `prototype.md`.

[CI passed on Linux with Node 22.13 and 24](https://github.com/vrnrn/Threadboard/actions/runs/37157648470), including the expanded benchmarks, packaging, clean installation, and cache execution. A separate macOS check upgraded 0.1.0 to 0.1.1 and retained the saved task. The production dependency audit reports zero vulnerabilities.

Preview limitations: actual native desktop entrypoint rendering and card-to-chat launch behavior are awaiting host validation. Boards associate with canonical workspace directories, rather than saved native Codex project IDs. Search applies to loaded cards, with pagination above 200. JSON import is not provided. Windows, sustained workloads, and the complete long-term performance matrix are unvalidated. The release is independently distributed through its GitHub repository marketplace and is not an OpenAI universal-directory listing.

Task storage survives plugin removal and updates. Task information deliberately used in a Codex chat is subject to Codex's own processing and permissions. See the [privacy details](https://github.com/vrnrn/Threadboard/blob/main/PRIVACY.md).
