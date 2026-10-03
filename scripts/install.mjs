import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, renameSync, rmSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname, isAbsolute, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const source = dirname(fileURLToPath(import.meta.url));
const fail = message => { console.error(`Threadboard: ${message}`); process.exit(1); };
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) fail('Node.js 22.13 or newer is required. Install Node, then run this installer again.');
try { await import('node:sqlite'); } catch { fail('This Node runtime does not support built-in SQLite. Use Node 24 LTS or newer.'); }
const manifestFile = join(source, 'MANIFEST.json');
if (!existsSync(manifestFile)) fail('Run install.mjs from an extracted official release package.');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
if (manifest.format !== 'threadboard-release' || !manifest.version || !manifest.files) fail('This release manifest is invalid.');
for (const [relative, expected] of Object.entries(manifest.files)) {
  if (isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..') || typeof expected !== 'string') fail('The release manifest contains an unsafe path.');
  const path = resolve(source, relative);
  if (!existsSync(path) || createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) fail(`Checksum failed for ${relative}. Download and extract the release again.`);
}
if (process.argv.includes('--verify-only')) { console.log(`Threadboard ${manifest.version}: all ${Object.keys(manifest.files).length} packaged files verified.`); process.exit(0); }

const codex = process.env.THREADBOARD_CODEX_COMMAND || 'codex';
const checked = spawnSync(codex, ['--version'], { encoding: 'utf8' });
if (checked.error || checked.status !== 0) fail('The Codex CLI is unavailable. Install the official Codex CLI, put it on your PATH, and rerun this installer.');
const base = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'Threadboard')
  : process.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Threadboard')
  : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'threadboard');
const target = process.env.THREADBOARD_INSTALL_DIR || join(base, 'marketplace');
if (!isAbsolute(target)) fail('THREADBOARD_INSTALL_DIR must be an absolute path.');
if (resolve(target) === resolve(source)) fail('The installation directory must differ from the downloaded package.');
if (existsSync(target) && !existsSync(join(target, 'threadboard-install.json'))) fail('The destination is not a marked Threadboard installation. Choose an empty directory with THREADBOARD_INSTALL_DIR.');

let runtime = process.execPath;
for (const folder of (process.env.PATH || '').split(delimiter)) {
  const candidate = join(folder, process.platform === 'win32' ? 'node.exe' : 'node');
  try { if (realpathSync(candidate) === realpathSync(process.execPath)) { runtime = candidate; break; } } catch { /* Not a matching executable. */ }
}
mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
const stage = `${target}.stage-${randomUUID()}`, backup = `${target}.previous-${randomUUID()}`;
mkdirSync(stage, { mode: 0o700 });
try {
  for (const relative of Object.keys(manifest.files)) {
    mkdirSync(dirname(join(stage, relative)), { recursive: true });
    cpSync(join(source, relative), join(stage, relative));
  }
  cpSync(manifestFile, join(stage, 'MANIFEST.json'));
  const configPath = join(stage, 'plugins', 'threadboard', '.mcp.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.mcpServers.threadboard.command = runtime;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  writeFileSync(join(stage, 'threadboard-install.json'), JSON.stringify({ version: manifest.version, runtime, installedAt: new Date().toISOString() }, null, 2) + '\n');
  if (existsSync(target)) renameSync(target, backup);
  renameSync(stage, target);
  for (const args of [['plugin','marketplace','add',target,'--json'], ['plugin','add','threadboard@threadboard-plugins','--json']]) {
    const result = spawnSync(codex, args, { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || 'The Codex plugin command failed.');
  }
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  console.log(`Threadboard ${manifest.version} installed. Reopen Codex and open Threadboard from your installed plugins.\nPlugin files: ${target}\nTask data is stored separately and survives plugin updates.`);
} catch (error) {
  if (existsSync(backup)) { if (existsSync(target)) rmSync(target, { recursive: true, force: true }); renameSync(backup, target); }
  fail(`Installation did not complete: ${error.message}\nYour task database was not changed. Resolve the CLI error and rerun the installer.`);
} finally { if (existsSync(stage)) rmSync(stage, { recursive: true, force: true }); }
