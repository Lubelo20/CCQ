import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/draw.js';
import { createLocalRepository } from '../lib/local-database.js';

const env = { ADMIN_PASSWORD: 'test-dashboard-password', SESSION_SECRET: 'test-signing-secret-with-at-least-32-chars' };
const booking = { organisation: 'Attendance club', bookings: 2, groups: [{ tee: '1', players: ['Ada', 'Grace', 'Alan', ''] }, { tee: '', players: ['Linus', '', '', ''] }], payment: 'paid', amount: null, notes: '' };

test('attendance: organisers tick golfers, edits keep the ticks and the public draw never shows them', async () => {
  const db = createLocalRepository(':memory:');
  try {
    const handler = createHandler(() => db, { configured: true, env });
    async function call(method, body, query = '', cookie = '') {
      const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
      await handler({ method, url: '/api/draw' + query, body, headers: { host: 'localhost', origin: 'http://localhost', cookie } }, res);
      return res;
    }
    const cookie = (await call('POST', { password: env.ADMIN_PASSWORD }, '?action=login')).headers['Set-Cookie'].split(';')[0];
    const { id, updated_at } = (await call('POST', booking, '', cookie)).data;
    const attend = (body, who = cookie, target = id) => call('POST', body, '?action=attend&id=' + target, who);

    assert.equal((await attend({ group: 0, player: 1, attended: true }, '')).code, 401, 'signed-out visitors cannot tick');
    for (const bad of [{ group: 0, player: 4, attended: true }, { group: -1, player: 0, attended: true }, { group: 0, player: 0, attended: 'yes' }, { group: 0.5, player: 0, attended: true }, {}]) assert.equal((await attend(bad)).code, 400);
    assert.equal((await attend({ group: 2, player: 0, attended: true })).code, 404, 'group must exist on the booking');
    assert.equal((await attend({ group: 0, player: 0, attended: true }, cookie, '00000000-0000-4000-8000-00000000000f')).code, 404);
    assert.equal((await attend({ group: 0, player: 0, attended: true }, cookie, 'not-an-id')).code, 400);
    assert.equal((await call('GET', undefined, '?action=attend&id=' + id, cookie)).code, 405);

    const ticked = await attend({ group: 0, player: 1, attended: true });
    assert.equal(ticked.code, 200);
    assert.deepEqual(ticked.data.groups[0].attended, [false, true, false, false]);
    assert.equal(ticked.data.updated_at, updated_at, 'ticking does not invalidate an editor another organiser has open');
    await attend({ group: 1, player: 0, attended: true });
    await attend({ group: 0, player: 2, attended: true });
    const unticked = await attend({ group: 0, player: 2, attended: false });
    assert.deepEqual(unticked.data.groups.map(g => g.attended), [[false, true, false, false], [true, false, false, false]]);
    assert.equal(unticked.data.groups[0].tee, '1'); assert.deepEqual(unticked.data.groups[0].players, booking.groups[0].players);

    // The edit form sends tee and players only; a name correction must not lose the tick.
    const edited = await call('PUT', { organisation: booking.organisation, bookings: 2, groups: [{ tee: '1', players: ['Ada', 'Grace Hopper', 'Alan', 'Ken'] }, booking.groups[1]], updated_at }, '?id=' + id, cookie);
    assert.equal(edited.code, 200);
    assert.deepEqual(edited.data.groups.map(g => g.attended), [[false, true, false, false], [true, false, false, false]]);
    const shrunk = await call('PUT', { organisation: booking.organisation, bookings: 1, groups: [edited.data.groups[0]] }, '?id=' + id, cookie);
    assert.deepEqual(shrunk.data.groups.map(g => g.attended), [[false, true, false, false]]);

    const open = await call('GET');
    assert.deepEqual(open.data[0].groups, [{ tee: '1', time: '', players: ['Ada', 'Grace Hopper', 'Alan', 'Ken'] }], 'public draw exposes no attendance');
    assert.deepEqual((await call('GET', undefined, '', cookie)).data[0].groups[0].attended, [false, true, false, false]);
  } finally { db.close(); }
});
