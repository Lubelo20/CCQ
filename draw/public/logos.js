// Company logos for the draw cards and organiser dashboard. Files live in /assets/logos (self-hosted:
// the CSP only allows same-origin images). Keys are normalised organisation names; anything without
// a logo falls back to a monogram of its initials.
// tone: 'dark' for white logos, 'navy' for logos on OD Investments' blue; default is a white tile.
// mark: show the name beside the logo. Every CCQ logo sets it so all draw cards share one layout.
// wide: a mark too detailed for the small tile (e.g. two sponsor logos side by side) — full width, name below.
const LOGOS = {
  'shaka langa': { file: 'mnandi-meats.png', mark: true },
  'mthoko mtshali': { file: 'galela-mashenge-foundation.png', tone: 'dark', mark: true }, // cut from a Mashenge Open poster; replace with an original file if supplied
  'president dlomo': { file: 'od-investments.jpg', tone: 'navy', mark: true },
  'ndabe': { file: 'ndabe-dignified-group.png', mark: true },
  'liberty life': { file: 'liberty.png', mark: true }, // cut from a WhatsApp image; replace with an original file if supplied
};
const LEGAL = /\b(pty|ltd|inc|npc|limited|cc)\b/g;
const key = name => name.toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(LEGAL, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
export function initials(name) {
  const words = key(name).split(' ').filter(w => w && w !== 'and');
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}
export function logo(name, className) {
  const { file, tone, mark, wide } = LOGOS[key(name)] || {};
  const node = document.createElement('span');
  node.className = `${className}${file ? ` has-logo${tone ? ` tone-${tone}` : ''}` : ''}`;
  node.setAttribute('aria-hidden', 'true'); // the organisation name is always shown beside it
  if (file) {
    if (mark) node.dataset.mark = '';
    if (wide) node.dataset.wide = '';
    const img = document.createElement('img');
    img.src = `/assets/logos/${file}`; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.onerror = () => { node.className = className; node.replaceChildren(initials(name)); };
    node.append(img);
  } else {
    node.textContent = initials(name);
  }
  return node;
}
