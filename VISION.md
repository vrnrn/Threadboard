# Threadboard — Vision

Status: product draft · 3 October 2026

Threadboard is a working name. This document describes the intended product; it does not claim that the integration or publication gates have passed.

Pre-build research and the unresolved release gates are recorded in [PUBLISHING_RESEARCH.md](./PUBLISHING_RESEARCH.md). The user has approved a small hosted service, with the US$5/month Workers plan as the initial infrastructure baseline. Task content stays local; the service receives only IDs and state metadata. There is no separate model API integration.

## The product

A shared Kanban board for each Codex project, built into the Codex app through OpenAI's plugin interfaces. Every chat in that project can see the same work, pick up a task, report progress, and hand it back for review. A user can also start a new Codex chat directly from a card.

Threadboard keeps task titles, descriptions, acceptance criteria, comments, and results on the user's machine. A small hosted MCP service stores opaque board/task/run IDs, task states, ownership references, and revisions. Actual chats remain in Codex: Threadboard does not read, copy, or synchronize their messages, transcripts, reasoning, or tool output. Users install the plugin through a marketplace.

This is a deliberate change from the earlier entirely local proposal. Authenticated access to hosted metadata is now necessary; the account/connection flow and the supported local-storage bridge must be proved before the full MVP is built. Paying for hosting does not by itself establish directory approval.

The board answers three questions at a glance: what needs doing, which chat owns it, and what is ready to review.

