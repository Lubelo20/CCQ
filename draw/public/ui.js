export const $ = selector => document.querySelector(selector);
export function el(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
export async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000), cache: 'no-store' }); }
  catch { throw new Error('Connection interrupted. Please check your connection and try again.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unexpected response. Please try again.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed. Please try again.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return { data, response };
}
export function stats(target, values) {
  $(target).replaceChildren(...values.map(([value, label, detail]) => {
    const node = el('div', '', 'stat');
    node.append(el('span', label, 'stat-label'), el('strong', value));
    if (detail) node.append(el('small', detail));
    return node;
  }));
}
export function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('toast-error', error);
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 6000);
}
export const money = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(value);
// Draw order: starting hole, then tee time; groups still awaiting a hole go last.
export const byStart = (a, b) => a.tee && b.tee ? a.tee.localeCompare(b.tee, undefined, { numeric: true }) || (a.time || '').localeCompare(b.time || '') : a.tee ? -1 : b.tee ? 1 : 0;
export const time = () => new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' }).format(new Date());
