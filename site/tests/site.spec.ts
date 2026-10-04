import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
test("returning visitors bypass old unversioned styles and demo assets", async ({ page }) => {
  const staleRequests: string[] = [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    const stale = ["/styles.css", "/main.js", "/demo/", "/demo/app.js", "/demo/app.css", "/demo/demo.css"];
    if (stale.includes(url.pathname) && !url.searchParams.has("v")) {
      staleRequests.push(url.pathname);
      await route.fulfill({ status: 410, body: "Old cached asset" });
    } else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Task boards. Inside Codex." })).toBeVisible();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Reset demo board" }).click();
  const app = page.frameLocator("#app-demo");
  await expect(app.getByRole("heading", { name: "Guide users through their first task" })).toBeVisible();
  expect(staleRequests).toEqual([]);
});

test("dark is the default; theme choice and product images survive navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const app = page.frameLocator("#app-demo");
  await expect(app.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(app.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  await expect(app.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});
test("the example handoff supports pointer and keyboard; screenshot dialog returns focus", async ({
  page,
}) => {
  await page.goto("/");
  const ready = page.getByRole("tab", { name: /01 Ready/ });
  await ready.focus();
  await ready.press("ArrowRight");
  await expect(page.locator("#example-state")).toHaveText("In progress");
  await expect(page.locator("#example-update strong")).toContainText(
    "Release chat owns",
  );
  await page.getByRole("tab", { name: /03 Review/ }).click();
  await expect(page.locator("#example-state")).toHaveText("Review");
  await expect(page.locator("#example-update p")).toContainText(
    "36 packaged files",
  );
  await page.getByRole("tab", { name: /03 Review/ }).press("End");
  await expect(page.locator("#example-state")).toHaveText("Done");
  await expect(page.getByRole("tab", { name: /04 Done/ })).toBeFocused();
  const trigger = page.getByRole("button", {
    name: "Enlarge the actual task review screenshot",
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#large-image")).toHaveAttribute(
    "src",
    /\/assets\/task-review-dark\.png\?v=[a-f0-9]{12}$/,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
test("installation is actionable; the downloadable ZIP matches its checksum", async ({
  page,
  request,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Get Threadboard", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Add Threadboard to Codex." }),
  ).toBeInViewport();
  await page.getByRole("tab", { name: "With the Codex CLI" }).click();
  await expect(page.locator("#cli-instructions")).toBeVisible();
  await expect(page.locator("#download-instructions")).not.toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copy the Codex CLI commands" })
    .click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "codex plugin marketplace add vrnrn/Threadboard --ref main\ncodex plugin add threadboard@threadboard-plugins",
  );
  const href = await page
    .getByRole("link", { name: /Download the preview/ })
    .getAttribute("href");
  const zip = await request.get(href!);
  expect(zip.ok()).toBeTruthy();
  const bytes = await zip.body();
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  const checksumHref = await page
    .getByRole("link", { name: "Verify the checksum", exact: true })
    .getAttribute("href");
  const checksum = await request.get(checksumHref!);
  expect(await checksum.text()).toContain(
    createHash("sha256").update(bytes).digest("hex"),
  );
});
for (const theme of ["dark", "light"])
  test(`responsive layout and accessibility in ${theme} mode`, async ({
    page,
  }) => {
    await page.goto("/");
    if (theme === "light")
      await page.getByRole("button", { name: "Switch to light mode" }).click();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Page overflow at ${width}px`,
      ).toBeTruthy();
      await expect(
        page.getByRole("button", {
          name: `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("link", { name: "Get Threadboard", exact: true })
          .first(),
      ).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        `Accessibility at ${width}px`,
      ).toEqual([]);
      if (width === 1440 || width === 390) {
        await page.screenshot({ path: `test-results/site-${theme}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator("summary")
      .filter({ hasText: "What do I need?" })
      .click();
    await expect(
      page.getByText("Codex desktop with plugin and MCP App support,", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Enlarge the Your boards overview screenshot",
      })
      .click();
    const modal = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(modal.violations.map((v) => v.id)).toEqual([]);
    await page.getByRole("button", { name: "Close screenshot" }).click();
  });

test("the actual app demo can edit, move, create, filter, switch boards and reset without a backend", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" || request.url().includes("/api"))
      calls.push(request.url());
  });
  await page.goto("/");
  const app = page.frameLocator("#app-demo");
  await expect(
    app.getByRole("heading", { name: "Orbit", exact: true }),
  ).toBeVisible();
  await expect(app.locator(".task-card")).toHaveCount(9);
  await app
    .getByRole("button", { name: /^Package a one-command installation/ })
    .click();
  await expect(
    app.getByRole("textbox", { name: "Acceptance criteria", exact: true }),
  ).toHaveValue(
    "Package versions agree.\nA clean Codex profile opens the board.\nUpgrading preserves existing tasks.",
  );
  await app.getByRole("button", { name: "Close dialog" }).click();
  await app
    .getByRole("button", { name: /^Guide users through their first task/ })
    .click();
  const detail = app.getByRole("dialog", { name: "TB-1 · Orbit" });
  await detail
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Ship a useful welcome flow");
  await detail.getByRole("button", { name: "Save changes" }).click();
  await expect(
    detail.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await detail
    .getByRole("textbox", { name: "Add a note" })
    .fill("Keep the first step simple.");
  await detail.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    detail.getByText("Keep the first step simple.", { exact: true }),
  ).toBeVisible();
  await detail
    .getByRole("combobox", { name: "Task column" })
    .selectOption("ready");
  await detail.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    app
      .getByRole("region", { name: "Ready", exact: true })
      .getByTestId("task-1"),
  ).toBeVisible();
  await app
    .getByTestId("task-2")
    .dragTo(app.getByRole("region", { name: "Ready", exact: true }), {
      sourcePosition: { x: 12, y: 12 },
      targetPosition: { x: 30, y: 30 },
    });
  await expect(
    app
      .getByRole("region", { name: "Ready", exact: true })
      .getByTestId("task-2"),
  ).toBeVisible();
  await app.getByRole("button", { name: "New task N", exact: true }).click();
  const create = app.getByRole("dialog", { name: "New task", exact: true });
  await create
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Plan the next release");
  await create
    .getByRole("textbox", { name: "Acceptance criteria", exact: true })
    .fill("A small, verifiable release.");
  await create
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await app
    .getByRole("textbox", { name: "Search tasks" })
    .fill("Plan the next release");
  await expect(app.locator(".task-card")).toHaveCount(1);
  const release = await app
    .getByRole("combobox", { name: "Select board" })
    .locator("option")
    .filter({ hasText: "Release" })
    .getAttribute("value");
  await app
    .getByRole("combobox", { name: "Select board" })
    .selectOption(release!);
  await expect(app.locator(".task-card")).toHaveCount(3);
  await app
    .getByRole("navigation", { name: "Project boards" })
    .getByRole("button", { name: /^Atlas,/ })
    .click();
  await expect(app.getByRole("region", { name: "Board picker" })).toBeVisible();
  await app.getByRole("button", { name: /^Open General, Atlas,/ }).click();
  await expect(
    app.getByText("Add your first task.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset demo board" }).click();
  await expect(
    app.getByRole("heading", { name: "Orbit", exact: true }),
  ).toBeVisible();
  await expect(app.locator(".task-card")).toHaveCount(9);
  await expect(
    app.getByRole("button", { name: /^Guide users through their first task/ }),
  ).toBeVisible();
  expect(calls).toEqual([]);
});

test("the demo handoff reserves a card, starts one owner, submits to Review and accepts into Done", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  const app = page.frameLocator("#app-demo");
  await app
    .getByRole("button", { name: /^Make every action work with a keyboard/ })
    .click();
  const detail = app.getByRole("dialog", { name: "TB-3 · Orbit" });
  await detail.getByRole("button", { name: "Start in new chat" }).click();
  const chat = app.getByRole("dialog", { name: "Demo chat handoff" });
  await expect(
    chat.getByText("This simulates the handoff.", { exact: false }),
  ).toBeVisible();
  await chat.getByRole("button", { name: "Send demo prompt" }).click();
  await expect(
    detail.getByRole("combobox", { name: "Task column" }),
  ).toHaveValue("in_progress");
  await chat.getByRole("button", { name: "Close demo chat" }).click();
  await detail.getByRole("button", { name: "Open chat", exact: true }).click();
  await chat.getByRole("button", { name: "Submit demo result" }).click();
  await expect(
    detail.getByRole("combobox", { name: "Task column" }),
  ).toHaveValue("review");
  await chat.getByRole("button", { name: "Back to the board" }).click();
  await detail.getByRole("button", { name: "Accept into Done" }).click();
  await expect(
    detail.getByRole("combobox", { name: "Task column" }),
  ).toHaveValue("done");
  await detail.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    app
      .getByRole("region", { name: "Done", exact: true })
      .getByTestId("task-3"),
  ).toBeVisible();
  expect(
    requests.some((url) => /codex:|\/api(?:\?|$)|api\.openai/.test(url)),
  ).toBe(false);
});

test("released demo chats become unassigned and new activity appears first", async ({ page }) => {
  await page.goto("/");
  const app = page.frameLocator("#app-demo");
  await app.getByRole("button", { name: /^Preserve tasks across plugin updates/ }).click();
  const detail = app.getByRole("dialog", { name: "TB-5 · Orbit" });
  await detail.getByRole("textbox", { name: "Add a note" }).fill("Latest demo update");
  await detail.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(detail.locator(".events .event").first()).toContainText("Latest demo update");
  await detail.getByRole("button", { name: "Release ownership" }).click();
  await expect(detail.getByText("No chat assigned", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Close dialog" }).click();
  await app.getByRole("combobox", { name: "Filter tasks" }).selectOption("unassigned");
  await expect(app.getByTestId("task-5")).toBeVisible();

  await app.getByTestId("task-1").getByRole("button", { name: /^Guide users/ }).click();
  await app.getByRole("button", { name: "Start in new chat" }).click();
  const chat = app.getByRole("dialog", { name: "Demo chat handoff" });
  await expect(chat.getByRole("button", { name: "Send demo prompt" })).toBeVisible();
  await chat.press("Escape");
  await expect(chat).toHaveCount(0);
  await expect(app.getByRole("dialog", { name: "TB-1 · Orbit" })).toBeVisible();
});
