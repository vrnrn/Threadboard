import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const site = fileURLToPath(new URL("../", import.meta.url));
const browser = await chromium.launch();
try {
  let svg = readFileSync(join(site, "src/assets/share.svg"), "utf8");
  svg = svg.replace(/<\?xml[^>]*\?>\s*/g, "");
  const font = readFileSync(
    join(site, "dist/assets/instrument-sans-latin.woff2"),
  ).toString("base64");
  svg = svg.replace(
    'href="board-dark.png"',
    `href="data:image/png;base64,${readFileSync(join(site, "dist/assets/board-dark.png")).toString("base64")}"`,
  );
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><head><style>@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:400 700;src:url(data:font/woff2;base64,${font})}body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: fileURLToPath(new URL("../src/assets/share.png", import.meta.url)),
  });
  console.log(
    "Rendered the 1200 × 630 Threadboard social image from its editable SVG and actual board capture.",
  );
} finally {
  await browser.close();
}
