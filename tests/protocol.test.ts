import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { OpenAIUiResourceMetadataSchema, OpenAIUiToolMetadataSchema } from '@openai/mcp-extensions/server';
import { VERSION } from '../src/version.js';

test('compiled release initializes over stdio, serves its UI, and retains task data across connections', async () => {
  const data = mkdtempSync(join(tmpdir(), 'threadboard-protocol-'));
  const env = Object.fromEntries(Object.entries({ ...process.env, THREADBOARD_DATA_DIR: data }).filter((pair): pair is [string,string] => typeof pair[1] === 'string'));
  const createClient = async () => {
    const client = new Client({ name: 'release-check', version: '1.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', fileURLToPath(new URL('./deny-network.mjs', import.meta.url)), './dist/server.mjs'], cwd: fileURLToPath(new URL('../plugins/threadboard/', import.meta.url)), env, stderr: 'pipe' });
    await client.connect(transport); return client;
  };
  let client = await createClient();
  try {
    const tools = await client.listTools();
    assert.equal(client.getServerVersion()?.version, VERSION);
    assert.equal(tools.tools.length, 18);
    for (const tool of tools.tools) assert.equal(tool.inputSchema.additionalProperties, false);
    const open = tools.tools.find(t => t.name === 'open_project_board')!;
    assert.deepEqual((open._meta?.['openai/ui'] as any).entrypoints, [{type:'global'},{type:'thread'}]);
    assert.equal(open._meta?.['ui/resourceUri'], 'ui://threadboard/board');
    OpenAIUiToolMetadataSchema.parse(open._meta?.['openai/ui']);
    const unsupported = await client.callTool({ name: 'list_projects', arguments: { transcript: 'Must not be accepted' } });
    assert.equal(unsupported.isError, true, 'the transport must reject unsupported fields');
    const resources = await client.readResource({ uri: 'ui://threadboard/board' });
    assert.ok((resources.contents[0] as any).text.includes('<!doctype html>'));
    assert.equal((resources.contents[0] as any)._meta.ui.csp.connectDomains.length, 0);
    OpenAIUiResourceMetadataSchema.parse((resources.contents[0] as any)._meta['openai/ui']);
    const project = await client.callTool({ name: 'create_project', arguments: { name: 'Packaged workspace', root: data } });
    const projectId = (project.structuredContent as any).project.id;
    const rejected = await client.callTool({ name: 'create_task', arguments: { projectId, title: 'Must not be created', operationId: randomUUID(), transcript: 'Unsupported input' } });
    assert.equal(rejected.isError, true);
    const empty = await client.callTool({ name: 'get_board', arguments: { projectId } });
    assert.equal((empty.structuredContent as any).total, 0);
    const created = await client.callTool({ name: 'create_task', arguments: { projectId, title: 'Install without npm', operationId: randomUUID() } });
    assert.equal(created.isError, undefined);
    const taskId = (created.structuredContent as any).task.id;
    await client.close(); client = await createClient();
    const task = await client.callTool({ name: 'get_task', arguments: { projectId, taskId } });
    assert.equal((task.structuredContent as any).task.title, 'Install without npm');
    const stale = await client.callTool({ name: 'update_task', arguments: { projectId, taskId, version: 99, title: 'Do not overwrite' } });
    assert.equal(stale.isError, true); assert.equal((stale.structuredContent as any).error.code, 'VERSION_CONFLICT');
  } finally { await client.close(); rmSync(data, { recursive: true, force: true }); }
});
