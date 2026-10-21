import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalRepository } from '../lib/local-database.js';
import { createHandler, validate } from '../api/draw.js';
import { createServer } from '../dev.mjs';
import { Readable, Writable } from 'node:stream';

const entry = { organisation: 'Test organisation', bookings: 1, groups: [{ tee: '1A', players: ['Ada', 'Grace', 'Alan', 'Linus'] }], payment: 'paid', amount: 10000.25, notes: 'Private test note' };
Object.assign(process.env, { ADMIN_PASSWORD: 'a-local-test-password-123', SESSION_SECRET: 'a-local-test-secret-at-least-32-characters' });

test('SQLite transactions preserve entries, reject conflicts and release reservations', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'golf-test-'));
  const filename = path.join(dir, 'test.sqlite');
  let db = createLocalRepository(filename);
  try {
    db.seed([]);
    const first = await db.save(entry);
    const second = await db.save({ ...entry, organisation: 'Second', groups: [{ ...entry.groups[0], tee: '2B' }] });
    await assert.rejects(db.save({ ...entry, organisation: 'Conflict' }), { code: '23505' });
    assert.equal((await db.list()).length, 2);
    await assert.rejects(db.save({ ...second, groups: entry.groups }, second.id, second.updated_at), { code: '23505' });
    assert.equal((await db.list()).find(e => e.id === second.id).groups[0].tee, '2B');
    const updated = await db.save({ ...first, organisation: 'Updated' }, first.id, first.updated_at);
    assert.notEqual(first.updated_at, updated.updated_at);
    await assert.rejects(db.save(first, first.id, first.updated_at), { code: 'STALE_ENTRY' });
    await assert.rejects(db.remove(first.id, first.updated_at), { code: 'STALE_ENTRY' });
    db.close(); db = createLocalRepository(filename);
    assert.equal((await db.list()).length, 2);
    db.seed([{ ...entry, id: '00000000-0000-4000-8000-000000000003' }]);
    assert.equal((await db.list()).length, 2, 'seed does not recreate entries after initial import');
    await db.remove(first.id, updated.updated_at);
    await db.save(entry);
    assert.equal((await db.list()).length, 2, 'deleted tee becomes available');
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('HTTP request pipeline: login, CRUD, privacy, session rotation and failures', async () => {
  const db = createLocalRepository(':memory:');
  const handler = createHandler(() => db, { configured: true, storage: 'local' });
  const server = createServer(handler);
  const origin = 'http://127.0.0.1:3000';
  let cookie = '';
  const call = async (route = '/api/draw', method = 'GET', body, custom = {}) => {
    const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method; req.url = route; req.socket = { remoteAddress: '127.0.0.1' };
    const headers = { Host: '127.0.0.1:3000', ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...custom };
    req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const chunks = [], responseHeaders = new Headers();
    const res = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    res.statusCode = 200;
    res.setHeader = (key, value) => responseHeaders.set(key, value);
    res.writeHead = (status, values = {}) => { res.statusCode = status; for (const [k, v] of Object.entries(values)) res.setHeader(k, v); };
    const done = new Promise((resolve, reject) => { res.once('finish', resolve); res.once('error', reject); });
    server.emit('request', req, res); await done;
    return new Response(Buffer.concat(chunks), { status: res.statusCode, headers: responseHeaders });
  };
  try {
    assert.equal((await call('/')).status, 200);
    assert.equal((await call('/admin')).status, 200);
    assert.equal((await call('/api/draw-wrong')).status, 404);
    assert.equal((await call('/api/draw', 'POST', entry)).status, 401);
    assert.equal((await call('/api/draw', 'POST', entry, { Origin: 'bad origin' })).status, 403);
    assert.equal((await call('/api/draw', 'POST', '{')).status, 400);
    assert.equal((await call('/api/draw', 'POST', 'x'.repeat(21000))).status, 413);
    assert.equal((await call('/api/draw?action=unknown')).status, 400);
    assert.equal((await call('/api/draw?action=login')).status, 405);
    const health = await (await call('/api/draw?action=health')).json(); assert.equal(health.storage, 'local');
    const login = await call('/api/draw?action=login', 'POST', { password: process.env.ADMIN_PASSWORD });
    assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
    let response = await call('/api/draw', 'POST', entry); assert.equal(response.status, 201); const created = await response.json();
    response = await call(`/api/draw?id=${created.id}`, 'PUT', { organisation: 'Edited', bookings: entry.bookings, groups: entry.groups, updated_at: created.updated_at });
    assert.equal(response.status, 200); const updated = await response.json();
    assert.equal(updated.payment, entry.payment); assert.equal(updated.amount, entry.amount); assert.equal(updated.notes, entry.notes);
    assert.equal((await call(`/api/draw?id=${created.id}`, 'PUT', { ...entry, updated_at: created.updated_at })).status, 409);
    assert.equal((await call('/api/draw', 'POST', entry)).status, 409);
    const adminRows = await (await call()).json(); assert.equal(adminRows[0].notes, entry.notes);
    const savedCookie = cookie; cookie = '';
    const publicRows = await (await call()).json(); assert.deepEqual(Object.keys(publicRows[0]).sort(), ['bookings', 'groups', 'id', 'organisation']);
    cookie = savedCookie;
    assert.equal((await call(`/api/draw?id=${created.id}`, 'DELETE', { updated_at: created.updated_at })).status, 409);
    assert.equal((await call(`/api/draw?id=${created.id}`, 'DELETE', { updated_at: updated.updated_at })).status, 200);
    assert.equal((await call(`/api/draw?id=${created.id}`, 'DELETE', {})).status, 404);
    const originalPassword = process.env.ADMIN_PASSWORD; process.env.ADMIN_PASSWORD = 'different-local-password-123';
    assert.equal((await (await call('/api/draw?action=session')).json()).authenticated, false);
    process.env.ADMIN_PASSWORD = originalPassword;
    response = await call('/api/draw?action=logout', 'POST', {}); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    cookie = '';
    for (let i = 0; i < 5; i++) assert.equal((await call('/api/draw?action=login', 'POST', { password: 'wrong' })).status, 401);
    response = await call('/api/draw?action=login', 'POST', { password: originalPassword }); assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0);
  } finally { db.close(); }
});

