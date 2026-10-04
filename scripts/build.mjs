import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const output = new URL('plugins/threadboard/dist/', root);
await mkdir(output, { recursive: true });
const ui = await build({ entryPoints: [fileURLToPath(new URL('src/ui/main.tsx', root))], bundle: true, minify: true,
  write: false, outfile: 'board.js', format: 'iife', platform: 'browser', target: 'es2022', legalComments: 'inline',
  define: { 'process.env.NODE_ENV': '"production"' }, metafile: true });
const js = ui.outputFiles.find(f => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = ui.outputFiles.find(f => f.path.endsWith('.css'))?.text || '';
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Threadboard</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
await writeFile(new URL('board.html', output), html);
const server = await build({ entryPoints: [fileURLToPath(new URL('src/server.ts', root))], bundle: true, minify: true,
  loader: { '.svg': 'text' },
  outfile: fileURLToPath(new URL('server.mjs', output)), platform: 'node', format: 'esm', target: 'node22',
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' }, legalComments: 'inline', metafile: true });
const packages = new Set();
for (const input of [...Object.keys(ui.metafile.inputs), ...Object.keys(server.metafile.inputs)]) {
  const parts = input.split('node_modules/');
  if (parts.length > 1) {
    const name = parts.at(-1).split('/');
    packages.add(name[0].startsWith('@') ? name.slice(0, 2).join('/') : name[0]);
  }
}
let notices = '# Third-party notices\n\nThreadboard includes the following packages in its compiled release. Original licenses and notices follow.\n';
for (const name of [...packages].sort()) {
  const folder = fileURLToPath(new URL(`node_modules/${name}/`, root));
  const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  notices += `\n## ${name} ${pkg.version}\n\nLicense: ${pkg.license || 'See license text'}\n`;
  let found = false;
  for (const filename of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT','LICENSE-MIT.txt','license','license.md','license.txt','NOTICE','NOTICE.txt']) {
    try { const license = await readFile(join(folder, filename), 'utf8'); notices += `\n### ${filename}\n\n\`\`\`text\n${license.trim()}\n\`\`\`\n`; if (filename.toUpperCase().startsWith('LICENSE')) found = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!found && name === '@cfworker/json-schema') {
    notices += `\nUpstream license: https://github.com/cfworker/cfworker/blob/53401039978aaacc5961d6fc0f2c64f7927ea260/LICENSE.md\n\n\`\`\`text\n${(await readFile(new URL('vendor-licenses/cfworker-LICENSE.md', root), 'utf8')).trim()}\n\`\`\`\n`;
    found = true;
  }
  if (!found) throw new Error(`Missing bundled dependency license: ${name}`);
}
await writeFile(new URL('THIRD_PARTY_NOTICES.md', root), notices);
await writeFile(new URL('bundle-packages.json', output), JSON.stringify([...packages].sort(), null, 2) + '\n');
const uiSize = gzipSync(Buffer.from(js + css)).length;
await writeFile(new URL('build-info.json', output), JSON.stringify({ version, uiGzipBytes: uiSize, htmlBytes: Buffer.byteLength(html), runtime: 'Node >=22.13' }, null, 2) + '\n');
console.log(`Built local plugin: UI ${(uiSize / 1024).toFixed(1)} KiB gzip; all assets bundled.`);
if (uiSize > 250 * 1024) throw new Error('UI exceeds the 250 KiB gzip performance budget.');
