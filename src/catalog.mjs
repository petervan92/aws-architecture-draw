// Icon catalog + guideline constants.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let _catalog, _guide;
export function catalog() {
  if (!_catalog) {
    const p = path.join(ROOT, 'catalog', 'icons.json');
    if (!fs.existsSync(p)) throw new Error('catalog/icons.json missing - run: npm run catalog');
    _catalog = JSON.parse(fs.readFileSync(p, 'utf8'));
    _catalog.byId = new Map(_catalog.icons.map(e => [e.id, e]));
  }
  return _catalog;
}
export function guide() {
  return (_guide ||= JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'guidelines.json'), 'utf8')));
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Resolve an icon reference (id, alias, or official name) to a catalog entry, or null. */
export function resolveIcon(ref) {
  const c = catalog();
  const s = slug(ref);
  if (c.byId.has(s)) return c.byId.get(s);
  if (c.aliases[s]) return c.byId.get(c.aliases[s]);
  for (const v of [`amazon-${s}`, `aws-${s}`]) if (c.byId.has(v)) return c.byId.get(v);
  return null;
}

/** Up to n suggestions for an unknown reference. */
export function suggestIcons(ref, n = 5) {
  const c = catalog();
  const toks = slug(ref).split('-').filter(t => t && !['amazon', 'aws'].includes(t));
  if (!toks.length) return [];
  const scored = [];
  for (const e of c.icons) {
    const hay = [e.id, ...e.aliases].join(' ');
    let score = 0;
    for (const t of toks) if (hay.includes(t)) score += t.length;
    if (score) scored.push({ id: e.id, score: score - e.id.length / 100 + (e.kind === 'service' ? 0.5 : 0) });
  }
  if (scored.length) return scored.sort((a, b) => b.score - a.score).slice(0, n).map(x => x.id);
  // typo tolerance: edit distance against ids and aliases
  const q = toks.join('-');
  const best = [];
  for (const e of c.icons) {
    const d = Math.min(...[e.id.replace(/^(amazon|aws)-/, ''), ...e.aliases].map(k => lev(q, k)));
    if (d <= Math.max(2, Math.floor(q.length / 4))) best.push({ id: e.id, d: d + (e.kind === 'service' ? 0 : 0.5) });
  }
  return best.sort((a, b) => a.d - b.d).slice(0, n).map(x => x.id);
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = m[0]; m[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = m[j];
      m[j] = Math.min(m[j] + 1, m[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return m[b.length];
}

/** Absolute path of the SVG for an entry, honoring the theme variant. */
export function iconFile(entry, theme = 'light') {
  const f = entry.files[theme] || entry.files.light || entry.files.dark;
  return path.join(ROOT, f);
}

export function groupIconFile(name) {
  return path.join(ROOT, 'icons', 'Architecture-Group-Icons', name);
}

const _b64 = new Map();
export function svgBase64(file) {
  if (!_b64.has(file)) _b64.set(file, fs.readFileSync(file).toString('base64'));
  return _b64.get(file);
}

/** Search the catalog (for the find-icon CLI). */
export function searchIcons(query, limit = 20) {
  const c = catalog();
  const q = slug(query);
  const exact = resolveIcon(query);
  const res = c.icons.filter(e => e.id.includes(q) || e.aliases.some(a => a.includes(q)) || slug(e.name).includes(q));
  if (exact && !res.includes(exact)) res.unshift(exact);
  return res.slice(0, limit);
}
