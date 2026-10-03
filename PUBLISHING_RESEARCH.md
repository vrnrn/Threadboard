# Threadboard — Publishing and data-boundary research

Research date: 3 October 2026 · Application implementation has not started.

## Decision

The user has revised the earlier entirely local constraint: a small hosted metadata service is acceptable, with the US$5/month Workers plan as the initial baseline. Task titles, descriptions, acceptance criteria, comments, and results must stay local. Our service receives only opaque IDs and workflow/ownership/revision metadata. Actual chats remain in Codex; the plugin must not read, copy, or synchronize transcripts, reasoning, or raw tool output. No plan purchase or deployment has occurred.

Both distribution channels remain intended. A bundled local adapter can be distributed through a GitHub-backed repository marketplace that users add. A hosted MCP endpoint supplies the standard HTTPS transport for OpenAI directory submission. Neither proves that the directory-installed UI and model tools can use shared local task content. Current submissions connect only one MCP server per plugin; a companion local server cannot be assumed to install beside it. [Marketplace setup](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli), [endpoint requirements](https://developers.openai.com/plugins/build/mcp-server#deploy-the-endpoint), [submission limit](https://developers.openai.com/plugins/deploy/submission).

The main remaining gates are supported local-content access, authenticated metadata isolation, native project-bound chat execution, and acceptance of the complete directory workflow. Research does not certify an unbuilt package. A public metadata stub is insufficient evidence of a working board.

## 1. What “marketplace” means for this release

| Route | Package/data model | Discovery and installation | Current conclusion |
| --- | --- | --- | --- |
| Our public GitHub repository marketplace | Bundled local adapter/UI with authenticated hosted metadata | User adds the source; installs from that catalog | Supported packaging foundation; complete installation still to test |
| Another publisher's repository marketplace | Same mechanism | Its maintainer chooses whether to include our entry | Optional reach; no promise of acceptance |
| Workspace GitHub import or workspace sharing | A separate managed distribution route | Workspace admins configure access | Not required for an individual MVP |
| OpenAI universal public directory | Production HTTPS MCP with task content accessed locally | Default shared ChatGPT/Codex catalog after review | Transport route documented; local-content mechanism and acceptance unproved |

These distinctions come from the packaging and user documentation. A repository being public makes its catalog available to people who add it; it does not make the plugin appear in everyone's default search results. Client and workspace policies can restrict available sources. [Packaging and distribution](https://developers.openai.com/plugins/build/plugins), [Plugins](https://learn.chatgpt.com/docs/plugins).

The native install link only works for a marketplace the user's app already knows. It cannot add an unknown repository source by accepting an arbitrary repository URL. [Install deep links](https://learn.chatgpt.com/docs/reference/commands#plugin-install).

## 2. Evidence that a bundled local MCP App is supported

OpenAI's Bits & Bolts example contains a local stdio server, packaged UI, skills, and assets. Its compatibility MCP configuration runs `node ./dist/server.js` from the plugin directory. The build produces a distributable folder; consumers need Node but do not install dependencies or check out the SDK. This is direct evidence for the required local packaging model. It is not evidence that every feature of Threadboard is already supported. [Example README](https://github.com/openai/mcp-extensions/blob/ca16cb3bc015baaa1b849082d8755bbef18770cb/plugins/bits-and-bolts/README.md), [local MCP configuration](https://github.com/openai/mcp-extensions/blob/ca16cb3bc015baaa1b849082d8755bbef18770cb/plugins/bits-and-bolts/.mcp.json).

Codex supports local command-based MCP servers and plugin-provided servers. Sidebar and conversation panels use MCP App UI resources and OpenAI extension metadata. Their availability must be capability-detected in the actual host. [Local MCP support](https://learn.chatgpt.com/docs/extend/mcp), [extensions](https://developers.openai.com/plugins/build/extensions).

The dependency licenses do not imply a service subscription. The extensions repository identifies its SDK license as Apache-2.0. Include its license and required notices, and audit the complete dependency tree before release. This research does not constitute a license audit of an unbuilt bundle. [SDK package metadata](https://github.com/openai/mcp-extensions/blob/ca16cb3bc015baaa1b849082d8755bbef18770cb/typescript/package.json).

## 3. Exact repository distribution plan

Use a repository that contains the installable output at the path referenced by its catalog. A GitHub Release ZIP is useful for manual installation, but it does not make a missing `dist/server.js` appear in a Git-source installation. The tagged repository snapshot must already contain the compiled package. [Source resolution](https://developers.openai.com/plugins/build/plugins#marketplace-metadata).

Proposed release layout, not files created by this research:

```text
repository/
  .agents/plugins/marketplace.json
  plugins/threadboard/
    .codex-plugin/plugin.json
    .mcp.json
    package.json
    dist/server.js
    dist/board.html
    assets/
    skills/threadboard/SKILL.md
    LICENSE
    THIRD_PARTY_NOTICES
  README.md
```

For the first installation proof, use the compatibility layout from the official local example. The documentation recommends root `plugin.json` and `mcp.json` for new portable packages; that format can be adopted after its local transport declaration is validated in the target host. Both are supported formats. Do not mix incompatible schemas or assume an inline `extensions.com.openai` object merges with the compatibility overlay. [Package formats](https://developers.openai.com/plugins/build/plugins#plugin-structure).

The catalog's `source.path` is relative to the repository root, not to `.agents/plugins`. A proposed catalog following the documented format is:

```json
{
  "name": "threadboard-plugins",
  "interface": { "displayName": "Threadboard" },
  "plugins": [
    {
      "name": "threadboard",
      "source": { "source": "local", "path": "./plugins/threadboard" },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

The auth-policy field is required catalog metadata in the documented examples. The revised hosted service needs authenticated, tenant-isolated access. Prove how connection credentials reach both the hosted MCP and any bundled adapter; a catalog policy alone does not implement authentication. No paid identity provider is assumed. [Catalog fields](https://developers.openai.com/plugins/build/plugins#marketplace-metadata).

After a real repository and tested release tag exist, users would run:

```sh
codex plugin marketplace add OWNER/REPOSITORY --ref v0.1.0
codex plugin add threadboard@threadboard-plugins
```

`OWNER/REPOSITORY` is a placeholder. The marketplace name comes from the JSON catalog, not the repository name. These commands were verified against installed CLI help, version **0.157.1**; no source or plugin was added during research. After installing, start a new chat; restart the desktop app if needed to load new UI surfaces. [CLI plugin commands](https://learn.chatgpt.com/docs/developer-commands#codex-plugin), [session reload guidance](https://learn.chatgpt.com/docs/plugins).

Document upgrades independently of first installation. `codex plugin marketplace upgrade` refreshes Git snapshots, but a source pinned to an immutable release tag must be deliberately advanced for a newer release. Validate source refresh, installed-cache replacement, version reporting, and desktop reload together. Never store boards in the replaceable package directory. [Marketplace management](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli).

## 4. Requirements we must satisfy before a local release

| Requirement | Proposed fulfillment | Evidence still required |
| --- | --- | --- |
| Stable identity and version | `threadboard`, semantic version, real publisher metadata | Final name and repository; manifest validation |
| Valid catalog and paths | Documented fields; in-root `./plugins/threadboard` | Clean Git-source installation |
| Executable local MCP package | Bundled stdio server and dependencies | Initialization, resources, tools, and restart from installed cache |
| Available runtime | Free supported Node installation; no dependency compilation | Runtime version and GUI-launched PATH lookup on each supported OS |
| Packaged UI | Self-contained HTML/CSS/JS and assets | Sidebar/thread entrypoints, bridge capabilities, theme, CSP |
| Shared local task content | SQLite outside plugin cache or a proved host-resource file adapter | Cross-chat access, conditional edits, migrations, restart, update, backup, deletion |
| Hosted metadata | Worker/D1 with strict IDs/state schemas | Tenant isolation, conditional claims, idempotency, and metadata-only traffic/logs |
| Local/remote recovery | Separate versions and local operation receipts | Partial creation/submission, uncertain writes, and reconnect without duplicate execution |
| Correct project association | Explicit binding, with supported host evidence | Saved projects, worktrees, ambiguous roots, and cross-project isolation |
| New chat from a card | Supported native message or workspace deep-link route | Project placement, launch outcome, and run binding |
| Chat link and attribution | Documented technical-thread deep link | Trustworthy source of that thread ID; bridge link-opening behavior |
| Safe tools | Bounded schemas, accurate read/write/destructive annotations | Protocol checks and expected approval behavior |
| Optional hooks | Minimal context registration, only if needed | Trust-review flow and failure behavior; no transcript access |
| Public distributable | License, notices, instructions, screenshots, privacy explanation | Source/history/assets/bundle secret audit and stranger installation |
| Performance | Budgets in `ARCHITECTURE.md` | Measured host, UI, storage, startup, and process-memory results |

Installing a plugin does not automatically trust its hooks. Enterprise source and MCP allowlists can also block installation; that is administrator policy rather than a publishing fee. Do not instruct users to bypass their policy. [Hook trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks), [managed configuration](https://developers.openai.com/codex/enterprise/managed-configuration#configure-plugin-marketplaces-and-defaults).

For a bundled adapter, Node's built-in SQLite module is a candidate for avoiding separately compiled addons. The current Node 24 documentation labels it a release candidate, so select and test a supported version before adoption. GUI runtime discovery remains installation work. A host-resource-only route could avoid this prerequisite, but it is not yet proved. [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

## 5. Native chat and project feasibility

The deeper research found documented desktop links beyond the plugin extension specification:

```text
codex://threads/new?path=<encoded-absolute-directory>&prompt=<encoded-task-prompt>
codex://threads/<technical-thread-id>
```

The first opens a local chat in a workspace with a prefilled composer. It does **not** send the prompt automatically. The second opens an existing local chat. A plugin mention can be included in the encoded prompt. These are useful supported building blocks. A workspace path is not a documented selector for a unique saved native project ID, and using a link inside an MCP iframe still needs host validation. [Chat deep links](https://learn.chatgpt.com/docs/reference/commands#chats).

The `ui/message` extension can send to a new conversation immediately, but its public schema exposes only the active/new target and send behavior. It does not expose project selection or promise a returned chat ID. The specification also says thread entrypoints receive empty arguments; panel placement does not itself supply project identity. [Message API and entrypoints](https://github.com/openai/mcp-extensions/blob/ca16cb3bc015baaa1b849082d8755bbef18770cb/docs/spec.md).

Trusted hooks supply a session ID and working directory and can contribute concise context. This is a candidate for registering a chat with its board without reading transcripts. It still needs validation that the identifier and binding match the intended native chat and project. Existing chats may need a resume/reload before new hooks apply. [Hook input](https://learn.chatgpt.com/docs/hooks#common-input-fields).

Codex app-server can start threads with `cwd` and return thread references. However, its CLI route is documented as experimental, and it does not establish desktop saved-project placement. Generated public schemas in installed CLI 0.157.1 had no `projectId` in `ThreadStartParams` and no project/navigation RPC in the exported request methods. Do not substitute an independently launched agent for the user's requested native chat. [App-server API](https://learn.chatgpt.com/docs/app-server), [maturity](https://learn.chatgpt.com/docs/developer-commands#codex-app-server).

**Unresolved product gate:** prove the complete card → correct native project → resulting chat → linked run flow. A documented prefilled-chat route is a candidate fallback if manually sending the prompt is acceptable; it is not proof of one-click task execution. Preserve the original requirement until its behavior is validated or the user explicitly changes it.

## 6. Directory route and remaining local-content gate

The original fully local design had no documented self-service directory path. The approved hosted metadata endpoint now gives us the standard production HTTPS route. Secure MCP Tunnel remains excluded from public plugin distribution and must not be used to expose local content. [Local publishing](https://developers.openai.com/plugins/guides/submit-claude-plugin#complete-the-submission-requirements), [production endpoint](https://developers.openai.com/plugins/build/mcp-server#deploy-the-endpoint), [tunnel boundary](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

For the standard remote route, the published requirements include verified publisher identity and submission access; endpoint-domain verification; tool/skill scans; website/support/privacy/terms URLs; five positive and three negative review cases; an accessible walkthrough; and release notes. The current ZIP submission rejects lifecycle hooks and existing app references. Only one MCP server can be connected per plugin. A successful repository install or working hosted endpoint does not waive these requirements. [Submission workflow](https://developers.openai.com/plugins/deploy/submission), [validation rules](https://developers.openai.com/plugins/deploy/submission-errors).

There is also a documentation inconsistency: the guidelines say annotation justifications are no longer required, while the submission-error reference still lists justification requirements. It does not block our repository marketplace, but a directory submission must follow the actual portal and clarified review instructions. Do not certify every directory requirement from these conflicting pages. [Annotation guidelines](https://developers.openai.com/plugins/plugin-guidelines#correct-annotation), [validation reference](https://developers.openai.com/plugins/deploy/submission-errors#mcp-and-review-errors).

A hosted UI can potentially access an explicitly opened local file through host-mediated resource reads/writes, including conditional writes with an ETag. This is documented filesystem access for a file entrypoint, not proof of arbitrary SQLite access, sidebar persistence, or shared local content for every chat. File-entrypoint tool calls can be amended by the host with an absolute local path, so this metadata must be audited before any call reaches the Worker. A local board-file adapter is a candidate to test; a bundled companion is an alternative only if its directory installation is supported. [File resources and filesystem behavior](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#file-extension-entrypoint).

The local-content proof must cover model access as well as rendering. Hosted tools cannot accept task descriptions or summaries to compensate for a missing bridge. Browser/widget state is not established shared local storage, and settings/typeahead/logging must not become accidental content-upload paths. Only authenticated IDs/state operations belong in the hosted MCP. A skills-only listing or empty endpoint is not the full product.

Ready-to-send questions for an OpenAI contact or official support channel; no message has been sent:

> We want to publish an open-source Codex desktop Kanban plugin with a production HTTPS MCP endpoint that stores only opaque task/board/run IDs and workflow/ownership state. Task titles, descriptions, acceptance criteria, comments, results, and native project/chat links stay in shared local storage. The plugin never reads or copies actual chats.
>
> 1. Which supported mechanism lets a directory-installed sidebar/chat MCP App and its model tools use the same durable local task store without transmitting its content to the remote MCP server?
> 2. Can the documented host-file resource route provide this across sidebar entrypoints and multiple chats, or is a local companion required? How can that companion be installed given the one-connected-MCP limit?
> 3. Does file-entrypoint invocation forward paths, file names, or other local metadata to the remote server, and can that be avoided for this workflow?
> 4. Which supported APIs provide native saved-project identity, same-project new-chat creation, and the resulting technical thread ID?
> 5. Which review requirements apply to this hybrid workflow, including authentication, annotations, local runtime/components, domain verification, directory fees, and supported desktop plans?

## 7. Cost plan

Initial approved baseline: **US$5/month for Cloudflare Workers**, using existing development hardware and D1 within included allowances. This replaces the earlier $0-only publisher infrastructure requirement. It is a planning baseline, not a guaranteed bill ceiling or unlimited AI usage. No plan has been purchased.

| Item | Plan |
| --- | --- |
| Source and catalog | Public repository on GitHub Free |
| Downloadable package | GitHub Releases plus installable files in release-tag snapshots |
| Builds | Local builds; optional standard public GitHub Actions runners |
| Documentation/privacy/support | README, GitHub Issues, and optional free GitHub Pages URL |
| Task content | User's machine; no hosted content storage or content backup |
| Hosted MCP and state | Workers Paid and metadata-only D1; actions/explicit refreshes only |
| Authentication | Supported OAuth/connection with tenant isolation; no paid identity provider assumed |
| Domain | Existing domain if suitable; confirm ownership challenge before purchasing another |
| Model calls | No separate API integration or key; normal Codex usage when a user asks a chat to work |
| Native app distribution | Plugin JavaScript/assets running in Codex; no separate Threadboard `.app` or App Store release |

GitHub Free includes public repositories and public Pages. Standard public-repository Actions runners are free; larger runners, private overages, and separately billed storage features are not our plan. CI is optional, and we can publish from local builds without retaining Actions artifacts or caches. [GitHub Free](https://docs.github.com/en/get-started/learning-about-github/githubs-plans), [public runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

Workers Paid starts at US$5/month per account, including 10 million dynamic requests and 30 million CPU milliseconds per month. Additional requests cost $0.30/million and CPU time $0.02/million milliseconds. Ordinary static asset requests are free. D1 Paid includes 5 GB storage, 25 billion rows read, and 50 million rows written per month; higher usage is billed separately. Keep queries indexed and measure actual usage. These are current published allowances, not a guarantee of our eventual invoice. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Publishing a plugin does not require a separate Threadboard App Store release under the documented package route. A separately signed/notarized native executable would introduce another distribution decision; Apple Developer Program membership is currently USD 99 annually. A separate desktop app or paid runtime distribution is outside this MVP. [Apple membership](https://developer.apple.com/programs/enroll/).

Codex model work still uses the user's account limits or selected billing method. Board refresh, card movement, storage, and coordination need no model calls. Do not advertise unlimited free coding or guarantee plugin availability on every Free-plan rollout. The official pricing page distinguishes account plans and notes that MCP context contributes to usage. [Codex pricing and usage](https://learn.chatgpt.com/docs/pricing).

The MVP does not target real-time updates. Refresh happens on opening, explicit request, completed user board actions, and connection recovery. There is no periodic polling, Durable Object, WebSocket, or live synchronization service. The previously discussed three-second polling example is not the intended workload or a basis for estimating this MVP's costs. Reduced request frequency does not relax the local-content boundary.

The reviewed OpenAI submission pages do not publish a listing-fee schedule. Domain and authentication decisions, usage overages, and any required local component remain release planning work. Paid hosting addresses transport; it does not purchase directory approval.

## 8. Checks performed and stopping condition

- Read current official packaging, local MCP, extensions, plugins, commands, hooks, publishing, validation, tunnel, and pricing documentation.
- Inspected the official extensions repository at `ca16cb3bc015baaa1b849082d8755bbef18770cb`, dated 2 October 2026, including local example manifests, build script, SDK message schema, and license metadata.
- Verified local CLI 0.157.1 exposes marketplace add/upgrade and plugin add, without running installation or changing configuration.
- Generated existing CLI protocol schemas in a temporary directory, examined project/thread fields, and removed that directory after inspection.
- Attempted only an initialization handshake through the CLI's default app-server proxy. No default socket was available in this environment. No chats, turns, model calls, auth requests, or configuration changes were made.
- Rechecked hosted submission's one-connected-MCP limit, documented host-file reads/writes and path amendment, and current Workers/D1 pricing after the user approved metadata-only hosting.
- No application code, plugin installation, deployment, repository publication, or directory submission was performed.

Repository distribution and the standard HTTPS submission transport are supported in principle. Shared local task access for a directory installation, clean authentication/installation, and the complete native project/chat workflow remain unverified. The next engineering milestone is a small integration proof covering these boundaries before the full board implementation. Where the documented bridge cannot establish the required behavior, obtain OpenAI confirmation rather than upload content or describe the gate as cleared.