test('validation normalizes input and rejects malformed or fractional data', () => {
  const result = validate({ ...entry, organisation: ' Example ', groups: [{ tee: ' 18b ', players: [' Ada ', '', '', ''] }] });
  assert.equal(result.groups[0].tee, '18B'); assert.equal(result.groups[0].players[0], 'Ada');
  for (const amount of [NaN, Infinity, -1, 1.234, '100', undefined]) assert.throws(() => validate({ ...entry, amount }));
  assert.throws(() => validate({ ...entry, groups: [null] }));
  assert.throws(() => validate({ ...entry, groups: [{ tee: '0', players: ['', '', '', ''] }] }));
  assert.throws(() => validate({ ...entry, groups: [{ tee: '', players: [42, '', '', ''] }] }));
});

test('health reports storage failure and configuration never implies connectivity', async () => {
  const env = { ADMIN_PASSWORD: 'test-password-at-least-16', SESSION_SECRET: 'test-session-secret-at-least-32-characters' };
  const handler = createHandler(() => ({ async list() { throw Error('private connection error'); } }), { configured: true, env, storage: 'local' });
  async function call(url, method = 'GET', body) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.data = v; } };
    await handler({ url, method, body, headers: { host: 'localhost', origin: 'http://localhost' } }, res); return res;
  }
  assert.equal((await call('/api/draw?action=session')).data.configured, true);
  const result = await call('/api/draw?action=health'); assert.equal(result.code, 503); assert.ok(!JSON.stringify(result.data).includes('private'));
  env.ADMIN_PASSWORD = 'too-short'; assert.equal((await call('/api/draw?action=session')).data.configured, false);
  env.ADMIN_PASSWORD = 'x'.repeat(201); assert.equal((await call('/api/draw?action=session')).data.configured, false);
});

test('HTTPS session cookies are secure and invalidated by signing-secret rotation', async () => {
  const env = { ADMIN_PASSWORD: 'test-password-at-least-16', SESSION_SECRET: 'test-session-secret-at-least-32-characters', COOKIE_SECURE: '1' };
  const handler = createHandler(() => ({ async list() { return []; } }), { configured: true, env });
  async function call(url, method = 'GET', body = {}, cookie = '') {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.data = v; } };
    await handler({ url, method, body, headers: { host: 'localhost', origin: 'https://localhost', cookie } }, res); return res;
  }
  const login = await call('/api/draw?action=login', 'POST', { password: env.ADMIN_PASSWORD });
  assert.match(login.headers['Set-Cookie'], /; Secure$/);
  assert.match(login.headers['Set-Cookie'], /Max-Age=2592000/);
  const expiry = Number(login.headers['Set-Cookie'].split('=')[1].split(':')[0]);
  assert.ok(expiry > Date.now() + 29 * 24 * 60 * 60 * 1000);
  assert.ok(expiry <= Date.now() + 30 * 24 * 60 * 60 * 1000);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call('/api/draw?action=session', 'GET', {}, cookie)).data.authenticated, true);
  env.SESSION_SECRET = 'another-test-session-secret-at-least-32';
  assert.equal((await call('/api/draw?action=session', 'GET', {}, cookie)).data.authenticated, false);
});
