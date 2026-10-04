# Threadboard prototype

Status: GitHub local preview 0.1.1 published; newer source preview is maintained on main · 4 October 2026

Local preview: `0.1.4-dev.6` uses existing native Codex projects and checks changes once per second while visible. This source preview is installed locally and has not been published as a GitHub release. Earlier version-specific evidence below describes the manual refresh behavior that this preview supersedes.

## Current preview checkpoint

Preview `0.1.4-dev.6` adds the project/board overview, guarded live updates, host theme adaptation, cached-resource recovery, and an Open full view app link. The plugin exposes 22 tools, including an app-only revision check. Schema 3 supports multiple boards with project-wide task numbering.

Twenty-six backend tests and twenty-two UI tests pass. The user confirmed that the native board opens after the cached-resource fix. The full-view recovery control and card-launch project placement remain separate native-host checks. A clean dev.5 → dev.6 installation upgrade retains task data; cached server/UI/skill hashes match, and the real local SQLite snapshot was unchanged after installation.

Current graphics use temporary Orbit, Atlas, and Website fixtures with named boards. The README and usage/development guides describe the source preview; the older published release is identified separately. The sections below preserve historical, version-specific evidence and are not current feature or performance guarantees. Long-term planning documents remain unchanged.

## Native appearance

- Matched the supplied Codex screenshots with a charcoal canvas, neutral sidebar and cards, gray selections, pill buttons/search/tabs, folder navigation, and system typography. Removed the colored status/priority decorations, letterspaced headings, promotional empty-state copy, and tinted column backgrounds.
- Removed the internal Threadboard logo/title row because the Codex panel already supplies the app title. Project navigation starts at the top of the board without duplicating the host header.
- Each compiled UI now has a version/content-specific MCP resource URI. The duplicate-title fix was initially reinstalled under the same preview version and URI, while the user still saw the old title after reloading. This preview gets a new plugin version and resource identity; an existing panel may need to be closed and opened fresh, or Codex fully quit and reopened if its runtime retains the previous plugin metadata.
- The board, task details, project switcher, empty state, and responsive layout share the same theme. Bundled branding is grayscale. Host-provided MCP Apps color/font variables take precedence over the light/dark fallbacks, including subsequent host-context changes.
- Theme integration uses `hostContext.styles.variables` at initialization and `ui/notifications/host-context-changed` for live updates, as documented in [OpenAI's plugin UI changelog](https://developers.openai.com/plugins/changelog). Palette-only updates also apply, with no polling or server calls. The local preview follows system appearance changes through a media-query event listener that is removed on unmount.
- Inspected rendered desktop light/dark boards, both task-detail themes, the native project switcher, empty boards, the empty state, and the 390-pixel mobile board. Fresh screenshots are in `docs/`.
- Type checking, twenty storage/protocol tests, eight browser workflows, and the screenshot fixtures passed. The resource regression test verifies that a UI rebuild changes its advertised MCP resource URI while retaining the plugin version, and that each URI serves the corresponding HTML. The host theme test embeds the compiled app in a separate parent frame and exercises the actual MCP Apps handshake, initial host styles, a live dark-to-light change, palette/font updates in an open dialog, host preference over system appearance, and task creation through the bridge. Both host and system changes preserve unsaved drafts without extra server calls. This is a controlled host fixture, not a claim of observing the live Codex panel.
- The UI is 144.6 KiB gzip. A 200-card page measured 351 ms p95 across 20 renders under 4× CPU throttling, excluding native bridge and initial script loading. The existing 1-second render and 250-KiB size budgets still pass.
- Clean installer upgrades from 0.1.1 to the first native UI preview, from 0.1.2-dev.1 to dev.2, and from dev.2 to 0.1.3-dev.1 preserved saved tasks. The local installation uses the new compiled assets; close the existing Threadboard panel, fully quit Codex, reopen it, and launch Threadboard from installed plugins to discard a retained older panel. The long-term planning documents remain unchanged.

## Native Codex projects

- Codex owns project creation, names, roots, and identity. Threadboard lists every existing local Codex project, including zero-task boards. The independent project dialog and `create_project` tool are removed; the plugin exposes 17 tools.
- Local inspection confirmed that the desktop project registry and SQLite project table can use different IDs for the same folder. The adapter uses the desktop registry, including an authoritative empty registry. It does not adopt database IDs as a fallback. Installed app source and the native list_projects tool confirmed that g-p- IDs are ChatGPT cloud project mirrors, which must be excluded. Native IDs are opaque strings; roots support multiple directories and do not define project identity.
- Discovery is an isolated read-only compatibility adapter for internal Codex metadata, not a documented public project API. It extracts IDs, names, and roots only. It never writes Codex state, opens transcript files, or queries chat content. A future metadata-format change may need an adapter update; malformed state reports an error and preserves board data.
- Filesystem signatures cache unchanged sources. Changes to unrelated desktop state retain the same project snapshot, avoiding board metadata writes. Discovery runs when tools are invoked; opening, manual refresh, and completed actions update the UI, with no background polling.
- Schema 2 removes the one-project-per-directory restriction. Legacy workspace boards migrate only on a unique native-root match, preserving task IDs/numbers, runs, claim tokens, notes, retry handles, counters, and old project handles through aliases. Ambiguous or unmatched legacy data remains saved. Removed native projects are hidden while retaining tasks; a different native ID starts a separate empty board, even at the same directory.
- Tests cover existing empty projects, native renames/removals/re-additions, multiple roots, shared roots, unavailable launch directories, cached discovery, unrelated-state privacy, exclusion of unrelated database IDs and cloud mirrors, and schema-one migration with a live claim and retry. Browser checks exercise the project list, empty board, rename, removal, restoration, and removal of Add project controls.
- Type checking, all 20 storage/protocol tests, 8 browser workflows, and 2 screenshot fixtures passed. Current board reads measured 3.57 ms p95; a 200-card page measured 351 ms p95 at 4x CPU throttle, and the UI is 144.6 KiB gzip. Fresh-process discovery of ten native project fixtures measured 175.42 ms p95 with 78.55 MiB maximum sampled RSS. All existing prototype budgets pass.
- A packaged 0.1.2-dev.2 → 0.1.3-dev.1 upgrade preserved a saved task and its old project handle while migrating to the native project ID. The development installation now runs 0.1.3-dev.1; cached UI/server hashes match the build. A fresh MCP client verified all seven local project IDs against Codex's own list_projects result, opened all seven empty boards, confirmed schema 2 integrity, and found no task/run/note loss. A SQLite backup was saved before the local migration. The live retained panel still needs a fresh launch after quitting and reopening Codex.


## Board chat context

- The user confirmed that the native global app surface renders the board and its host-owned chat bubble. Their “Say hi” chat was reported by Codex with no project and a projectless working directory, even while the cmux board was selected.
- Checked the current official [extension specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#uimessage-extensions), installed extension SDK, and installed host implementation. `ui/message` offers active/new targeting, with no project destination. Model context supplies composer attachments, not native thread membership. The installed host's new MCP App chat path explicitly uses a projectless workspace. The provided chat remains unchanged; automatic native bubble routing is not implemented or claimed.
- Preview 0.1.3-dev.2 attaches the selected board's native project ID, name, and primary workspace to its native chat via `ui/update-model-context`. Only project metadata is attached automatically. Task content remains an explicit Share with this chat action. Switching projects replaces the context and clears a shared card from the previous board; removing the selected project clears the context.
- Unsupported hosts skip optional automatic context. Existing board actions remain usable if a context update fails. Unchanged refreshes, card counts, theme updates, and idle time do not produce context requests. No new MCP tools, transcript access, Codex-state writes, polling, daemon, or model API are introduced.
- The native Project menu can move an existing chat manually. This is separate from supplying board context and from card launch, which still uses a workspace deep link with unverified saved-project placement.
- The new controlled native-host test verifies project-only context at initialization, no request on an unchanged refresh, explicit task sharing, replacement on project switch without private task leakage, and clearing after project removal. The other eight browser workflows passed unchanged. The bundle remains within budget at 144.9 KiB gzip.
- Installed 0.1.3-dev.2 locally. Cached UI/server hashes match the build; a fresh packaged MCP client confirmed the version, content-specific UI resource, bundled board-context code, and all seven native projects. The real host's context attachment behavior still needs user verification after closing the retained panel and fully restarting Codex.


## Multiple boards and companion chats

- Preview 0.1.4-dev.1 adds named boards within each native Codex project. Every project has General. Schema 3 assigns existing cards to General without changing task IDs/numbers, claims, notes, dependencies, or operation retries. Named boards isolate task pages, archive counts, prerequisites, and exports. Task numbers remain project-wide. Removing a native project retains all its boards.
- The board picker, New board dialog, and companion chat button use the existing native theme. Automatic model context includes both board and project IDs; switching within the same project clears a shared card. Project creation remains in Codex.
- Creating a board reserves one companion chat request. A deliberate UI action sends its metadata-only setup prompt through public ui/message to the native host chat, which uses Codex list_projects/create_thread to create “<board name> Threadboard” in the exact native project. It then verifies membership and binds the returned thread ID. The plugin cannot directly invoke native app tools. Hosts lacking message/tool support copy the setup prompt for a user to send in Codex.
- Existing General boards do not trigger chat creation on migration/opening/refresh. Create board chat requests it explicitly. Pending requests offer Finish chat setup; the recovery prompt checks existing native chats before retrying. Persisted request IDs, unique chat references, and conflicting-bind rejection protect linked chats. Distributed host creation is not an atomic exactly-once API: an unknown host outcome still requires inspecting native chat metadata before recovery.
- No daemon, direct Codex-state writes, transcript access, background polling, hosted service, or external model API. Companion creation uses normal Codex account usage. Only chat IDs and board metadata are stored locally.
- Type checking, all 23 storage/protocol tests, 9 browser workflows, and 2 screenshot fixtures passed. Tests cover schema-one/two migration with active ownership, board isolation, invalid project/board combinations, idempotent setup, conflicting bindings, selected-board refresh, metadata-only native message dispatch, and retained theme/drafts.
- Local reads with 2,000 tasks measured 5.19 ms p95. Packaged stdio reads with 2,000 active / 5,000 archived measured 7.85 ms p95 and 93.11 MiB maximum sampled RSS. A 200-card page rendered in 314 ms p95 at 4x CPU throttle across 20 samples (271 ms longest task), excluding native bridge/script loading. UI gzip is 145.9 KiB, within existing budgets. Native chat creation and global-bubble message dispatch are separate host verification steps.
- Installed 0.1.4-dev.1; cached assets match the build. A clean 0.1.3-dev.2 upgrade preserved saved cards. Before the live schema upgrade, a read-only SQLite backup was saved; comparing all pre-existing task/run/event/operation fields confirms no data changed. Integrity and foreign-key checks pass: seven native projects, eight boards, and the existing card/claim/notes retained.
- Live experiment: created Experiment under cmux, then created Experiment Threadboard with Codex create_thread using the exact native project target. The chat completed its acknowledgement. Codex recent-thread listing did not surface this new chat during verification, so membership was independently confirmed in its read-only desktop project-assignment metadata. The real chat ID was linked through bind_board_chat; reopening the board returns it and a repeated prepare request creates no new chat. No workspace or Codex state files were edited directly. The real floating-bubble dispatch still needs user verification after a full Codex restart.

## Release scope

The first release is a fully local Codex plugin, distributed as a complete GitHub release and repository marketplace. `VISION.md` and `ARCHITECTURE.md` remain the long-term design and must not be edited for this prototype. This file records implementation decisions, evidence, and remaining release work.

- No hosted backend, account, cloud metadata, telemetry, or separate model API.
- Local task content and state shared across chats through SQLite outside the plugin cache.
- No transcript reading or chat copying. Store only task data and explicit chat/run references.
- Refresh on opening, manual request, completed board actions, and changed local revisions. Visible surfaces check revisions once per second; hidden surfaces pause. Failed checks retry with backoff up to 30 seconds.
- A polished native board with projects, task details, accessible moves, atomic claims, review, comments, dependencies, and recoverable new-chat launch.
- Ship compiled UI/server, manifests, workflow skill, notices, and install instructions. End users should not build or install npm dependencies.

## Acceptance evidence

- [x] Local storage migrations, task transitions, version conflicts, dependency checks, and restart persistence.
- [x] Concurrent claims across six independent processes produce one owner.
- [x] MCP server initializes from the packaged release and serves tools and the embedded board, with outbound networking disabled in the test process.
- [x] Native global app surface renders the installed board and host chat bubble, confirmed by the user's screenshot. Conversation-inline rendering remains unverified.
- [ ] Card launch opens a Codex chat in the intended workspace; task binding and chat navigation have real host evidence.
- [x] Browser UI interaction, keyboard focus, conflict recovery, small screens, light/dark rendering, text escaping, lightweight visible revision checks, and no hidden-panel checks or remote assets.
- [x] Packaged release installs into a clean Codex configuration and preserves task data through reinstall. Installed-cache execution uses the packaged MCP configuration and discovered Node path.
- [x] Automated source/bundle audit finds no credentials, personal workspace paths, user data, or transcripts. The repository starts from the audited source with a GitHub noreply commit address; no prior private history was imported. Anonymous public download matches the audited artifact and its checksums.
- [x] GitHub repository/release and downloadable checksummed artifact are available, with exact install instructions.
- [x] Original long-term documents remain byte-for-byte unchanged, checked against SHA-256 baselines during every release audit.

## Current findings

- The workspace initially contains only three planning documents and is not a Git repository.
- Development machine has Node 26.3.1, npm 11.16.0, Codex CLI, and authenticated GitHub CLI.
- OpenAI's extension SDK 0.1.0 declares MCP Apps 1.7.5 and MCP SDK 1.29+ peers. Pin a compatible set.
- The supported local package example uses a bundled Node stdio server. Node runtime discovery and packaged execution need installation checks.
- Native desktop links support a workspace path and prefilled task prompt; that does not itself prove automatic sending or a saved-project selector. Verify launch behavior before claiming it.
- The working-tree preview binds boards to existing local Codex project IDs through read-only project metadata. Project creation stays in Codex. The published 0.1.1 release still uses manually associated workspace boards.
- The development Codex configuration uses a locally installed preview; the last public release is 0.1.1. Installed assets match the build. The user's screenshot confirms native global app rendering; automatic card launch, saved-project placement, and the new real-host board-context attachment remain unverified. Native Codex GUI automation is denied by the computer-use safety policy, so controlled browser/MCP tests do not clear those host gates.
- The first release is independently distributed through its GitHub repository marketplace. No OpenAI universal-directory submission, hosted deployment, plan purchase, or model API integration is part of this release.

## Measured prototype budgets

Measured on macOS, Apple M1 Pro (8 CPU cores), Node 26.3.1. Rows not refreshed for this preview retain the earlier 0.1.1 baseline. These are development results, separate from the long-term architecture's fuller workload targets.

| Check | Result | Prototype budget |
| --- | --- | --- |
| JavaScript and CSS, combined gzip | 144.6 KiB | 250 KiB |
| 200 summaries from 2,000 active cards, 100 warm reads | 3.57 ms p95; 2.13 ms median | 50 ms p95 |
| Largest measured summary page | 105,672 bytes | 128 KiB for this fixture |
| Fresh process to discovery of 10 empty native project boards, 12 processes | 175.42 ms p95 | 1 second |
| Server RSS immediately after first empty-board result | 78.55 MiB maximum observed | 96 MiB |
| 500 active / 5,000 archived, 20 callers across 4 processes | Reads 5.54 ms p95; edits 4.03 ms p95 | 25 ms reads / 50 ms writes |
| 2,000 active, 20 callers across 4 processes | Reads 6.26 ms p95; edits 2.57 ms p95 | 25 ms reads / 50 ms writes |
| 100 competing claim requests across 4 processes | 1 winner; 99 already-claimed failures | Exactly 1 owner |
| Packaged stdio reads, 2,000 active / 5,000 archived, 30 responses | 37.64 ms p95; 91.47 MiB maximum sampled RSS | 1 second / 96 MiB |
| 200-card page, Chromium 153, 4× CPU throttle, 20 renders | Data-ready to useful paint 351 ms p95 | 1 second |
| Idle browser requests over the test observation window | 0 | 0 |

SQLite statements are reused; board ordering has a supporting index; project counts use a covering index; summaries batch ownership/prerequisite reads and exclude full descriptions/criteria. Reads use one consistent SQLite snapshot. UI and server are self-contained bundles.

Concurrent storage timings include SQLite lock contention but exclude IPC and host overhead. Twenty logical callers share four processes, each serializing its own calls; this does not simulate twenty desktop MCP processes. The browser fixture consumes preview JSON before timing card DOM commit plus two animation frames, excluding native bridge and initial script loading. Its longest observed task was 272 ms; this test does not establish smooth sustained interaction. Populated RSS is sampled after each response, excluding exports. The native host bridge, sustained memory, Windows, and the complete long-term performance matrix remain unvalidated.

## Release contents and verification

- Compiled Node stdio server and embedded React board; 17 MCP tools; global and thread entrypoint metadata validated with OpenAI's extension SDK.
- Atomic claims, launch reservations, progress/submission handles, prerequisites, blocked reasons, versioned edits, explicit Review acceptance, archive/restore, and full deliberate-note JSON exports.
- Stable retry IDs for creation and launch; failed saves preserve drafts. A successfully saved action followed by a failed refresh remains reported as saved.
- A checksummed ZIP with a portable local marketplace, workflow skill, icons, license/third-party notices, README/privacy guidance, and a Node installer. No end-user npm install or build.
- Installer checks file hashes, discovers Node, pins the executable for desktop startup, and copies files to a stable marked installation directory. Task data remains outside the plugin cache.
- Twenty storage/protocol tests, eight browser workflow tests, a throttled browser performance fixture, isolated clean installation/reinstall checks, screenshots, size checks, concurrent/populated performance benchmarks, and a production dependency audit (zero reported vulnerabilities).
- CI passed on Linux with Node 22.13 and 24 for code commit `17378ae`: type checking, build, storage/protocol tests, browser workflows, benchmarks, audit, packaging, and clean CLI installation. Evidence: https://github.com/vrnrn/Threadboard/actions/runs/37156379133. Windows and actual native desktop surfaces are not yet validated.

## Work log

- Created this note file before implementation. Recorded the fully local release pivot without modifying the long-term documents.
- Built the core, embedded UI, workflow skill, downloadable installer, package checks, and tests. Found and fixed a post-save UI error, stale draft reload behavior, a primary-button hover contrast issue, and incomplete note exports during verification.
- Reduced the original 68.7 ms p95 board-read result to 2.82 ms using query/index changes. Original planning documents remain unchanged.
- Published the public source at https://github.com/vrnrn/Threadboard. Publishing a checksummed GitHub preview is separate from the still-pending native host smoke test and from any OpenAI universal-directory submission.
- Published https://github.com/vrnrn/Threadboard/releases/tag/v0.1.0 as a prerelease, with a 490,596-byte ZIP and SHA256SUMS. Anonymous download and all 16 internal file checksums passed. ZIP SHA-256: `734a318df961789a32f961ada4b19d0a72d88d14514eb8d448245b16ac0aeab5`.
- Independently installed the public GitHub marketplace at tag `v0.1.0` in a fresh isolated Codex configuration and executed its cached MCP server with the portable `node` configuration. No npm installation or build was needed for that consumer check.
- Prepared patch 0.1.1: moved trusted static OpenAI UI metadata validation out of production startup into type checking and the packaged protocol test. This removes unused runtime schema initialization while preserving the metadata contract, and brings populated RSS below the existing 96 MiB budget.
- A negative packaged-protocol test exposed MCP's raw-shape registration silently stripping unknown fields. Registering the full strict schemas now rejects unsupported read/write arguments before any side effect. All 18 advertised schemas prohibit additional properties.
- Added reproducible concurrency, populated-runtime, and throttled-browser benchmarks to CI. A browser test now waits for the cleared note composer before locating its saved note, removing a transient ambiguous locator.
- Patch code `8c9d884` passed the full Linux CI matrix on Node 22.13 and 24, including all expanded benchmarks and installation checks: https://github.com/vrnrn/Threadboard/actions/runs/37157648470. A separate local 0.1.0 → 0.1.1 installer upgrade preserved a saved task and reported the new server version. The actual development installation was upgraded and its cached server hash verified. All protected planning documents still match their original hashes.
- Published https://github.com/vrnrn/Threadboard/releases/tag/v0.1.1 with a 424,399-byte ZIP. Anonymous download matched the local audited package and all 16 internal checksums. ZIP SHA-256: `24a2666b5b599769236b3530012a31e50b5f1bd7e8939230edb68c2138d2d4fe`. The two native host gates remain open: GUI automation is denied and the MCP Apps panel inventory is empty. Further host verification requires the user to open the installed plugin; no other release gate remains pending for this preview.

- Installed local preview 0.1.3-dev.1 with native Codex project discovery, empty boards, read-only metadata caching, and schema 2 legacy migration. Native app source confirmed that ChatGPT cloud mirrors must be excluded. Twenty storage/protocol tests, eight browser workflows, two screenshot fixtures, package checks, an isolated installer upgrade, native-catalogue parity, and the existing performance budgets passed. The preview has not been publicly published; protected long-term documents remain unchanged.

## UI review: local preview 0.1.4-dev.2

- All seven dropdowns now share a native select control with an inset chevron, room for selected text, consistent focus treatment, and host theme colors. Native keyboard selection and disabled options remain available.
- Reviewed rendered light and dark boards, new-task/new-board dialogs, and task details at 320, 390, 768, 900, and 1440 pixels, including long project, board, task, prerequisite, and owner names. Fixed toolbar wrapping, breadcrumb overflow, owner truncation, activity names spilling outside dialogs, and dialog action layout.
- The last card's move menu could hide Done inside the board's scroll container. Its menu now renders above that container, fits the viewport, and supports arrows, Home/End, Escape, and focus return. Menu listeners exist only while it is open. The board search shortcut no longer moves focus behind an open dialog.
- Verification: type checking, 23 storage/protocol tests, 10 browser workflow tests, and four screenshot/review fixtures pass. UI is 146.8 KiB gzip against a 250 KiB budget; the 200-card performance fixture measured 312 ms p95 at 4x CPU throttling, excluding native bridge and initial script loading. Idle board traffic remains zero. These are browser and packaged MCP checks; the updated native Codex panel still requires user verification after restarting the app.
- This update preserves the fully local design, existing board/task data, and protected long-term documents. It is a local preview, separate from public release 0.1.1.

## Live local updates: preview 0.1.4-dev.3

- The user's request for prompt card movement supersedes the earlier manual-refresh-only MVP choice. A visible surface checks one opaque revision token per second; it reloads cards, project/board counts, companion chat references, and an open task's activity only after local changes. Hidden documents and hidden embedded surfaces pause through visibility and intersection events; returning retries immediately. The footer shows Live or Reconnecting.
- The new read-only `get_board_revision` tool is app-only: 22 packaged tools, 21 available to the model. It returns only a small token, without task or chat content. The token combines [SQLite data_version](https://www.sqlite.org/pragma.html#pragma_data_version), this connection's change counter, a server-session identity, and a cached native-project catalogue fingerprint. Other MCP processes, the current connection, server restarts, and project removals invalidate it. Unchanged checks scan no task rows, write no storage, and do not reread an unchanged Codex metadata file.
- Requests are serialized across board switches. Background responses are discarded after a user operation, board change, or dialog change; they cannot replace a newer selection. Reloads retain pages already loaded, retrying rather than mixing page revisions from concurrent writers. Failed checks back off from 2 to 30 seconds; revision requests have a 5-second timeout. Checks start no model turns, copy no transcripts, and introduce no hosted service, cloud sync, or API bill. States still require explicit claim/progress/submission tools; the plugin does not infer task progress from a chat.
- Open form fields and unsent notes remain intact. Repeated external updates retain the original draft version when another chat changes the same content, so a subsequent save cannot silently overwrite that edit. Remote progress and state changes can update the detail panel without discarding the draft.
- Type checking, 24 storage/protocol tests, 15 browser workflow tests, and four screenshot/review fixtures pass. Evidence includes independent packaged MCP processes, full claim-to-review-to-done movement, activity updates, repeated draft conflicts, hidden-document and hidden-surface pausing, immediate resume, delayed responses, retained pagination, serialized slow requests, and retry backoff. No additional model-context request is sent for unchanged card refreshes.
- On a 2,000-active/5,000-archived fixture, 10,000 warm local revision checks measured 0.0095 ms p95 and 0.0086 ms CPU per check. Five hundred packaged stdio checks measured 0.282 ms p95; revision data was 72 bytes. A changing 1 MiB unrelated-metadata fixture measured 1.085 ms p95 and invalidated neither board data nor project storage. These measurements exclude Codex's native bridge and do not establish native-host latency. The benchmark now runs in CI.
- UI remains 147.7 KiB gzip against the 250 KiB budget. The throttled 200-card rendering fixture measured 332 ms p95, with 288 ms maximum observed long task; it excludes native bridge and initial script loading. The new local panel behavior still requires user verification after closing Threadboard and fully restarting Codex. Existing long-term documents and schema 3 remain unchanged.
