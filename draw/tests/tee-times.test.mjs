import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRepository } from '../lib/local-database.js';
import { validate } from '../api/draw.js';

const group = (tee, time, name = '') => ({ tee, time, players: [name, '', '', ''] });
const entry = (organisation, ...groups) => ({ organisation, bookings: groups.length, groups, payment: 'pending', amount: null, notes: '' });

test('tee times are validated and optional', () => {
  assert.equal(validate(entry('A', group('10', '11:20'))).groups[0].time, '11:20');
  assert.equal(validate(entry('A', { tee: '1', players: ['', '', '', ''] })).groups[0].time, '', 'older clients may omit the time');
  for (const time of ['11.20', '25:00', '1120', 11]) assert.throws(() => validate(entry('A', group('1', time))));
  assert.throws(() => validate(entry('A', group('', '11:00'))), /starting hole/);
  assert.throws(() => validate(entry('A', group('1', '11:00'), group('1', '11:00'))), /used twice/);
  assert.equal(validate(entry('A', group('1', '11:00'), group('1', '11:10'))).groups.length, 2);
});

test('SQLite lets one tee send off groups at different times but not the same time', async () => {
  const db = createLocalRepository(':memory:');
  try {
    await db.save(validate(entry('First', group('1', '11:00'))));
    await db.save(validate(entry('Second', group('1', '11:10'))));
    await db.save(validate(entry('Untimed', group('1', ''))));
    await assert.rejects(db.save(validate(entry('Clash', group('1', '11:10')))), { code: '23505' });
    assert.deepEqual((await db.list()).map(e => e.groups[0].time).sort(), ['', '11:00', '11:10']);
  } finally { db.close(); }
});
