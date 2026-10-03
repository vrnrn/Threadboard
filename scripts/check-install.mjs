import { mkdtempSync, rmSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const temporary = mkdtempSync(join(tmpdir(), 'threadboard-install-check-'));
const configDirectory = join(temporary, 'codex'), installed = join(temporary, 'marketplace'), data = join(temporary, 'data');
const env = { ...process.env, CODEX_HOME: configDirectory, THREADBOARD_INSTALL_DIR: installed, THREADBOARD_DATA_DIR: data };
const run = (command, args) => {
  const result = spawnSync(command, args, { env, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || result.stdout);
  return result.stdout;
};
const find = (directory, filename) => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? find(join(directory, entry.name), filename) : entry.name === filename ? [join(directory, entry.name)] : []);
let client;
const cachedTransport = () => {
  const cached = find(join(configDirectory, 'plugins', 'cache'), 'server.mjs');
  assert.equal(cached.length, 1, 'The installed cache must contain the bundled server.');
  const pluginRoot = dirname(dirname(cached[0]));
  const config = JSON.parse(readFileSync(join(pluginRoot, '.mcp.json'), 'utf8')).mcpServers.threadboard;
  assert.ok(isAbsolute(config.command), 'The installed server must use a discovered absolute Node executable.');
  return new StdioClientTransport({ command: config.command, args: config.args, cwd: join(pluginRoot, config.cwd), env, stderr: 'pipe' });
};
try {
  mkdirSync(configDirectory, { recursive: true }); mkdirSync(data);
  const sentinel = join(data, 'update-preserves-data.txt'); writeFileSync(sentinel, 'Task data stays outside the plugin cache.');
  const installer = join(root, 'release', `threadboard-${version}`, 'install.mjs');
  console.log(run(process.execPath, [installer]).split('\n')[0]);
  const transport = cachedTransport();
  client = new Client({ name: 'installed-package-check', version: '1.0' }); await client.connect(transport);
  const result = await client.callTool({ name: 'create_project', arguments: { name: 'Installed package', root: temporary } });
  assert.equal(result.isError, undefined);
  const projectId = result.structuredContent.project.id;
  const task = await client.callTool({ name: 'create_task', arguments: { projectId, title: 'Survive a plugin update', operationId: 'bf6d345e-e92e-4b02-a22e-4f6f201fd3dc' } });
  const taskId = task.structuredContent.task.id;
  await client.close(); client = undefined;
  console.log(run(process.execPath, [installer]).split('\n')[0]);
  assert.equal(readFileSync(sentinel, 'utf8'), 'Task data stays outside the plugin cache.');
  client = new Client({ name: 'update-package-check', version: '1.0' });
  await client.connect(cachedTransport());
  const restored = await client.callTool({ name: 'get_task', arguments: { projectId, taskId } });
  assert.equal(restored.structuredContent.task.title, 'Survive a plugin update');
  console.log('Clean Codex installation, cached MCP execution, reinstall, and task persistence passed.');
} finally { if (client) await client.close(); rmSync(temporary, { recursive: true, force: true }); }
