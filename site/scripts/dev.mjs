import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".xml": "application/xml",
};
const globalHeaders = Object.fromEntries(
  readFileSync(resolve(root, "_headers"), "utf8")
    .split("\n")
    .slice(1)
    .filter(
      (line) =>
        line.startsWith("  ") && !line.trim().startsWith("Cache-Control:"),
    )
    .map((line) => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    }),
);
const port = Number(process.env.THREADBOARD_SITE_PORT || 4400);
const server = createServer((request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname.endsWith("/")
      ? `${url.pathname}index.html`
      : url.pathname;
    const path = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (
      !path.startsWith(root.replace(/\/$/, "") + sep) ||
      !statSync(path).isFile()
    )
      throw new Error("Not found");
    response.writeHead(200, {
      ...globalHeaders,
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(readFileSync(path));
  } catch {
    response.writeHead(404, { "Content-Type": "text/html" });
    response.end(readFileSync(resolve(root, "404.html")));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Threadboard site: http://127.0.0.1:${port}`),
);
