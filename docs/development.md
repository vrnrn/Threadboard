# Development and verification

Threadboard bundles a React MCP App and a Node stdio server. The installed plugin runs the compiled files in `plugins/threadboard/dist/`; it does not need a build step or npm at runtime.

## Local checks

```sh
npm ci
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:ui
npm run screenshots
npm run graphics
npm run benchmark
npm run benchmark:startup
npm run benchmark:concurrency
npm run benchmark:populated
npm run benchmark:ui
npm run benchmark:live
npm run release:check
npm run release:pack
npm run test:install
```

`npm run dev` serves a development-only loopback preview at `http://127.0.0.1:4388`. Set `THREADBOARD_DATA_DIR` to an isolated absolute directory for sample data. This preview is not the user-facing installation.

The UI and stdio server are bundled, including licenses. The board loads no remote fonts, scripts or assets. Board reads return at most 200 summaries per page. The local benchmark checks 2,000 representative tasks against a 50 ms p95 read budget; UI JavaScript and CSS have a 250 KiB gzip budget. These are development budgets, not a latency guarantee on every machine.

## Visual assets

`npm run screenshots` seeds temporary projects and tasks, captures the current UI, and checks control layouts at desktop, tablet, and phone widths. It never uses your saved boards. `npm run graphics` runs those captures and renders the repository social image from `docs/graphics.html`. See [the graphics guide](graphics.md) for the asset map.

Run Playwright suites sequentially: each suite owns `test-results/`. Screenshots show the actual browser-rendered interface with demonstration data, without simulated Codex window chrome.

## Release checks

Build before testing the packaged protocol. Then run the release audit, packaging, and clean installation check. The release audit protects `VISION.md`, `ARCHITECTURE.md`, and `PUBLISHING_RESEARCH.md`, checks versions and bundled size, and scans source/package files for private data and remote UI assets.

The installer keeps plugin files and task storage separate. Installer tests run with an isolated Codex home and verify cached MCP execution, cached resource URLs, and task persistence. `THREADBOARD_PREVIOUS_RELEASE` can point to an older extracted package to verify an upgrade.

The preview has 26 backend tests and 22 UI tests. Native board opening has been confirmed locally; the new full-view recovery control and card-launch project placement still need native-host verification. Browser and protocol checks cannot establish those behaviors.

## Planning and history

[The vision](https://github.com/vrnrn/Threadboard/blob/main/VISION.md) and [architecture](https://github.com/vrnrn/Threadboard/blob/main/ARCHITECTURE.md) describe the long-term product. [The engineering log](https://github.com/vrnrn/Threadboard/blob/main/prototype.md) retains version-specific decisions and measurements. [Release notes](https://github.com/vrnrn/Threadboard/blob/main/RELEASE_NOTES.md) distinguish the current source preview from published packages.
