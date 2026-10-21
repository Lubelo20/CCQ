import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { slot } from '../api/draw.js';

// Local development only. Never use filesystem storage in a serverless deployment.
export function createLocalRepository(filename = path.resolve('.data/draw.sqlite')) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(`PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, organisation TEXT NOT NULL, bookings INTEGER NOT NULL,
      groups TEXT NOT NULL, payment TEXT NOT NULL, amount REAL, notes TEXT NOT NULL,
      updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tees (
      tee TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY);`);
  const normalize = row => row ? { ...row, groups: JSON.parse(row.groups) } : null;
  const select = db.prepare('SELECT * FROM entries WHERE id = ?');
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  function save(entry, id = null, expectedVersion = null) {
    return transaction(() => {
      const current = id ? select.get(id) : null;
      if (id && !current) return null;
      if (expectedVersion && current.updated_at !== expectedVersion) {
        throw Object.assign(new Error('stale entry'), { code: 'STALE_ENTRY' });
      }
      const key = id || randomUUID();
      const now = new Date(Math.max(Date.now(), current ? Date.parse(current.updated_at) + 1 : 0)).toISOString();
      const values = [entry.organisation, entry.bookings, JSON.stringify(entry.groups), entry.payment, entry.amount, entry.notes, now];
      if (id) db.prepare('UPDATE entries SET organisation=?,bookings=?,groups=?,payment=?,amount=?,notes=?,updated_at=? WHERE id=?').run(...values, key);
      else db.prepare('INSERT INTO entries (organisation,bookings,groups,payment,amount,notes,updated_at,id) VALUES (?,?,?,?,?,?,?,?)').run(...values, key);
      db.prepare('DELETE FROM tees WHERE entry_id=?').run(key);
      const reserve = db.prepare('INSERT INTO tees (tee,entry_id) VALUES (?,?)');
      try { for (const group of entry.groups) if (group.tee) reserve.run(slot(group), key); }
      catch (error) { if (error.message.includes('UNIQUE constraint failed')) error.code = '23505'; throw error; }
      return normalize(select.get(key));
    });
  }
  return {
    async list() { return db.prepare('SELECT * FROM entries ORDER BY organisation COLLATE NOCASE').all().map(normalize); },
    async save(entry, id, version) { return save(entry, id, version); },
    async attend(id, group, player, attended) {
      return transaction(() => {
        const current = normalize(select.get(id));
        if (!current || !current.groups[group]) return null;
        const marks = current.groups[group].attended || [false, false, false, false];
        marks[player] = attended;
        current.groups[group].attended = marks;
        db.prepare('UPDATE entries SET groups=? WHERE id=?').run(JSON.stringify(current.groups), id);
        return normalize(select.get(id));
      });
    },
    async remove(id, expectedVersion = null) {
      return transaction(() => {
        const current = select.get(id);
        if (!current) return false;
        if (expectedVersion && current.updated_at !== expectedVersion) throw Object.assign(new Error('stale entry'), { code: 'STALE_ENTRY' });
        return db.prepare('DELETE FROM entries WHERE id=?').run(id).changes > 0;
      });
    },
    seed(entries = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'))) {
      if (db.prepare('SELECT name FROM migrations WHERE name=?').get('initial-bookings-v1')) return;
      transaction(() => {
        const insert = db.prepare('INSERT OR IGNORE INTO entries (id,organisation,bookings,groups,payment,amount,notes,updated_at) VALUES (?,?,?,?,?,?,?,?)');
        for (const e of entries) {
          insert.run(e.id, e.organisation, e.bookings, JSON.stringify(e.groups), e.payment, e.amount, e.notes, new Date().toISOString());
          for (const g of e.groups) if (g.tee) db.prepare('INSERT INTO tees (tee,entry_id) VALUES (?,?)').run(slot(g), e.id);
        }
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run('initial-bookings-v1');
      });
    },
    close() { db.close(); }
  };
}
