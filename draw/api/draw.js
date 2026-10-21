import { createRepository } from '../lib/database.js';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
const payments = ['pending', 'paid', 'awaiting', 'invoice-details'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A reservation is a starting hole plus an optional tee time, so one tee can send off several groups at different times.
export const slot = g => g.tee && (g.time ? `${g.tee}@${g.time}` : g.tee);
export function validate(x) {
  if (!x || typeof x.organisation !== 'string' || !x.organisation.trim() || x.organisation.length > 160) throw Error('Enter an organisation name (maximum 160 characters).');
  if (!Number.isInteger(x.bookings) || x.bookings < 1 || x.bookings > 8 || !Array.isArray(x.groups) || x.groups.length !== x.bookings) throw Error('Provide one to eight groups.');
  if (Object.hasOwn(x, 'payment') && !payments.includes(x.payment)) throw Error('Invalid payment status.');
  if (Object.hasOwn(x, 'notes') && (typeof x.notes !== 'string' || x.notes.length > 2000)) throw Error('Invalid notes.');
  if (Object.hasOwn(x, 'amount') && x.amount !== null && (typeof x.amount !== 'number' || !Number.isFinite(x.amount) || x.amount < 0 || x.amount > 100000000 || Math.abs(x.amount * 100 - Math.round(x.amount * 100)) > 0.00001)) throw Error('Enter a valid amount with up to two decimal places.');
  const used = new Set();
  const groups = x.groups.map(g => {
    if (!g || typeof g.tee !== 'string' || !Array.isArray(g.players) || g.players.length !== 4 || g.players.some(n => typeof n !== 'string' || n.length > 100)) throw Error('Every group needs four player slots.');
    const tee = g.tee.trim().toUpperCase();
    if (tee && !/^(?:[1-9]|1[0-8])[AB]?$/.test(tee)) throw Error('Use holes 1–18, optionally A or B.');
    const time = typeof g.time === 'string' ? g.time.trim() : '';
    if (g.time !== undefined && typeof g.time !== 'string') throw Error('Invalid tee time.');
    if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Enter tee times as HH:MM, for example 11:10.');
    if (time && !tee) throw Error('Add a starting hole before the tee time.');
    const key = slot({ tee, time });
    if (key && used.has(key)) throw Error('A tee assignment is used twice.');
    if (key) used.add(key);
    return { tee, time, players: g.players.map(n => n.trim()) };
  });
  return { organisation: x.organisation.trim(), bookings: x.bookings, groups, payment: x.payment ?? 'pending', amount: x.amount ?? null, notes: x.notes?.trim() ?? '' };
}
function equal(a, b) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
const passwords = env => [env.ADMIN_PASSWORD, env.ORGANISER_PASSWORD].filter(p => typeof p === 'string' && p.length >= 16 && p.length <= 200);
const fingerprint = (env, password = env.ADMIN_PASSWORD) => createHmac('sha256', env.SESSION_SECRET).update(password || '').digest('hex').slice(0, 24);
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const sign = (v, env) => createHmac('sha256', env.SESSION_SECRET).update(v).digest('hex');
function auth(req, env) {
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD) return false;
  const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('golf_session='))?.slice(13);
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [v, signature] = parts;
  const [expiry, nonce, passwordHash] = v.split(':');
  return !!nonce && !!signature && equal(sign(v, env), signature) && passwords(env).some(password => equal(passwordHash || '', fingerprint(env, password))) && Number(expiry) > Date.now();
}
export function createHandler(repositoryFactory = createRepository, options = {}) {
  const env = options.env || globalThis.process?.env || {};
  const attempts = new Map();
  const storage = options.storage || 'neon';
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const reply = (status, value) => res.status(status).json(value);
    // Vercel parses JSON lazily and throws on access when the body is malformed.
    const body = () => { try { return req.body; } catch { throw Object.assign(new Error('Invalid JSON body.'), { code: 'INVALID_JSON' }); } };
    const ready = !!((options.configured || env.DATABASE_URL) && env.ADMIN_PASSWORD?.length >= 16 && env.ADMIN_PASSWORD.length <= 200 && env.SESSION_SECRET?.length >= 32);
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action');
    const secure = env.VERCEL || env.COOKIE_SECURE === '1' ? '; Secure' : '';
    try {
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PUT, DELETE');
        return reply(405, { error: 'Method not allowed.' });
      }
      if (req.method !== 'GET') {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { return reply(403, { error: 'Request origin rejected.' }); }
        const host = env.VERCEL ? (req.headers['x-forwarded-host'] || req.headers.host) : req.headers.host;
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== host) return reply(403, { error: 'Request origin rejected.' });
      }
      if (action && !['session', 'health', 'login', 'logout', 'attend'].includes(action)) return reply(400, { error: 'Unknown action.' });
      if (action && ((['session', 'health'].includes(action) && req.method !== 'GET') || (['login', 'logout', 'attend'].includes(action) && req.method !== 'POST'))) return reply(405, { error: 'Method not allowed for this action.' });
      if (action === 'session') return reply(200, { authenticated: ready && auth(req, env), configured: ready, storage: ready ? storage : 'unconfigured' });
      if (action === 'logout') {
        res.setHeader('Set-Cookie', 'golf_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + secure);
        return reply(200, { ok: true });
      }
      if (!ready) return reply(503, { error: 'Live storage is not configured yet.', configured: false, ...(action === 'health' ? { checks: { database_url_present: !!env.DATABASE_URL, admin_password_valid: !!(env.ADMIN_PASSWORD?.length >= 16 && env.ADMIN_PASSWORD.length <= 200), session_secret_valid: !!(env.SESSION_SECRET?.length >= 32) } } : {}) });
      if (action === 'login') {
        // Per-process protection; use Vercel Firewall for distributed enforcement.
        const ip = env.VERCEL ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() : req.socket?.remoteAddress || 'local';
        const now = Date.now();
        for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
        const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
        if (attempt.count >= 5) {
          res.setHeader('Retry-After', String(Math.ceil((attempt.until - now) / 1000)));
          return reply(429, { error: 'Too many sign-in attempts. Please try again in 15 minutes.' });
        }
        const submitted = body()?.password;
        const matched = typeof submitted === 'string' && submitted.length <= 200
          ? passwords(env).find(password => equal(submitted, password)) : undefined;
        if (!matched) {
          attempt.count++; attempts.set(ip, attempt);
          return reply(401, { error: 'Incorrect password.' });
        }
        attempts.delete(ip);
        const v = `${now + SESSION_SECONDS * 1000}:${randomBytes(16).toString('hex')}:${fingerprint(env, matched)}`;
        res.setHeader('Set-Cookie', `golf_session=${v}.${sign(v, env)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`);
        return reply(200, { ok: true });
      }
      const admin = auth(req, env);
      if (req.method !== 'GET' && !admin) return reply(401, { error: 'Your session has ended. Please sign in again.' });
      const db = await repositoryFactory();
      if (action === 'health') {
        await db.list();
        return reply(200, { ok: true, storage, checked_at: new Date().toISOString() });
      }
      if (req.method === 'GET') {
        const rows = await db.list();
        res.setHeader('X-Draw-Storage', storage);
        return reply(200, admin ? rows : rows.map(({ id, organisation, bookings, groups }) => ({ id, organisation, bookings, groups: groups.map(({ tee, time = '', players }) => ({ tee, time, players })) })));
      }
      const id = url.searchParams.get('id');
      if (action === 'attend') {
        // Registration-desk tick. Atomic in storage and version-free, so organisers ticking side by side never overwrite each other.
        if (!UUID.test(id || '')) return reply(400, { error: 'Invalid entry ID.' });
        const { group, player, attended } = body() || {};
        if (!Number.isInteger(group) || group < 0 || group > 7 || !Number.isInteger(player) || player < 0 || player > 3 || typeof attended !== 'boolean') return reply(400, { error: 'Invalid attendance update.' });
        const row = await db.attend(id, group, player, attended);
        return reply(row ? 200 : 404, row || { error: 'Entry no longer exists.' });
      }
      if (req.method !== 'POST' && !UUID.test(id || '')) return reply(400, { error: 'Invalid entry ID.' });
      const version = body()?.updated_at ?? null;
      if (version !== null && (typeof version !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(version) || !Number.isFinite(Date.parse(version)))) return reply(400, { error: 'Invalid entry version.' });
      if (req.method === 'DELETE') {
        const removed = await db.remove(id, version);
        return reply(removed ? 200 : 404, removed ? { ok: true } : { error: 'Entry no longer exists.' });
      }
      let entry;
      try { entry = validate(body()); } catch (e) { return reply(400, { error: e.message }); }
      const rows = await db.list();
      if (req.method === 'PUT') {
        const existing = rows.find(row => row.id === id);
        if (!existing) return reply(404, { error: 'Entry no longer exists.' });
        if (body().payment === undefined) entry.payment = existing.payment;
        if (body().amount === undefined) entry.amount = existing.amount;
        if (body().notes === undefined) entry.notes = existing.notes;
        // The edit form sends tee, time and players only; attendance ticks stay with their golfer slot.
        entry.groups.forEach((g, i) => { if (existing.groups[i]?.attended) g.attended = existing.groups[i].attended; });
      }
      const tees = new Set(rows.filter(r => r.id !== id).flatMap(r => r.groups.map(slot)).filter(Boolean));
      if (entry.groups.some(g => g.tee && tees.has(slot(g)))) return reply(409, { error: 'That starting hole and tee time is already assigned to another group.' });
      const result = await db.save(entry, req.method === 'PUT' ? id : null, version);
      return reply(result ? (req.method === 'POST' ? 201 : 200) : 404, result || { error: 'Entry no longer exists.' });
    } catch (e) {
      if (e.code === 'INVALID_JSON') return reply(400, { error: 'Request body must be valid JSON.' });
      if (e.code === '23505') return reply(409, { error: 'That starting hole and tee time is already assigned to another group.' });
      if (e.code === 'STALE_ENTRY') return reply(409, { error: 'This entry was changed by another organiser. Refresh the dashboard and reopen it before saving.', code: 'STALE_ENTRY' });
      return reply(action === 'health' ? 503 : 500, { error: 'Unable to save or load the draw. Please try again.' });
    }
  };
}
export default createHandler();
