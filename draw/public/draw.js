import { $, byStart, el, request, stats, time, toast } from './ui.js';
import { logo } from './logos.js';
let entries = [], filter = 'all', loading = false, source = 'preview';
function groups() {
  return entries.flatMap(e => e.groups.map((g, i) => ({ ...g, organisation: e.organisation, index: i + 1, total: e.bookings })));
}
function setFilter(value) {
  filter = value;
  document.querySelectorAll('[data-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === value);
    b.setAttribute('aria-pressed', String(b.dataset.filter === value));
  });
  render();
}
function render() {
  const all = groups(), assigned = all.filter(g => g.tee).length;
  const named = all.reduce((n, g) => n + g.players.filter(Boolean).length, 0);
  const q = $('#search').value.trim().toLowerCase();
  const visible = all.filter(g => (filter === 'all' || (filter === 'assigned' ? !!g.tee : !g.tee)) && `${g.organisation} ${g.tee} ${g.time || ''} ${g.players.join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => byStart(a, b) || a.organisation.localeCompare(b.organisation));
  stats('#stats', [[entries.length, 'Organisations', 'Joining us on the green'], [all.length, 'Booked groups', 'Four golfers per group'], [assigned, 'Starting holes assigned', `${all.length - assigned} awaiting allocation`], [named, 'Named golfers', `${all.length * 4} available player slots`]]);
  $('#count-all').textContent = all.length; $('#count-assigned').textContent = assigned; $('#count-pending').textContent = all.length - assigned;
  $('#results').textContent = `Showing ${visible.length} of ${all.length} groups`;
  $('#groups').replaceChildren(...visible.map(g => {
    const card = el('article', '', 'card'), head = el('div', '', 'card-head'), tee = el('div', '', 'tee');
    const when = el('div', '', 'tee-when');
    when.append(el('span', g.tee ? (g.time ? 'Tee off' : 'Starting hole') : 'Awaiting hole'));
    if (g.tee && g.time) when.append(el('b', g.time));
    tee.append(el('strong', g.tee || '—', g.tee.length > 2 ? 'long' : ''), when);
    const complete = g.players.every(Boolean) && !!g.tee;
    head.append(tee, el('span', complete ? 'Ready to play' : 'Provisional', `status ${complete ? 'complete' : ''}`));
    const body = el('div', '', 'card-body');
    // Organisations whose logo spells out their name show the logo alone; the name stays for screen readers and comes back if the image fails.
    const org = el('div', '', 'org'), badge = logo(g.organisation, 'org-logo'), name = el('h3', g.organisation);
    if (badge.classList.contains('has-logo') && !('mark' in badge.dataset)) {
      org.classList.add('logo-only'); name.className = 'visually-hidden';
      badge.querySelector('img').addEventListener('error', () => { org.classList.remove('logo-only'); name.className = ''; });
    } else if ('wide' in badge.dataset) {
      org.classList.add('logo-wide');
      badge.querySelector('img').addEventListener('error', () => org.classList.remove('logo-wide'));
    }
    org.append(badge, name);
    body.append(el('p', `GROUP ${String(g.index).padStart(2, '0')} / ${String(g.total).padStart(2, '0')}`, 'group-label'), org);
    const list = el('ol', '', 'players');
    g.players.forEach((name, i) => { const li = el('li'); li.append(el('span', String(i + 1).padStart(2, '0'), 'number'), el('span', name || 'Player to be confirmed', name ? '' : 'pending')); list.append(li); });
    body.append(list); card.append(head, body); return card;
  }));
  $('#empty').hidden = !!visible.length;
}
async function load(manual = false) {
  if (loading) return;
  loading = true; $('#refresh').disabled = true; $('#refresh .btn-label').textContent = 'Refreshing…'; $('#refresh').classList.add('is-loading'); $('#groups').setAttribute('aria-busy', 'true');
  try {
    const { data, response } = await request('/api/draw');
    entries = data.map(({ id, organisation, bookings, groups }) => ({ id, organisation, bookings, groups }));
    source = response.headers.get('X-Draw-Storage') || 'neon';
    $('#data-status').textContent = source === 'local' ? 'Local draw' : 'Live draw';
    $('#data-status').classList.add('live');
    const all = groups(), pending = all.filter(g => !g.tee).length;
    $('#notice').hidden = true; // only shown when the live draw can't be loaded
    if (manual) toast('Draw refreshed.');
  } catch (error) {
    if (entries.length && source !== 'preview') {
      $('#notice').hidden = false; $('#notice').textContent = `Unable to refresh. Showing the last loaded draw; it may have changed. ${error.message}`;
      $('#data-status').textContent = 'Refresh needed';
    } else {
      try {
        entries = (await request('/draw.json')).data; source = 'preview';
        $('#data-status').textContent = 'Saved draw';
        $('#notice').hidden = false; $('#notice').textContent = 'The live draw is unavailable. Showing the last saved copy of the draw; later changes are not included. Please confirm your allocation at registration.';
      } catch { entries = []; $('#notice').hidden = false; $('#notice').textContent = 'Unable to load the draw. Use Refresh draw to try again.'; $('#data-status').textContent = 'Unavailable'; }
    }
    $('#data-status').classList.remove('live');
    if (manual) toast(error.message, true);
  } finally {
    render(); loading = false; $('#refresh').disabled = false; $('#refresh .btn-label').textContent = 'Refresh draw'; $('#refresh').classList.remove('is-loading'); $('#groups').setAttribute('aria-busy', 'false');
  }
}
$('#search').addEventListener('input', render);
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
$('#clear-search').onclick = () => { $('#search').value = ''; setFilter('all'); $('#search').focus(); };
$('#print').onclick = () => window.print(); $('#refresh').onclick = () => load(true);
setInterval(() => { if (!document.hidden) load(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

await load();
