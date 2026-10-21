import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/draw.js';

test('dashboard POST defaults private fields and PUT preserves them when omitted', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const existing = { id, organisation: 'Existing', bookings: 1, groups: [{ tee: '', players: ['', '', '', ''] }], payment: 'paid', amount: 12500, notes: 'Keep this private note' };
  const handler = createHandler(() => ({ list: async () => [existing], save: async entry => ({ ...entry, id }) }), { configured: true, env: { ADMIN_PASSWORD: 'test-dashboard-password', SESSION_SECRET: 'test-signing-secret-with-at-least-32-chars' } });
  async function call(method, body, query = '', cookie = '') {
    const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await handler({ method, url: '/api/draw' + query, body, headers: { host: 'localhost', origin: 'http://localhost', cookie } }, res);
    return res;
  }
  const login = await call('POST', { password: 'test-dashboard-password' }, '?action=login');
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  const payload = { organisation: 'Dashboard booking', bookings: 1, groups: existing.groups };
  const created = await call('POST', payload, '', cookie);
  assert.equal(created.code, 201);
  assert.equal(created.data.payment, 'pending'); assert.equal(created.data.amount, null); assert.equal(created.data.notes, '');
  const updated = await call('PUT', payload, '?id=' + id, cookie);
  assert.equal(updated.code, 200);
  for (const field of ['payment', 'amount', 'notes']) assert.equal(updated.data[field], existing[field]);
  for (const invalid of [{ payment: 'invalid' }, { notes: 123 }, { amount: -1 }]) assert.equal((await call('PUT', { ...payload, ...invalid }, '?id=' + id, cookie)).code, 400);
});