[Cline Kanban](https://github.com/cline/kanban) is the workflow reference: visible tasks, parallel work, clear ownership, and a short path into the relevant conversation. Threadboard will use an original interface and implementation, with Codex projects and chats as its execution model.

## What project native means

One project has one default board. Opening the board from a project conversation selects that project's board. Other conversations in the same project see the same tasks and activity. A task launched from the board belongs to that same native project, including when Codex uses a worktree for its execution.

Project identity must be explicit and stable. Similar directory names do not make two projects the same. A worktree does not automatically create another board. Two separately saved Codex projects must not silently merge their boards merely because they share a repository.

The plugin has a sidebar entry and can open beside a conversation. The documented extension interfaces do not establish that plugins can add arbitrary UI beneath each native project in the sidebar. We must prove project association and project-bound chat creation in the actual supported host before describing those features as available. [OpenAI extension specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md).

Desktop deep links can open a new local chat with a workspace path and task prompt, and open an existing chat by its technical ID. The new-chat link leaves the prompt in the composer for the user to send. This is a supported launch building block; automatic sending, saved-project selection, and run attribution still need validation. [Chat links](https://learn.chatgpt.com/docs/reference/commands#chats).

## The first useful workflow

1. Install the plugin from its marketplace, open it in Codex, and associate the current project with its local board.
2. Add a task manually or ask the current chat to break a request into tasks.
3. Include a clear goal and acceptance criteria, so another chat can pick up the work without reconstructing its history.
4. Press **Start in new chat**, or ask an existing project chat to claim the task.
5. See the owner and concise progress on the card. Open the linked conversation to inspect the work.
6. The working chat submits its result and validation evidence to **Review**. The user accepts it into **Done**, or sends it back with feedback.

The interface combines local task content with authoritative hosted state metadata. It refreshes when opened, on request, and after the user's board actions. Changes from other chats appear on the next refresh; the MVP does not aim for real-time updates. Claims and state transitions check current hosted state; task-text edits check the local content version. An older screen cannot create a second owner or silently overwrite newer work.

## MVP scope

| Area | First release |
| --- | --- |
| Project boards | One default board per associated native project; an explicit project switcher in the plugin workspace |
| Workflow | Backlog → Ready → In progress → Review → Done; a separate blocked reason |
| Tasks | Title, description, acceptance criteria, priority, stable ID, status, and archive |
| Ownership | One active owner per task, with atomic claims and an explicit handoff |
| New chats | Start a task in a new chat attached to the correct native project |
| Existing chats | Create, inspect, claim, update, comment on, and submit tasks through MCP tools |
| Dependencies | Simple prerequisite links; blocked tasks explain what they are waiting for |
| Activity | Concise task events and progress notes, with links to relevant chats |
| Board UI | Drag and drop, accessible move controls, search, filtering, and a task detail panel |
| Refresh | On opening, explicit Refresh, completed board actions, and connection recovery; show when data was last fetched |
| Context | Share the selected task with the current conversation |
| Recovery | Clear handling of stale edits, launch failures, interrupted work, and reconnects |
| Data boundary | Local task content and native chat links; hosted IDs/state only; no chat copying or transcript access |
| Distribution | Public GitHub-backed marketplace and OpenAI directory submission through a production HTTPS MCP endpoint, subject to proving local-content access and passing review |

The MVP is for one user's projects on one machine. Multiple chats are collaborators acting for that user. Hosted metadata does not make local task content available on another device. Real-time updates, remote execution, and multi-device task-content synchronization are outside the first release.

Automatic dependency execution, recurring agents, custom columns, integrated terminals, a custom diff editor, model selection, automatic commits, and automatic merges are outside the first release. Codex remains responsible for execution, permissions, and its existing review experience.

## Performance is a product requirement

Opening and using a board should feel like ordinary desktop navigation. Moving a card or opening its details must respond immediately. A project with hundreds of tasks must remain usable while several chats are updating it.

We will budget bundle size, host-bridge payloads, rendering work, local and hosted database queries, network requests, process memory, and model context from the first implementation. The initial view loads local card summaries and hosted state; descriptions and activity load when needed. Updates affect changed cards. Large columns use windowing. An idle or hidden board must not keep doing unnecessary work.

Board maintenance and refresh do not invoke an extra model. There is no timer-based polling or live update connection. Chats receive relevant tasks and bounded activity, rather than the entire board or conversation transcripts.

The measurable budgets and benchmark conditions are in [ARCHITECTURE.md](./ARCHITECTURE.md#9-performance-budgets). They are targets to verify, not achieved results.

## What polished means

The interface follows the host's theme, typography, spacing, and interaction conventions. Color communicates state; it is not the only way to distinguish columns or priorities. Keyboard users can create, select, move, and start tasks without relying on drag and drop.

Empty states help create the first real task. Loading, reconnecting, and conflicts preserve the user's place. A failed save keeps the draft. A failed launch keeps the task recoverable. Ownership changes, blocked work, and pending review are visible without opening every card after a refresh. A clear Refresh control and last-fetched time make the snapshot's freshness understandable.

The selected project is always clear. Cross-project mistakes are more damaging than an extra project-selection step.

## Data boundary and publication

The marketplace distributes code and assets. Task content stays in local durable storage; a Worker and metadata-only database coordinate task state. The hosted endpoint must implement useful metadata tools and serve the board UI, rather than exist only to pass an endpoint check. The repository package can bundle a local MCP adapter. Whether a directory-installed version can access the same local content without a separately installed companion is a release gate. [Packaging guide](https://developers.openai.com/plugins/build/plugins), [submission guide](https://developers.openai.com/plugins/deploy/submission).

Local storage lives outside the installed plugin cache and source repositories. Updates must preserve task content. Backups and exports containing task text stay local; cloud backups contain metadata only. Task context deliberately shared with a Codex chat follows that chat's normal processing. This boundary limits what our service receives; it does not change Codex's own storage or model processing.

Both distribution channels remain intended. The hosted HTTPS endpoint gives us the standard public submission transport; verified publisher identity, domain verification, review materials, and acceptance still apply. Current directory submissions connect only one MCP server per plugin, so we cannot assume that a local companion will install beside the hosted endpoint. Desktop host-mediated file resources are a candidate local-content route to validate. [Submission guide](https://developers.openai.com/plugins/deploy/submission), [file resource specification](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#file-extension-entrypoint).

A GitHub release, marketplace catalog, and successful installation prove marketplace distribution. They do not establish universal-directory approval. We will describe the actual installation route clearly.

The proposed release uses public GitHub distribution and a small Workers/D1 service. The US$5/month plan is an initial hosting baseline, not a guaranteed bill ceiling. Normal Codex model usage follows the user's account limits. Prove the local-content boundary, installation route, and native chat workflow before building the full application. [Research findings](./PUBLISHING_RESEARCH.md), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## Definition of a successful MVP

- A user installs the packaged plugin and opens a real project board inside Codex.
- Two existing project chats can work on different tasks and see each other's committed changes when they next read or refresh the board.
- An open idle board performs no periodic refresh; reopening or pressing Refresh retrieves changes from other chats.
- Two simultaneous attempts to claim one task produce exactly one owner.
- Starting a card creates a chat in the intended native project and links its work back to the card.
- Worktrees retain the intended project board association.
- The user can review a task's result, request changes, and mark it done.
- Relaunching the app, reconnecting the plugin, or updating its package preserves local task content and hosted state; recoverable UI drafts remain available where applicable.
- Network-boundary checks prove that task text and chat content never enter requests to our service or its logs.
- The interface and local server meet the documented performance budgets on representative workloads.
- A stranger can install the release, connect authenticated metadata access, and use the board without building dependencies or running a separate desktop app.
- OpenAI directory placement is claimed only after the full local-content workflow is supported and the package is accepted.

The first engineering milestone is to prove local-content access with hosted metadata, native project binding, and chat launch in a small installed plugin. Those are foundational acceptance criteria, not details to defer until after the board is built.
