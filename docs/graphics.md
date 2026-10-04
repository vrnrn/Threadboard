# Graphics and product captures

The product images are captures of the current interface with isolated demonstration projects. They contain no personal projects, real chat IDs, task exports, or simulated Codex window chrome. They demonstrate the browser-rendered board; native host behavior is verified separately.

## Asset map

| Asset | Purpose |
| --- | --- |
| [Plugin logo](../plugins/threadboard/assets/logo.svg) | Marketplace branding; charcoal tile and a neutral board mark |
| [Navigation icon](../plugins/threadboard/assets/icon.svg) | 20 × 20, transparent, monochrome `currentColor` icon |
| [Light banner](images/cover.svg), [dark banner](images/cover-dark.svg) | README introduction, matched to GitHub appearance |
| [Social preview](images/social-preview.png) | 1200 × 630 repository or announcement artwork |
| [Board](images/board.png), [dark board](images/board-dark.png) | Five-column Product board with representative work in every state |
| [Overview](images/overview.png), [dark overview](images/overview-dark.png) | Native projects with multiple named boards and empty General boards |
| [Project boards](images/project-boards.png), [dark project boards](images/project-boards-dark.png) | A single project's General, Product, and Release boards |
| [Review](images/task-review.png), [dark review](images/task-review-dark.png) | Task content, criteria, ownership, deliberate notes, and acceptance controls |
| [Full detail](images/task-detail.png), [dark full detail](images/task-detail-dark.png) | Review dialog in the surrounding board |
| [Phone board](images/board-mobile-dark.png) | Responsive navigation and horizontally scrollable columns |
| [Empty projects](images/empty-projects-dark.png), [empty board](images/empty-board-dark.png) | Current empty-state guidance |

## Rebuild

```sh
npm run graphics
```

This first builds the compiled UI, seeds temporary native project metadata and tasks, runs the screenshot/layout checks, and then renders the social artwork from [graphics.html](graphics.html). The social image uses the actual dark board capture. All images and fonts are local. No image-generation service, remote assets, or saved user data are used.

The screenshot fixtures show Orbit with General, Product, and Release boards; Atlas with an empty General board; and Website with General and Editorial. Product includes nine example cards across all five states. Release and Editorial demonstrate independent task counts. Every fixture is discarded when its preview server exits.

README images use [GitHub theme markers](https://github.blog/changelog/2021-11-24-specify-theme-context-for-images-in-markdown/) so they follow the reader’s selected GitHub appearance. Use the SVG files as the editable brand sources. Keep product captures separate from the plugin's runtime assets: documentation graphics are not loaded by the board. The generated social PNG is ready for repository social-preview settings or sharing.
