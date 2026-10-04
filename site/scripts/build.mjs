import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { zipSync } from "fflate";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
const site = fileURLToPath(new URL("../", import.meta.url));
const root = dirname(site.slice(0, -1));
const output = join(site, "dist");
const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
const pack = spawnSync(
  process.execPath,
  [join(root, "scripts/release.mjs"), "--stage-only"],
  { encoding: "utf8" },
);
if (pack.status !== 0) throw new Error(pack.stderr || pack.stdout);
const packageName = `threadboard-${version}.zip`;
const stageName = `threadboard-${version}`;
const stage = join(root, "release", stageName);
const manifest = JSON.parse(readFileSync(join(stage, "MANIFEST.json"), "utf8"));
const entries = Object.fromEntries(
  [...Object.keys(manifest.files), "MANIFEST.json"]
    .sort()
    .map((path) => [
      `${stageName}/${path}`,
      [
        readFileSync(join(stage, path)),
        { mtime: new Date("2020-01-01T00:00:00Z") },
      ],
    ]),
);
const packageBytes = zipSync(entries, { level: 6 });
const packageHash = createHash("sha256").update(packageBytes).digest("hex");
// Preview builds can change without a version bump. Give each download and its
// checksum matching content-specific URLs so caches cannot mix two builds.
const downloadName = `threadboard-${version}-${packageHash.slice(0, 12)}.zip`;
const checksumName = `${downloadName}.sha256`;
writeFileSync(join(root, "release", packageName), packageBytes);
writeFileSync(
  join(root, "release/SHA256SUMS"),
  `${packageHash}  ${packageName}\n`,
);
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "assets"), { recursive: true });
mkdirSync(join(output, "downloads"));
const demo = await build({
  entryPoints: [join(root, "src/ui/main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  outfile: "app.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  legalComments: "inline",
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [join(site, "node_modules")],
  plugins: [
    {
      name: "website-demo-transport",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/bridge\.js$/ }, () => ({
          path: join(site, "src/demo/bridge.ts"),
        }));
      },
    },
  ],
});
mkdirSync(join(output, "demo"));
for (const file of demo.outputFiles)
  writeFileSync(
    join(output, "demo", file.path.endsWith(".css") ? "app.css" : "app.js"),
    file.contents,
  );
const demoBytes = demo.outputFiles.reduce(
  (size, file) => size + gzipSync(file.contents).length,
  0,
);
if (demoBytes > 150 * 1024)
  throw new Error("Interactive demo exceeds its 150 KiB gzip budget.");
cpSync(join(site, "src/demo/demo.css"), join(output, "demo/demo.css"));
cpSync(
  join(root, "THIRD_PARTY_NOTICES.md"),
  join(output, "demo/THIRD_PARTY_NOTICES.md"),
);
writeFileSync(
  join(output, "demo/index.html"),
  '<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>Interactive Threadboard demo</title><link rel="stylesheet" href="/demo/app.css"><link rel="stylesheet" href="/demo/demo.css"></head><body><div id="root"></div><script src="/demo/app.js" defer></script></body></html>',
);
for (const name of ["board", "overview", "task-review"])
  for (const theme of ["", "-dark"])
    cpSync(
      join(root, "docs/images", `${name}${theme}.png`),
      join(output, "assets", `${name}${theme}.png`),
    );
