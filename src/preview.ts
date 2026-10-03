import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Store } from './store.js';
import { invoke } from './api.js';
import { BoardError } from './types.js';

const store = new Store();
const secret = randomBytes(32).toString('hex');
const port = Number(process.env.THREADBOARD_PREVIEW_PORT || 4388);
const origin = `http://127.0.0.1:${port}`;
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403).end(); return; }
  if (request.method === 'GET' && request.url === '/') {
    const html = readFileSync(new URL('../plugins/threadboard/dist/board.html', import.meta.url), 'utf8');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html.replace('<head>', `<head><script>window.__THREADBOARD_PREVIEW__=${JSON.stringify(secret)}</script>`)); return;
  }
  if (request.url !== '/api' || request.method !== 'POST' || request.headers.authorization !== `Bearer ${secret}` || (request.headers.origin && request.headers.origin !== origin)) {
    response.writeHead(403).end(); return;
  }
  try {
    let body = '';
    for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 100_000) { response.writeHead(413).end(); return; } }
    const { name, args } = JSON.parse(body);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: invoke(store, name, args) }));
  } catch (error) {
    const message = error instanceof BoardError ? error.message : 'Check the action fields and try again.';
    response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message, code: error instanceof BoardError ? error.code : 'INVALID_INPUT' } }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Threadboard development preview: ${origin}`));
const close = () => server.close(() => { store.close(); process.exit(0); });
process.on('SIGTERM', close); process.on('SIGINT', close);
