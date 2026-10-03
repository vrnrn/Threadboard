import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const required = ['README.md','PRIVACY.md','LICENSE','THIRD_PARTY_NOTICES.md','scripts/install.mjs','.agents/plugins/marketplace.json','plugins/threadboard/.codex-plugin/plugin.json','plugins/threadboard/.mcp.json','plugins/threadboard/dist/server.mjs','plugins/threadboard/dist/board.html','plugins/threadboard/skills/threadboard/SKILL.md'];
for (const file of required) if (!readFileSync(join(root, file)).length) throw new Error(`Empty required release file: ${file}`);
const original = {
  'VISION.md': 'b5df6fab43e24fb11cf670dd4e4cbcc66c59424be0ccaaad676242d1f5ce8888',
  'ARCHITECTURE.md': '6d8e36adaf4d75fe448c01ccce8afe5d002823d1552d68a5c62e0211a5a5e004',
  'PUBLISHING_RESEARCH.md': 'c4dcc4174425715703559549e2108ad9c6f77d4b2d8260bf99dcff6f2d20eaa4',
};
for (const [path, hash] of Object.entries(original)) if (createHash('sha256').update(readFileSync(join(root, path))).digest('hex') !== hash) throw new Error(`Protected long-term document changed: ${path}`);
const skip = new Set(['.git','node_modules','release','test-results','playwright-report','.preview-data','coverage']);
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => skip.has(entry.name) ? [] : entry.isDirectory() ? files(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
const paths = files(root);
const leaks = [new RegExp('/Users/' + '[^/\\s]+/'), new RegExp('/home/' + '[^/\\s]+/'), /\bsk-(?:proj-|live-)[A-Za-z0-9_-]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for (const path of paths) {
  if (/\.(?:sqlite|log)$|^\.env(?:\.|$)/i.test(path)) throw new Error(`Private runtime file is in source: ${path}`);
  const text = readFileSync(join(root, path), 'utf8');
  for (const pattern of leaks) if (pattern.test(text)) throw new Error(`Potential private data in ${path}; inspect locally before publishing.`);
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const plugin = JSON.parse(readFileSync(join(root, 'plugins/threadboard/.codex-plugin/plugin.json'), 'utf8'));
const build = JSON.parse(readFileSync(join(root, 'plugins/threadboard/dist/build-info.json'), 'utf8'));
if (pkg.version !== plugin.version || pkg.version !== build.version) throw new Error('Release versions disagree.');
if (build.uiGzipBytes > 250 * 1024) throw new Error('UI performance budget exceeded.');
const mcp = JSON.parse(readFileSync(join(root, 'plugins/threadboard/.mcp.json'), 'utf8')).mcpServers.threadboard;
if (mcp.command !== 'node' || mcp.cwd !== '.' || JSON.stringify(mcp.args) !== '["./dist/server.mjs"]' || mcp.url) throw new Error('MCP configuration is not the portable local package.');
const html = readFileSync(join(root, 'plugins/threadboard/dist/board.html'), 'utf8');
if (/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(html)) throw new Error('The packaged UI depends on a remote asset.');
console.log(`Release audit passed: ${paths.length} source/bundle files; protected documents unchanged; versions agree; local transport; UI ${(build.uiGzipBytes/1024).toFixed(1)} KiB gzip.`);
