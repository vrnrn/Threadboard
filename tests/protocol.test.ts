import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { OpenAIUiResourceMetadataSchema, OpenAIUiToolMetadataSchema } from '@openai/mcp-extensions/server';
import { VERSION } from '../src/version.js';
import { nativeProject, writeNativeProjects } from './native-fixture.js';

test('compiled release initializes over stdio, serves its UI, and retains task data across connections', async () => {
  const data = mkdtempSync(join(tmpdir(), 'threadboard-protocol-'));
  const codexHome = join(data, 'codex');
  const native = nativeProject('Packaged workspace', data);
  writeNativeProjects(codexHome, [native]);
  const env = Object.fromEntries(Object.entries({ ...process.env, THREADBOARD_DATA_DIR: data, THREADBOARD_CODEX_HOME: codexHome }).filter((pair): pair is [string,string] => typeof pair[1] === 'string'));
  const createClient = async () => {
    const client = new Client({ name: 'release-check', version: '1.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', fileURLToPath(new URL('./deny-network.mjs', import.meta.url)), './dist/server.mjs'], cwd: fileURLToPath(new URL('../plugins/threadboard/', import.meta.url)), env, stderr: 'pipe' });
    await client.connect(transport); return client;
  };
  let client = await createClient();
  try {
    const tools = await client.listTools();
    assert.equal(client.getServerVersion()?.version, VERSION);
    assert.equal(tools.tools.length, 22);
    assert.deepEqual((tools.tools.find(tool => tool.name === 'get_board_revision')!._meta?.ui as any).visibility, ['app']);
    assert.equal(tools.tools.some(t => t.name === 'create_project'), false);
    for (const tool of tools.tools) assert.equal(tool.inputSchema.additionalProperties, false);
    const open = tools.tools.find(t => t.name === 'open_project_board')!;
    assert.deepEqual(open.icons?.map(icon => icon.theme), ['light', 'dark']);
    assert.deepEqual(client.getServerVersion()?.icons, open.icons);
    for (const icon of open.icons!) {
      assert.equal(icon.mimeType, 'image/svg+xml');
      assert.ok(icon.src.startsWith('data:image/svg+xml;base64,'), 'Sidebar icons must work offline.');
      const asset = readFileSync(new URL(`../plugins/threadboard/assets/icon${icon.theme === 'dark' ? '-dark' : ''}.svg`, import.meta.url), 'utf8');
      assert.equal(Buffer.from(icon.src.split(',')[1], 'base64').toString('utf8'), asset);
      assert.ok(asset.includes('viewBox="0 0 64 64"'));
    }
    assert.deepEqual((open._meta?.['openai/ui'] as any).entrypoints, [{type:'global'},{type:'thread'}]);
    const uri = open._meta?.['ui/resourceUri'] as string;
    assert.ok(uri.startsWith(`ui://threadboard/board/${VERSION}/`));
    assert.equal((open._meta?.ui as any).resourceUri, uri);
    OpenAIUiToolMetadataSchema.parse(open._meta?.['openai/ui']);
    const unsupported = await client.callTool({ name: 'list_projects', arguments: { transcript: 'Must not be accepted' } });
    assert.equal(unsupported.isError, true, 'the transport must reject unsupported fields');
    const resources = await client.readResource({ uri });
    assert.ok((resources.contents[0] as any).text.includes('<!doctype html>'));
    assert.equal((resources.contents[0] as any)._meta.ui.csp.connectDomains.length, 0);
    OpenAIUiResourceMetadataSchema.parse((resources.contents[0] as any)._meta['openai/ui']);
    const projects = await client.callTool({ name: 'list_projects', arguments: {} });
    const checkpoint = await client.callTool({ name: 'get_board_revision', arguments: {} });
    assert.deepEqual(Object.keys(checkpoint.structuredContent!), ['revision']);
    const projectId = (projects.structuredContent as any).projects[0].id;
    assert.equal(projectId, native.id);
    const rejected = await client.callTool({ name: 'create_task', arguments: { projectId, title: 'Must not be created', operationId: randomUUID(), transcript: 'Unsupported input' } });
    assert.equal(rejected.isError, true);
    const empty = await client.callTool({ name: 'get_board', arguments: { projectId } });
    assert.equal((empty.structuredContent as any).total, 0);
    const created = await client.callTool({ name: 'create_task', arguments: { projectId, title: 'Install without npm', operationId: randomUUID() } });
    const changed = await client.callTool({ name: 'get_board_revision', arguments: {} });
    assert.notEqual((changed.structuredContent as any).revision, (checkpoint.structuredContent as any).revision);
    assert.equal(created.isError, undefined);
    const taskId = (created.structuredContent as any).task.id;
    const writer = await createClient();
    try {
      const before = await client.callTool({ name: 'get_board_revision', arguments: {} });
      const claim = await writer.callTool({ name: 'claim_task', arguments: { projectId, taskId, version: 1, attemptId: randomUUID(), token: randomUUID() + randomUUID(), owner: 'Independent server chat' } });
      assert.equal(claim.isError, undefined);
      const after = await client.callTool({ name: 'get_board_revision', arguments: {} });
      assert.notEqual((after.structuredContent as any).revision, (before.structuredContent as any).revision);
      const board = await client.callTool({ name: 'get_board', arguments: { projectId } });
      assert.equal((board.structuredContent as any).tasks[0].status, 'in_progress');
    } finally { await writer.close(); }
    await client.close(); client = await createClient();
    const task = await client.callTool({ name: 'get_task', arguments: { projectId, taskId } });
    assert.equal((task.structuredContent as any).task.title, 'Install without npm');
    const stale = await client.callTool({ name: 'update_task', arguments: { projectId, taskId, version: 99, title: 'Do not overwrite' } });
    assert.equal(stale.isError, true); assert.equal((stale.structuredContent as any).error.code, 'VERSION_CONFLICT');
  } finally { await client.close(); rmSync(data, { recursive: true, force: true }); }
});

