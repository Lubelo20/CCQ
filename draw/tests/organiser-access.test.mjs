import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/draw.js';

test('separate organiser password and independent session revocation', async () => {
  const env = { DATABASE_URL: 'test', ADMIN_PASSWORD: 'development-password-123', ORGANISER_PASSWORD: 'organiser-password-456', SESSION_SECRET: 'test-session-secret-at-least-32-characters' };
  const handler = createHandler(() => ({ list: async () => [] }), { env });
  const call = async (action, password, cookie = '') => {
    const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, json(data) { this.data=data; return this; } };
    await handler({ method: action === 'login' ? 'POST' : 'GET', url: '/api/draw?action='+action, headers: { host:'localhost', origin:'http://localhost', cookie }, body:{ password } }, res);
    return res;
  };
  const login = async password => {
    const res = await call('login', password); assert.equal(res.code, 200);
    return res.headers['Set-Cookie'].split(';')[0];
  };
  const developer = await login(env.ADMIN_PASSWORD), organiser = await login(env.ORGANISER_PASSWORD);
  assert.equal((await call('session', undefined, developer)).data.authenticated, true);
  assert.equal((await call('session', undefined, organiser)).data.authenticated, true);
  assert.equal((await call('session', undefined, organiser+'tampered')).data.authenticated, false);
  env.ORGANISER_PASSWORD = 'replacement-organiser-password-789';
  assert.equal((await call('session', undefined, organiser)).data.authenticated, false);
  assert.equal((await call('session', undefined, developer)).data.authenticated, true);
  assert.equal((await call('login', 'organiser-password-456')).code, 401);
  const replacement = await login(env.ORGANISER_PASSWORD);
  delete env.ORGANISER_PASSWORD;
  assert.equal((await call('session', undefined, replacement)).data.authenticated, false);
  assert.equal((await call('session', undefined, developer)).data.authenticated, true);
  env.ORGANISER_PASSWORD = 'short';
  assert.equal((await call('login', 'short')).code, 401);
  assert.equal((await call('login', '')).code, 401);
});
