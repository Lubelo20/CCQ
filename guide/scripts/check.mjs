import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const css = readFileSync(resolve(dist, 'style.css'), 'utf8');
const pages = ['index.html'];
const idsOf = page => [...readFileSync(resolve(dist, page), 'utf8').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
// Vercel serves dist with cleanUrls, so "/rules" is rules.html and "/" is index.html.
const pageFor = path => { const p = path.replace(/^\//, ''); return p === '' ? 'index.html' : existsSync(resolve(dist, p)) ? p : `${p}.html`; };
for (const page of pages) {
  const html = readFileSync(resolve(dist, page), 'utf8');
  const ids = idsOf(page);
  assert.equal(new Set(ids).size, ids.length, `Duplicate HTML IDs in ${page}`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `Exactly one page heading required in ${page}`);
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g), ...(page === 'index.html' ? css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g) : [])].map(m => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:)/.test(ref)) continue;
    const [path, anchor] = ref.split('#');
    const target = path ? pageFor(path) : page;
    assert(existsSync(resolve(dist, target)), `Missing asset in ${page}: ${ref}`);
    if (anchor) assert(idsOf(target).includes(anchor), `Missing anchor in ${page}: ${ref}`);
  }
}
assert.equal(JSON.parse(readFileSync(resolve(root, 'vercel.json'))).outputDirectory, 'dist');
const script = readFileSync(resolve(dist, 'countdown.js'), 'utf8');
for (const [time, expected, hidden, label] of [
  ['2026-10-22T11:00:00+02:00', ['01','00','00','00'], false, ''],
  ['2026-10-23T10:59:59+02:00', ['00','00','00','01'], false, ''],
  ['2026-10-23T11:00:00+02:00', ['00','00','00','00'], true, 'GOLF DAY IS HERE'],
  ['2026-10-24T00:00:00+02:00', ['00','00','00','00'], true, 'THANK YOU']
]) {
  const nodes = Object.fromEntries(['days','hours','minutes','seconds','countdown-label'].map(id => [id, {textContent:''}]));
  const timer = {hidden:false};
  let cleared = false;
  class Clock extends Date { static now() { return Date.parse(time); } }
  vm.runInNewContext(script, {Date:Clock, document:{getElementById:id => nodes[id], querySelector:() => timer, addEventListener:() => {}}, setInterval:() => 1, clearInterval:() => {cleared=true;}});
  assert.deepEqual(['days','hours','minutes','seconds'].map(id => nodes[id].textContent), expected);
  assert.equal(timer.hidden, hidden);
  assert(nodes['countdown-label'].textContent.startsWith(label));
  if (label === 'THANK YOU') assert(cleared, 'Expired countdown must stop its timer');
}
console.log('Passed: assets, navigation anchors, headings (guide page), Vercel output and countdown boundaries.');
