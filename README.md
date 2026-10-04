<img src="docs/images/cover-dark.svg#gh-dark-mode-only" alt="Threadboard — Task boards inside Codex" width="1200">
<img src="docs/images/cover.svg#gh-light-mode-only" alt="Threadboard — Task boards inside Codex" width="1200">

Threadboard adds local task boards to Codex. Plan work in your existing projects, assign cards to chats, and review the results before marking them Done.

[Website and interactive demo](https://threadboard.vrnrn.com/) · [Install](#install-the-current-preview) · [User guide](docs/usage.md) · [Development](docs/development.md) · [Release notes](RELEASE_NOTES.md)

<img src="docs/images/board-dark.png#gh-dark-mode-only" alt="Orbit's Product board, with tasks across Backlog, Ready, In progress, Review, and Done" width="1512">
<img src="docs/images/board.png#gh-light-mode-only" alt="Orbit's Product board, with tasks across Backlog, Ready, In progress, Review, and Done" width="1512">

## What it does

- **Uses your Codex projects.** Each gets a General board. Add named boards for features, releases, or other work.
- **Connects tasks to chats.** Start a new chat from a card or ask an existing chat to claim it. One chat owns a task at a time.
- **Keeps the result on the card.** Chats add progress notes and submit work to Review. You accept it into Done or request changes.
- **Updates as you work.** Visible boards check for local changes. Hidden panels pause, and refreshes preserve open drafts.
- **Fits inside Codex.** Host themes, keyboard controls, and layouts for narrow panels are supported.

Boards live in a local SQLite database. The plugin has no hosted backend, telemetry, or transcript access. Task information used in a chat goes through your normal Codex account and model service. [Privacy details](PRIVACY.md).

<table>
  <tr>
    <td width="50%" valign="top"><strong>Projects and boards</strong><br><br><img src="docs/images/overview-dark.png#gh-dark-mode-only" alt="Boards grouped by Codex project"><img src="docs/images/overview.png#gh-light-mode-only" alt="Boards grouped by Codex project"></td>
    <td width="50%" valign="top"><strong>Task review</strong><br><br><img src="docs/images/task-review-dark.png#gh-dark-mode-only" alt="A task's goal, checks, activity, and review controls"><img src="docs/images/task-review.png#gh-light-mode-only" alt="A task's goal, checks, activity, and review controls"></td>
  </tr>
</table>

Screenshots use example projects. [More captures and editable artwork](docs/graphics.md).

## Install the current preview

Requires **Codex desktop with plugin/MCP App support**, the **Codex CLI**, and **Node.js 22.13 or newer**.

```sh
codex plugin marketplace add vrnrn/Threadboard --ref main
codex plugin add threadboard@threadboard-plugins
```

Fully quit and reopen Codex, then open **Threadboard** from the sidebar. The repository includes compiled assets; no npm install or build step is needed. Node must be available on Codex's PATH.

You can also [download the website preview](https://threadboard.vrnrn.com/#install), extract the ZIP, and run `node install.mjs` from that folder. The installer checks the package, finds Node, and preserves existing task data during updates.

### Install a release

The older [GitHub release, 0.1.1](https://github.com/vrnrn/Threadboard/releases/tag/v0.1.1), uses manual workspace association and refresh. Use the website or repository preview for the native projects, named boards, and live updates shown here.

## Using the board

Open a card and choose **Start in new chat**, then **send the prepared prompt** in Codex to begin. A named board can also have a companion chat. [The user guide](docs/usage.md) covers ownership, review, exports, backups, and recovery.

**N** creates a task, **⌘/Ctrl K** focuses search, and **Escape** closes a dialog. Search covers loaded cards; boards with more than 200 tasks offer **Load more tasks**.

This is preview software. Native board opening has been tested locally. Card-launch project placement, sidebar icons after a host restart, and **Open full view** recovery still need native-host verification. Browser tests cannot confirm Codex's window layout. Threadboard is independently distributed and is not listed in OpenAI's universal directory.

## Development

See [development and verification](docs/development.md) for builds, tests, benchmarks, and packaging. The website lives in [`site/`](site/README.md). Run `npm run graphics` to update product screenshots and repository artwork.

Inspired by [Cline Kanban](https://github.com/cline/kanban). MIT licensed; bundled dependency licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). [Report a bug](https://github.com/vrnrn/Threadboard/issues).
