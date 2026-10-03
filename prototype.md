# Threadboard prototype

Status: packaged local preview; native host validation pending · 3 October 2026

## Release scope

The first release is a fully local Codex plugin, distributed as a complete GitHub release and repository marketplace. `VISION.md` and `ARCHITECTURE.md` remain the long-term design and must not be edited for this prototype. This file records implementation decisions, evidence, and remaining release work.

- No hosted backend, account, cloud metadata, telemetry, or separate model API.
- Local task content and state shared across chats through SQLite outside the plugin cache.
- No transcript reading or chat copying. Store only task data and explicit chat/run references.
- Refresh on opening, manual request, and completed board actions. No periodic polling. Reopen the panel after a failed host connection.
- A polished native board with projects, task details, accessible moves, atomic claims, review, comments, dependencies, and recoverable new-chat launch.
- Ship compiled UI/server, manifests, workflow skill, notices, and install instructions. End users should not build or install npm dependencies.

## Acceptance evidence

- [x] Local storage migrations, task transitions, version conflicts, dependency checks, and restart persistence.
- [x] Concurrent claims across six independent processes produce one owner.
- [x] MCP server initializes from the packaged release and serves tools and the embedded board, with outbound networking disabled in the test process.
- [ ] Native sidebar/conversation surfaces render the installed plugin.
- [ ] Card launch opens a Codex chat in the intended workspace; task binding and chat navigation have real host evidence.
- [x] Browser UI interaction, keyboard focus, conflict recovery, small screens, light/dark rendering, text escaping, and zero idle polling/remote assets.
- [x] Packaged release installs into a clean Codex configuration and preserves task data through reinstall. Installed-cache execution uses the packaged MCP configuration and discovered Node path.
- [x] Automated source/bundle audit finds no credentials, personal workspace paths, user data, or transcripts. The repository starts from the audited source with a GitHub noreply commit address; no prior private history was imported. Public download verification is the remaining artifact check.
- [ ] GitHub repository/release and downloadable checksummed artifact are available, with exact install instructions.
- [x] Original long-term documents remain byte-for-byte unchanged, checked against SHA-256 baselines during every release audit.

## Current findings

- The workspace initially contains only three planning documents and is not a Git repository.
- Development machine has Node 26.3.1, npm 11.16.0, Codex CLI, and authenticated GitHub CLI.
- OpenAI's extension SDK 0.1.0 declares MCP Apps 1.7.5 and MCP SDK 1.29+ peers. Pin a compatible set.
- The supported local package example uses a bundled Node stdio server. Node runtime discovery and packaged execution need installation checks.
- Native desktop links support a workspace path and prefilled task prompt; that does not itself prove automatic sending or a saved-project selector. Verify launch behavior before claiming it.
- Boards currently bind to an existing canonical workspace directory. Saved native Codex project IDs are not read or created. This limitation is explicit in the API, skill, and README.
- Threadboard 0.1.0 is installed and enabled in the development Codex configuration. The installed server hash matches the built server. Native Codex GUI automation is denied by the computer-use safety policy; the user has been asked to open the installed panel. Browser/MCP tests do not clear that host gate.
- The first release is independently distributed through its GitHub repository marketplace. No OpenAI universal-directory submission, hosted deployment, plan purchase, or model API integration is part of this release.

## Measured prototype budgets

Measured on macOS, Apple M1 Pro (8 CPU cores), Node 26.3.1. These are development results, separate from the long-term architecture's fuller workload targets.

| Check | Result | Prototype budget |
| --- | --- | --- |
| JavaScript and CSS, combined gzip | 145.6 KiB | 250 KiB |
| 200 summaries from 2,000 active cards, 100 warm reads | 2.82 ms p95; 2.09 ms median | 50 ms p95 |
| Largest measured summary page | 105,570 bytes | 128 KiB for this fixture |
| Fresh process to first empty-board result, 12 processes | 244.35 ms p95 | 1 second |
| Server RSS immediately after first empty-board result | 85.81 MiB maximum observed | 96 MiB |
| Idle browser requests over the test observation window | 0 | 0 |

SQLite statements are reused; board ordering has a supporting index; project counts use a covering index; summaries batch ownership/prerequisite reads and exclude full descriptions/criteria. Reads use one consistent SQLite snapshot. UI and server are self-contained bundles.

Not yet measured: native host bridge latency, UI rendering under 4× CPU throttling, 20 simultaneous callers, 100-way claim contention, memory after a large populated board, or the combined 500-active/5,000-archived workload. Current claim correctness evidence uses six independent processes. Do not describe the long-term performance matrix as passed.

## Release contents and verification

- Compiled Node stdio server and embedded React board; 18 MCP tools; global and thread entrypoint metadata validated with OpenAI's extension SDK.
- Atomic claims, launch reservations, progress/submission handles, prerequisites, blocked reasons, versioned edits, explicit Review acceptance, archive/restore, and full deliberate-note JSON exports.
- Stable retry IDs for creation and launch; failed saves preserve drafts. A successfully saved action followed by a failed refresh remains reported as saved.
- A checksummed ZIP with a portable local marketplace, workflow skill, icons, license/third-party notices, README/privacy guidance, and a Node installer. No end-user npm install or build.
- Installer checks file hashes, discovers Node, pins the executable for desktop startup, and copies files to a stable marked installation directory. Task data remains outside the plugin cache.
- Ten storage/protocol tests, five browser workflow tests, isolated clean installation/reinstall checks, a screenshot fixture, size checks, performance benchmarks, and a production dependency audit (zero reported vulnerabilities).
- CI passed on Linux with Node 22.13 and 24 for code commit `17378ae`: type checking, build, storage/protocol tests, browser workflows, benchmarks, audit, packaging, and clean CLI installation. Evidence: https://github.com/vrnrn/Threadboard/actions/runs/37156379133. Windows and actual native desktop surfaces are not yet validated.

## Work log

- Created this note file before implementation. Recorded the fully local release pivot without modifying the long-term documents.
- Built the core, embedded UI, workflow skill, downloadable installer, package checks, and tests. Found and fixed a post-save UI error, stale draft reload behavior, a primary-button hover contrast issue, and incomplete note exports during verification.
- Reduced the original 68.7 ms p95 board-read result to 2.82 ms using query/index changes. Original planning documents remain unchanged.
- Published the public source at https://github.com/vrnrn/Threadboard. Publishing a checksummed GitHub preview is separate from the still-pending native host smoke test and from any OpenAI universal-directory submission.
