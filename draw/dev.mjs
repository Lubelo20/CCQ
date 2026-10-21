import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './api/draw.js';
import { createRepository } from './lib/database.js';
import { setupLocal } from './scripts/setup-local.mjs';

const root = fileURLToPath(new URL('./public', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
export function createServer(handler) {
  return http.createServer(async (req, res) => {
    for (const [key, value] of Object.entries(security)) res.setHeader(key, value);
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/draw') {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 20000) { json(413, { error: 'Request is too large.' }); return; }
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString('utf8');
        if (body && !req.headers['content-type']?.startsWith('application/json')) { json(415, { error: 'Send JSON content.' }); return; }
        try { req.body = body ? JSON.parse(body) : {}; }
        catch { json(400, { error: 'Invalid JSON.' }); return; }
        res.status = n => (res.statusCode = n, res);
        res.json = v => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); };
        await handler(req, res);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { json(405, { error: 'Method not allowed.' }); return; }
      const name = decodeURIComponent(url.pathname);
      const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name === '/admin' ? '/admin.html' : name === '/info' || name === '/info/' ? '/info/index.html' : name));
      if (!file.startsWith(root + path.sep)) { json(403, { error: 'Forbidden.' }); return; }
      const data = await readFile(file);
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { json(404, { error: 'Not found.' }); }
  });
}

async function start() {
  await setupLocal();
  try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const local = process.env.STORAGE === 'local' && !process.env.VERCEL;
  let repository;
  if (local) {
    const { createLocalRepository } = await import('./lib/local-database.js');
    repository = createLocalRepository(process.env.LOCAL_DATABASE_PATH || undefined);
    repository.seed();
  }
  const handler = createHandler(local ? () => repository : createRepository, { configured: local, storage: local ? 'local' : 'neon' });
  const server = createServer(handler);
  server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
    console.log(`Golf day: http://localhost:${server.address().port}`);
    console.log(local ? 'Persistent local database enabled. Find your organiser password in .env.local (ADMIN_PASSWORD).' : 'Neon storage selected. Check connection from the organiser dashboard.');
  });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port is in use. Set PORT in .env.local to another port.' : 'Unable to start the server.'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { repository?.close(); process.exit(0); }));
}
if (typeof process !== 'undefined' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start().catch(() => { console.error('Startup failed. Check your .env.local configuration and Node version (22.13 or later).'); process.exitCode = 1; });
