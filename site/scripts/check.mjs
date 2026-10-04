import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const output = fileURLToPath(new URL("../dist/", import.meta.url));
const html = readFileSync(join(output, "index.html"), "utf8");
const metadata = JSON.parse(readFileSync(join(output, "build.json"), "utf8"));
assert.ok(
  html.includes('data-theme="dark"'),
  "First visits must default to dark.",
);
assert.ok(
  !/__VERSION__|__SIZE__|__DOWNLOAD__|__CHECKSUM__/.test(html),
  "Unresolved build placeholder.",
);
const ids = new Set(
  [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
);
for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  const reference = match[1];
  if (/^https?:/.test(reference)) continue;
  if (reference.startsWith("#")) {
    assert.ok(ids.has(reference.slice(1)), `Missing anchor ${reference}`);
    continue;
  }
  const pathname = new URL(reference, "https://threadboard.vrnrn.com").pathname;
  const path = pathname === "/" ? "/index.html" : pathname;
  assert.ok(
    existsSync(resolve(output, `.${path}`)),
    `Missing asset: ${reference}`,
  );
}
assert.equal(
  createHash("sha256")
    .update(readFileSync(join(output, "downloads", metadata.download)))
    .digest("hex"),
  metadata.sha256,
  "Download does not match its recorded checksum.",
);
assert.ok(
  readFileSync(join(output, "downloads/SHA256SUMS"), "utf8").includes(
    metadata.sha256,
  ),
);
assert.equal(
  metadata.download,
  `threadboard-${metadata.version}-${metadata.sha256.slice(0, 12)}.zip`,
);
assert.equal(
  readFileSync(join(output, "downloads", metadata.checksum), "utf8"),
  `${metadata.sha256}  ${metadata.download}\n`,
);
assert.ok(
  html.includes("https://threadboard.vrnrn.com/"),
  "Missing canonical domain.",
);
assert.ok(
  !/<(?:script|img)[^>]+src="https?:|<link[^>]+rel="(?:stylesheet|preload)"[^>]+href="https?:/i.test(
    html,
  ),
  "Page must not load third-party scripts, images, styles, or fonts.",
);
const budget = {
  "index.html": 13 * 1024,
  "styles.css": 12 * 1024,
  "main.js": 4 * 1024,
};
for (const [file, maximum] of Object.entries(budget)) {
  const compressed = gzipSync(readFileSync(join(output, file))).length;
  assert.ok(compressed <= maximum, `${file} exceeds its gzip budget.`);
  console.log(`${file}: ${(compressed / 1024).toFixed(1)} KiB gzip`);
}
assert.ok(
  readFileSync(join(output, "_headers"), "utf8").includes(
    "frame-ancestors 'self'",
  ),
);
assert.ok(
  readFileSync(join(output, "_headers"), "utf8").includes("connect-src 'none'"),
);
assert.ok(
  existsSync(join(output, "demo/app.js")) &&
    existsSync(join(output, "demo/app.css")),
);
const assets = readdirSync(join(output, "assets"));
assert.ok(assets.includes("FONT-LICENSE.txt"));
console.log(
  "Website assets, anchors, metadata, offline resources, performance budgets, and preview checksum passed.",
);
