const root = document.documentElement;
const announcement = document.querySelector("#announcement");
const themeToggle = document.querySelector(".theme-toggle");
const screenshotNames = {
  board: "Orbit / Product",
  overview: "Your boards / All projects",
  "task-review": "TB-7 / Review the result",
};
function applyTheme(theme) {
  root.dataset.theme = theme;
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
  );
  themeToggle.title = themeToggle.getAttribute("aria-label");
  document.querySelector('meta[name="theme-color"]').content =
    theme === "dark" ? "#181818" : "#f7f5f0";
  for (const image of document.querySelectorAll("[data-theme-image]"))
    image.src = imageSource(image.dataset.themeImage);
  document.querySelector("[data-open-demo]").href = `/demo/?theme=${theme}`;
}
function imageSource(name) {
  return `/assets/${name}${root.dataset.theme === "dark" ? "-dark" : ""}.png`;
}
applyTheme(root.dataset.theme);
themeToggle.addEventListener("click", () => {
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try {
    localStorage.setItem("threadboard-theme", theme);
  } catch {}
  announcement.textContent = `${theme === "dark" ? "Dark" : "Light"} mode selected.`;
});
const steps = [
  {
    state: "Ready",
    owner: "No owner yet",
    note: "The brief is ready for a chat to pick up.",
    copy: "The card keeps the outcome and acceptance criteria together, so the next chat starts with a useful brief.",
  },
  {
    state: "In progress",
    owner: "Release chat owns this task",
    note: "Checking the ZIP against its manifest. Next: upgrade an existing installation.",
    copy: "One chat owns the task. Progress notes stay on the card for you and other chats to read.",
  },
  {
    state: "Review",
    owner: "Release chat submitted its result",
    note: "Clean install passed. The upgrade retained existing tasks. All 36 packaged files verified.",
    copy: "The result comes back with its validation. Read it against the brief, then accept it or request changes.",
  },
  {
    state: "Done",
    owner: "Accepted into Done",
    note: "Installation verified. Task data preserved. The result stays on the card.",
    copy: "You mark the work Done. The card keeps its description, notes, and result.",
  },
];
const stepTabs = [...document.querySelectorAll("[data-step]")];
function selectStep(index) {
  const data = steps[index];
  stepTabs.forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
  });
  const panel = document.querySelector("#workflow-panel");
  panel.setAttribute("aria-labelledby", `step-${index}`);
  panel.dataset.step = index;
  document.querySelector("#example-state").textContent = data.state;
  document.querySelector("#example-update strong").textContent = data.owner;
  document.querySelector("#example-update p").textContent = data.note;
  document.querySelector("#stage-copy").textContent = data.copy;
}
function keyboardTabs(event, tabs, select) {
  const index = tabs.indexOf(event.currentTarget);
  let target;
  if (event.key === "ArrowRight" || event.key === "ArrowDown")
    target = (index + 1) % tabs.length;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    target = (index + tabs.length - 1) % tabs.length;
  if (event.key === "Home") target = 0;
  if (event.key === "End") target = tabs.length - 1;
  if (target === undefined) return;
  event.preventDefault();
  select(target);
  tabs[target].focus();
}
stepTabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectStep(i));
  tab.addEventListener("keydown", (event) =>
    keyboardTabs(event, stepTabs, selectStep),
  );
});
const installTabs = [...document.querySelectorAll("[data-install]")];
function selectInstall(index) {
  installTabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.querySelector(`#${tab.getAttribute("aria-controls")}`).hidden =
      !selected;
  });
}
installTabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectInstall(i));
  tab.addEventListener("keydown", (event) =>
    keyboardTabs(event, installTabs, selectInstall),
  );
});
for (const button of document.querySelectorAll("[data-copy]"))
  button.addEventListener("click", async () => {
    const label = button.getAttribute("aria-label");
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.querySelector("use").setAttribute("href", "#check");
      button.setAttribute("aria-label", "Copied");
      announcement.textContent = "Command copied.";
      setTimeout(() => {
        button.querySelector("use").setAttribute("href", "#copy");
        button.setAttribute("aria-label", label);
      }, 2200);
    } catch {
      announcement.textContent =
        "Copy unavailable. Select and copy the displayed command.";
    }
  });
const imageDialog = document.querySelector(".image-dialog");
let imageTrigger;
for (const button of document.querySelectorAll("[data-open-image]"))
  button.addEventListener("click", () => {
    imageTrigger = button;
    const name = button.dataset.openImage;
    const source = document.querySelector(`[data-theme-image="${name}"]`);
    const large = document.querySelector("#large-image");
    large.src = imageSource(name);
    large.alt =
      source?.alt || "The actual Threadboard Product board with example tasks.";
    large.width = source?.width || 1512;
    large.height = source?.height || 982;
    document.querySelector("#image-dialog-title").textContent =
      screenshotNames[name];
    document.querySelector("#full-image-link").href = large.src;
    imageDialog.showModal();
    document.body.classList.add("image-open");
  });
document
  .querySelector("[data-close-image]")
  .addEventListener("click", () => imageDialog.close());
imageDialog.addEventListener("click", (event) => {
  if (event.target === imageDialog) {
    const bounds = imageDialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      imageDialog.close();
  }
});
imageDialog.addEventListener("close", () => {
  document.body.classList.remove("image-open");
  imageTrigger?.focus();
});
document.querySelector("[data-reset-demo]").addEventListener("click", () => {
  document.querySelector("#app-demo").src =
    `/demo/?theme=${root.dataset.theme}`;
  announcement.textContent = "Demo board reset to its example projects.";
});
window.addEventListener("message", (event) => {
  const frame = document.querySelector("#app-demo");
  if (
    event.origin !== location.origin ||
    event.source !== frame.contentWindow ||
    event.data?.type !== "threadboard-demo-dialog"
  )
    return;
  frame.scrollIntoView({ block: "center", behavior: "instant" });
});