test('rebuilding UI under the same plugin version changes its advertised resource identity', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadboard-resource-update-'));
  const plugin = join(directory, 'plugin');
  cpSync(fileURLToPath(new URL('../plugins/threadboard/dist/', import.meta.url)), plugin, { recursive: true });
  const htmlFile = join(plugin, 'board.html');
  const initialHtml = readFileSync(htmlFile, 'utf8');
  const running = new Client({ name: 'running-resource-update-check', version: '1.0' });
  const readUi = async (cachedUri?: string) => {
    const client = new Client({ name: 'resource-update-check', version: '1.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: ['server.mjs'], cwd: plugin,
      env: { ...process.env, THREADBOARD_DATA_DIR: join(directory, 'data') }, stderr: 'pipe' });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const uri = tools.tools.find(t => t.name === 'open_project_board')!._meta!['ui/resourceUri'] as string;
      const resource = await client.readResource({ uri });
      if (cachedUri) {
        const cached = await client.readResource({ uri: cachedUri });
        assert.equal(cached.contents[0].uri, cachedUri);
        assert.equal((cached.contents[0] as any).text, (resource.contents[0] as any).text);
        assert.equal(cached.contents[0].mimeType, 'text/html;profile=mcp-app');
        assert.deepEqual((cached.contents[0] as any)._meta, (resource.contents[0] as any)._meta);
      }
      return { uri, html: (resource.contents[0] as any).text, version: client.getServerVersion()!.version };
    } finally { await client.close(); }
  };
  try {
    await running.connect(new StdioClientTransport({ command: process.execPath, args: ['server.mjs'], cwd: plugin,
      env: { ...process.env, THREADBOARD_DATA_DIR: join(directory, 'data') }, stderr: 'pipe' }));
    const before = await readUi();
    const updatedHtml = initialHtml + '\n<!-- Updated preview fixture -->';
    writeFileSync(htmlFile, updatedHtml);
    const after = await readUi(before.uri);
    assert.equal(before.version, after.version);
    assert.notEqual(before.uri, after.uri, 'An updated UI must not reuse the cached resource address');
    assert.equal(before.html, initialHtml);
    assert.equal(after.html, updatedHtml);
    // Discovery can use the rebuilt server while a panel reads through a
    // previously running connection. Its own UI must still open successfully.
    const oldConnection = await running.readResource({ uri: after.uri });
    assert.equal(oldConnection.contents[0].uri, after.uri);
    assert.equal((oldConnection.contents[0] as any).text, before.html);
  } finally { await running.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('cached board URLs from other releases resolve without accepting unrelated or malformed resources', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'threadboard-cached-resources-'));
  const client = new Client({ name: 'cached-resource-check', version: '1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['./dist/server.mjs'], cwd: fileURLToPath(new URL('../plugins/threadboard/', import.meta.url)),
    env: { ...process.env, THREADBOARD_DATA_DIR: directory }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const canonical = tools.tools.find(t => t.name === 'open_project_board')!._meta!['ui/resourceUri'] as string;
    const current = await client.readResource({ uri: canonical });
    const templates = await client.listResourceTemplates();
    assert.ok(templates.resourceTemplates.some(template => template.uriTemplate === 'ui://threadboard/board/{version}/{fingerprint}'));
    for (const uri of ['ui://threadboard/board/0.1.4-dev.2/b4c8a09e97391efb', 'ui://threadboard/board/0.1.4-dev.4/c263f66c779209bc', 'ui://threadboard/board/9.0.0/0123456789abcdef']) {
      const result = await client.readResource({ uri });
      assert.equal(result.contents[0].uri, uri);
      assert.equal((result.contents[0] as any).text, (current.contents[0] as any).text);
      assert.deepEqual((result.contents[0] as any)._meta, (current.contents[0] as any)._meta);
    }
    for (const uri of ['ui://other-app/board/0.1.4-dev.4/c263f66c779209bc', 'ui://threadboard/private/0.1.4-dev.4/c263f66c779209bc', 'ui://threadboard/board/bad-version/c263f66c779209bc', 'ui://threadboard/board/0.1.4-dev.4/not-a-fingerprint', 'file:///etc/passwd']) {
      await assert.rejects(client.readResource({ uri }), /not found/);
    }
  } finally { await client.close(); rmSync(directory, { recursive: true, force: true }); }
});
