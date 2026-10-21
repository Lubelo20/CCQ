import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/draw.js';

// On Vercel, reading req.body throws when the request carries invalid JSON.
test('malformed JSON bodies return 400 instead of a server error', async () => {
  const env = { DATABASE_URL: 'test', ADMIN_PASSWORD: 'development-password-123', SESSION_SECRET: 'test-session-secret-at-least-32-characters' };
  let saved = false;
  const handler = createHandler(() => ({ list: async () => [], save: async () => { saved = true; } }), { env });
  const call = async (query, cookie = '', body) => {
    const req = { method: 'POST', url: '/api/draw' + query, headers: { host: 'localhost', origin: 'http://localhost', cookie } };
    if (body === undefined) Object.defineProperty(req, 'body', { get() { throw new SyntaxError('Unexpected end of JSON input'); } });
    else req.body = body;
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler(req, res);
    return res;
  };
  const login = await call('?action=login');
  assert.equal(login.code, 400);
  assert.match(login.data.error, /valid JSON/);
  const cookie = (await call('?action=login', '', { password: env.ADMIN_PASSWORD })).headers['Set-Cookie'].split(';')[0];
  const create = await call('', cookie);
  assert.equal(create.code, 400);
  assert.match(create.data.error, /valid JSON/);
  assert.equal((await call('')).code, 401, 'unauthenticated requests are still rejected before the body is read');
  assert.equal(saved, false);
});