cpSync(
  join(
    site,
    "node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  ),
  join(output, "assets/instrument-sans-latin.woff2"),
);
cpSync(
  join(site, "node_modules/@fontsource-variable/instrument-sans/LICENSE"),
  join(output, "assets/FONT-LICENSE.txt"),
);
cpSync(
  join(root, "release", packageName),
  join(output, "downloads", downloadName),
);
const publicChecksum = `${packageHash}  ${downloadName}\n`;
writeFileSync(join(output, "downloads", checksumName), publicChecksum);
writeFileSync(join(output, "downloads/SHA256SUMS"), publicChecksum);
let html = readFileSync(join(site, "src/index.html"), "utf8")
  .replaceAll("__VERSION__", version)
  .replaceAll("__DOWNLOAD__", downloadName)
  .replaceAll("__CHECKSUM__", checksumName)
  .replaceAll("__SIZE__", (packageBytes.length / 1024 / 1024).toFixed(1));
const structured = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Threadboard",
  description:
    "A local task board inside Codex for planning work, coordinating chats, and reviewing results.",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Codex desktop",
  softwareVersion: version,
  url: "https://threadboard.vrnrn.com/",
  downloadUrl: `https://threadboard.vrnrn.com/downloads/${downloadName}`,
  license: "https://github.com/vrnrn/Threadboard/blob/main/LICENSE",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};
html = html.replace(
  "</head>",
  `<script type="application/ld+json">${JSON.stringify(structured)}</script>\n</head>`,
);
writeFileSync(join(output, "index.html"), html);
for (const file of ["styles.css", "main.js"])
  cpSync(join(site, "src", file), join(output, file));
cpSync(join(site, "src/assets"), join(output, "assets"), { recursive: true });
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .filter((match) => match[1])
  .map(
    (match) =>
      `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
  );
writeFileSync(
  join(output, "_headers"),
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' ${hashes.join(" ")}; style-src 'self'; img-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; connect-src 'none'\n/assets/*\n  Cache-Control: public, max-age=86400\n/downloads/*\n  Cache-Control: public, max-age=3600\n/downloads/*.zip\n  Content-Type: application/zip\n`,
);
writeFileSync(
  join(output, "robots.txt"),
  "User-agent: *\nAllow: /\nDisallow: /downloads/\nSitemap: https://threadboard.vrnrn.com/sitemap.xml\n",
);
writeFileSync(
  join(output, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://threadboard.vrnrn.com/</loc></url></urlset>\n',
);
writeFileSync(
  join(output, "404.html"),
  '<!doctype html><html lang="en" data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — Threadboard</title><link rel="stylesheet" href="/styles.css"><main class="wrap section-space"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1>Let’s get you back to the board.</h1><p class="hero-description">This page isn’t here. The product page has the preview and installation guide.</p><div class="hero-actions"><a class="button primary" href="/">Back to Threadboard</a></div></main></html>',
);
// Keep returning visitors from combining new HTML with cached scripts or art.
const assetFiles = [
  "index.html", "404.html", "demo/index.html",
  "styles.css", "main.js", "demo/app.js", "demo/app.css", "demo/demo.css",
  ...readdirSync(join(output, "assets")).sort().map(name => `assets/${name}`),
];
const assetHash = createHash("sha256");
for (const file of assetFiles) assetHash.update(file).update(readFileSync(join(output, file)));
const assetVersion = assetHash.digest("hex").slice(0, 12);
for (const file of ["index.html", "404.html", "demo/index.html", "styles.css"]) {
  const content = readFileSync(join(output, file), "utf8")
    .replace("<html ", `<html data-asset-version="${assetVersion}" `)
    .replaceAll('"/demo/"', `"/demo/?v=${assetVersion}"`)
    .replace(/\/(?:styles\.css|main\.js|assets\/[\w.-]+|demo\/(?:app\.(?:css|js)|demo\.css))(?=["')])/g,
      path => `${path}?v=${assetVersion}`);
  writeFileSync(join(output, file), content);
}
writeFileSync(
  join(output, "build.json"),
  JSON.stringify({
    version,
    commit: process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || null,
    download: downloadName,
    checksum: checksumName,
    sha256: packageHash,
  }) + "\n",
);
console.log(
  `Built Threadboard site and verified ${version} preview download (${(packageBytes.length / 1024 / 1024).toFixed(1)} MB).`,
);
console.log(
  `Actual app UI with browser-only demo transport: ${(demoBytes / 1024).toFixed(1)} KiB gzip.`,
);
