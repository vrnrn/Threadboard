# Threadboard prototype

Status: GitHub local preview published; native host validation pending · 3 October 2026

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
- [x] Automated source/bundle audit finds no credentials, personal workspace paths, user data, or transcripts. The repository starts from the audited source with a GitHub noreply commit address; no prior private history was imported. Anonymous public download matches the audited artifact and its checksums.
- [x] GitHub repository/release and downloadable checksummed artifact are available, with exact install instructions.
- [x] Original long-term documents remain byte-for-byte unchanged, checked against SHA-256 baselines during every release audit.

## Current findings

- The workspace initially contains only three planning documents and is not a Git repository.
- Development machine has Node 26.3.1, npm 11.16.0, Codex CLI, and authenticated GitHub CLI.
- OpenAI's extension SDK 0.1.0 declares MCP Apps 1.7.5 and MCP SDK 1.29+ peers. Pin a compatible set.
- The supported local package example uses a bundled Node stdio server. Node runtime discovery and packaged execution need installation checks.
- Native desktop links support a workspace path and prefilled task prompt; that does not itself prove automatic sending or a saved-project selector. Verify launch behavior before claiming it.
- Boards currently bind to an existing canonical workspace directory. Saved native Codex project IDs are not read or created. This limitation is explicit in the API, skill, and README.
- Threadboard 0.1.1 is installed and enabled in the development Codex configuration. The installed server hash matches the built server. Native Codex GUI automation is denied by the computer-use safety policy; the user has been asked to open the installed panel. Browser/MCP tests do not clear that host gate.
- The first release is independently distributed through its GitHub repository marketplace. No OpenAI universal-directory submission, hosted deployment, plan purchase, or model API integration is part of this release.

## Measured prototype budgets

Measured on macOS, Apple M1 Pro (8 CPU cores), Node 26.3.1. These are development results, separate from the long-term architecture's fuller workload targets.

| Check | Result | Prototype budget |
| --- | --- | --- |
| JavaScript and CSS, combined gzip | 145.6 KiB | 250 KiB |
| 200 summaries from 2,000 active cards, 100 warm reads | 2.82 ms p95; 2.09 ms median | 50 ms p95 |
| Largest measured summary page | 105,570 bytes | 128 KiB for this fixture |
| Fresh process to first empty-board result, 12 processes | 144.84 ms p95 | 1 second |
| Server RSS immediately after first empty-board result | 77.64 MiB maximum observed | 96 MiB |
| 500 active / 5,000 archived, 20 callers across 4 processes | Reads 4.22 ms p95; edits 0.63 ms p95 | 25 ms reads / 50 ms writes |
| 2,000 active, 20 callers across 4 processes | Reads 4.76 ms p95; edits 0.24 ms p95 | 25 ms reads / 50 ms writes |
| 100 competing claim requests across 4 processes | 1 winner; 99 already-claimed failures | Exactly 1 owner |
| Packaged stdio reads, 2,000 active / 5,000 archived, 30 responses | 5.43 ms p95; 90.97 MiB maximum sampled RSS | 1 second / 96 MiB |
| 200-card page, Chromium 153, 4× CPU throttle, 20 renders | Data-ready to useful paint 381 ms p95 | 1 second |
| Idle browser requests over the test observation window | 0 | 0 |

SQLite statements are reused; board ordering has a supporting index; project counts use a covering index; summaries batch ownership/prerequisite reads and exclude full descriptions/criteria. Reads use one consistent SQLite snapshot. UI and server are self-contained bundles.

Concurrent storage timings include SQLite lock contention but exclude IPC and host overhead. Twenty logical callers share four processes, each serializing its own calls; this does not simulate twenty desktop MCP processes. The browser fixture consumes preview JSON before timing card DOM commit plus two animation frames, excluding native bridge and initial script loading. Its longest observed task was 286 ms; this test does not establish smooth sustained interaction. Populated RSS is sampled after each response, excluding exports. The native host bridge, sustained memory, Windows, and the complete long-term performance matrix remain unvalidated.

## Release contents and verification

- Compiled Node stdio server and embedded React board; 18 MCP tools; global and thread entrypoint metadata validated with OpenAI's extension SDK.
- Atomic claims, launch reservations, progress/submission handles, prerequisites, blocked reasons, versioned edits, explicit Review acceptance, archive/restore, and full deliberate-note JSON exports.
- Stable retry IDs for creation and launch; failed saves preserve drafts. A successfully saved action followed by a failed refresh remains reported as saved.
- A checksummed ZIP with a portable local marketplace, workflow skill, icons, license/third-party notices, README/privacy guidance, and a Node installer. No end-user npm install or build.
- Installer checks file hashes, discovers Node, pins the executable for desktop startup, and copies files to a stable marked installation directory. Task data remains outside the plugin cache.
- Ten storage/protocol tests, five browser workflow tests, a throttled browser performance fixture, isolated clean installation/reinstall checks, screenshots, size checks, concurrent/populated performance benchmarks, and a production dependency audit (zero reported vulnerabilities).
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
