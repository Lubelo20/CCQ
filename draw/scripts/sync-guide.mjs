// Copies the golfers' guide (../guide/dist) into public/info so the draw site serves it at /info/.
// Rewrites the guide's external fonts, relative paths (blocked by the CSP) and its absolute links for this host.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../../guide/dist', import.meta.url));
const target = fileURLToPath(new URL('../public/info', import.meta.url));
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
const page = `${target}/index.html`;
const html = readFileSync(page, 'utf8')
  .replace(/<link rel="preconnect"[^\n]*\n/, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="/fonts.css">')
  .replaceAll('https://ccq-golf-draw.vercel.app/', '/')
  .replaceAll('https://ccq-golf-day.vercel.app/', 'https://ccq-iota.vercel.app/info/')
  // root-relative so the page works at both /info and /info/
  .replace(/(src|href)="(?![a-z]+:|\/|#)([^"]+)"/g, '$1="/info/$2"');
if (/fonts\.googleapis|ccq-golf-(draw|day)\.vercel/.test(html)) throw new Error('Guide still references an external font or old URL.');
writeFileSync(page, html);
console.log('Guide copied to public/info.');
