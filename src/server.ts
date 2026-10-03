import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppResource, RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';
import type { OpenAIUiResourceMetadata, OpenAIUiToolMetadata } from '@openai/mcp-extensions/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { definitions, invoke, type ToolName } from './api.js';
import { Store } from './store.js';
import { BoardError } from './types.js';
import { VERSION } from './version.js';

process.umask(0o077);
const store = new Store();
const server = new McpServer({ name: 'threadboard', version: VERSION });
const uri = 'ui://threadboard/board';
const html = readFileSync(fileURLToPath(new URL('./board.html', import.meta.url)), 'utf8');
const resourceMetadata = { preferredDisplayMode: 'fullscreen', availableDisplayModes: ['fullscreen','inline'] } satisfies OpenAIUiResourceMetadata;
const toolMetadata = { entrypoints: [{ type: 'global' }, { type: 'thread' }], preferredModelDisplayMode: 'fullscreen' } satisfies OpenAIUiToolMetadata;

registerAppResource(server, 'threadboard-board', uri, {}, async () => ({
  contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: {
    ui: { csp: { connectDomains: [], resourceDomains: [] } },
    'openai/ui': resourceMetadata,
  } }],
}));

function modelData(name: string, data: any): Record<string, unknown> {
  if (name === 'open_project_board') return { projects: data.projects, projectId: data.board?.project.id || null, totalTasks: data.board?.total || 0, version: data.version };
  if (name === 'get_board') return { project: data.project, total: data.total, nextOffset: data.nextOffset, counts: data.counts,
    tasks: data.tasks.map((t: any) => ({ id: t.id, number: t.number, title: t.title, status: t.status, priority: t.priority, version: t.version, owner: t.run?.owner || null })) };
  return data;
}
for (const name of Object.keys(definitions) as ToolName[]) {
  const def = definitions[name];
  const config = {
    title: def.title, description: def.description, inputSchema: def.schema,
    annotations: { readOnlyHint: def.readOnly, destructiveHint: false, idempotentHint: def.readOnly || ['create_task','claim_task','prepare_task_launch','bind_task_run'].includes(name), openWorldHint: false },
    ...(name === 'open_project_board' ? { _meta: {
      ui: { resourceUri: uri, visibility: ['app','model'] as ('app'|'model')[] },
      [RESOURCE_URI_META_KEY]: uri,
      'openai/ui': toolMetadata,
    } } : { _meta: { ui: { visibility: ['app','model'] as ('app'|'model')[] } } }),
  };
  const handler = async (args: any) => {
    try {
      const data = invoke(store, name, args);
      const projected = modelData(name, data);
      return { content: [{ type: 'text' as const, text: JSON.stringify(projected) }], structuredContent: projected, _meta: { threadboard: data } };
    } catch (error) {
      const code = error instanceof BoardError ? error.code : error instanceof z.ZodError ? 'INVALID_INPUT' : 'STORAGE_ERROR';
      const message = error instanceof BoardError ? error.message : error instanceof z.ZodError ? 'Check the required fields and supported values for this action.' : 'The local board could not save this action. Your data has been preserved; retry or inspect local runtime permissions.';
      return { isError: true, content: [{ type: 'text' as const, text: `${code}: ${message}` }], structuredContent: { error: { code, message } } };
    }
  };
  server.registerTool(name, config, handler);
}

const transport = new StdioServerTransport();
await server.connect(transport);
const cleanup = () => { store.close(); process.exit(0); };
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.stdin.on('end', cleanup);
