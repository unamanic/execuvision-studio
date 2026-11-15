#!/usr/bin/env node
// A localhost-only static preview of the built output.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, extname } from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 8000);
const base = process.env.BASE_PATH || '/';
if (!base.startsWith('/') || !base.endsWith('/') || /[?#\\]|\.\./.test(base))
  throw Error('BASE_PATH must be a path such as /execuvision-studio/');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (base !== '/' && (name === '/' || name === base.slice(0, -1))) {
      response.writeHead(302, { Location: base }).end();
      return;
    }
    if (!name.startsWith(base)) {
      response.writeHead(404).end();
      return;
    }
    name = name.slice(base.length);
    if (!name || name.endsWith('/')) name += 'index.html';
    const path = resolve(root, name),
      inside = relative(root, path);
    if (inside.startsWith('..') || isAbsolute(inside)) {
      response.writeHead(403).end();
      return;
    }
    const data = await readFile(path);
    response.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Preview: http://127.0.0.1:${server.address().port}${base}`),
);
