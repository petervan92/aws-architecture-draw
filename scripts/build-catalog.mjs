#!/usr/bin/env node
// Build catalog/icons.json from ./icons (official AWS asset package, SVG only).
//
// Entry shape:
//   { id, kind: "service"|"resource"|"general", name, service?, category,
//     categoryColor, files: { light, dark }, aliases: [] }
// Paths are relative to the repo root. Service icons use the 48px set
// (the guideline: "For diagrams, use icons at their predefined size").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'icons');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const words = s => s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

// ---- category colors, read from Category-Icons/*/Arch-Category_<Name>_32.svg
const categoryColor = {};
const catDir = path.join(ICONS, 'Category-Icons');
for (const d of fs.readdirSync(catDir)) {
  for (const f of fs.readdirSync(path.join(catDir, d))) {
    const m = f.match(/^Arch-Category_(.+)_32\.svg$/);
    if (!m) continue;
    const svg = fs.readFileSync(path.join(catDir, d, f), 'utf8');
    const c = [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map(x => x[1].toUpperCase()).find(x => x !== '#FFFFFF');
    if (c) categoryColor[m[1]] = c;
  }
}
// Folder names that differ from the category-icon names
const CAT_ALIAS = {
  'IoT': 'Internet-of-Things',
  'Management-Governance': 'Management-Tools',
  'General-Icons': null,
};
const catColor = cat => {
  const k = cat in CAT_ALIAS ? CAT_ALIAS[cat] : cat;
  return k ? categoryColor[k] || null : null;
};

const entries = [];

// ---- service icons (Arch_<Category>/48/Arch_<Name>[_Light|_Dark]_48.svg)
const svcDir = path.join(ICONS, 'Architecture-Service-Icons');
const svcById = {}; // global: a few services appear in two categories
for (const catFolder of fs.readdirSync(svcDir)) {
  const category = catFolder.replace(/^Arch_/, '');
  const dir48 = path.join(svcDir, catFolder, '48');
  if (!fs.existsSync(dir48)) continue;
  const byId = svcById;
  for (const f of fs.readdirSync(dir48)) {
    const m = f.match(/^Arch_(.+?)(?:_(Light|Dark))?_48\.svg$/);
    if (!m) continue;
    const name = words(m[1]);
    const id = slug(m[1]);
    const e = byId[id] ||= {
      id, kind: 'service', name, category, categoryColor: catColor(category), files: {},
      icon32: null,
    };
    if (e.category !== category) { (e.alsoIn ||= []).includes(category) || e.alsoIn.push(category); continue; }
    const variant = (m[2] || 'light').toLowerCase();
    e.files[variant] = rel(path.join(dir48, f));
    const f32 = path.join(svcDir, catFolder, '32', f.replace(/_48\.svg$/, '_32.svg'));
    if (fs.existsSync(f32) && variant === 'light') e.icon32 = rel(f32);
  }
}
entries.push(...Object.values(svcById));

// ---- resource icons (Res_<Category>/Res_<Service>_<Resource>_48.svg)
//      general icons  (Res_General-Icons/Res_48_<Light|Dark>/Res_<Name>_48_<Light|Dark>.svg)
const resDir = path.join(ICONS, 'Resource-Icons');
for (const catFolder of fs.readdirSync(resDir)) {
  const category = catFolder.replace(/^Res_/, '');
  const base = path.join(resDir, catFolder);
  if (category === 'General-Icons') {
    const byId = {};
    for (const sub of fs.readdirSync(base)) {
      for (const f of fs.readdirSync(path.join(base, sub))) {
        const m = f.match(/^Res_(.+?)_48_(Light|Dark)\.svg$/);
        if (!m) continue;
        let id = slug(m[1]);
        if (svcById[id]) id = 'general-' + id; // e.g. aws-management-console exists as a service too
        const e = byId[id] ||= { id, kind: 'general', name: words(m[1]), category, categoryColor: null, files: {} };
        e.files[m[2].toLowerCase()] = rel(path.join(base, sub, f));
      }
    }
    entries.push(...Object.values(byId));
    continue;
  }
  for (const f of fs.readdirSync(base)) {
    const m = f.match(/^Res_(.+)_48\.svg$/);
    if (!m) continue;
    const parts = m[1].split('_');
    const service = parts.length > 1 ? words(parts[0]) : null;
    const resource = words(parts.length > 1 ? parts.slice(1).join(' ') : parts[0]);
    entries.push({
      id: slug(m[1]), kind: 'resource', name: resource, service, category,
      categoryColor: catColor(category), files: { light: rel(path.join(base, f)) },
    });
  }
}

// ---- aliases: auto-generated + catalog/aliases.json (hand-curated, wins on conflict)
const stripVendor = id => id.replace(/^(amazon|aws)-/, '');
const auto = {};
const addAuto = (a, id) => { if (a && a !== id) (auto[a] ||= new Set()).add(id); };
for (const e of entries) {
  if (e.kind === 'service') addAuto(stripVendor(e.id), e.id);
  if (e.kind === 'resource' && e.service) {
    const svc = stripVendor(slug(e.service));
    addAuto(`${svc}-${slug(e.name)}`, e.id);
    addAuto(slug(e.name), e.id); // e.g. "nat-gateway" (kept only if unique)
  }
}
const manualPath = path.join(ROOT, 'catalog', 'aliases.json');
const manual = fs.existsSync(manualPath) ? JSON.parse(fs.readFileSync(manualPath, 'utf8')) : {};
const ids = new Set(entries.map(e => e.id));
const aliases = {};
for (const [a, set] of Object.entries(auto)) if (set.size === 1 && !ids.has(a)) aliases[a] = [...set][0];
for (const [a, id] of Object.entries(manual)) {
  if (a.startsWith('_')) continue;
  if (!ids.has(id)) { console.warn(`aliases.json: "${a}" -> unknown id "${id}"`); continue; }
  aliases[a] = id;
}
for (const e of entries) e.aliases = Object.keys(aliases).filter(a => aliases[a] === e.id).sort();

entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
const release = fs.existsSync(path.join(ICONS, 'RELEASE')) ? fs.readFileSync(path.join(ICONS, 'RELEASE'), 'utf8').trim() : null;
const out = { release, generated: new Date().toISOString().slice(0, 10), categoryColor, aliases, icons: entries };
fs.mkdirSync(path.join(ROOT, 'catalog'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'catalog', 'icons.json'), JSON.stringify(out, null, 1));

const count = k => entries.filter(e => e.kind === k).length;
console.log(`release ${release}: ${count('service')} services, ${count('resource')} resources, ${count('general')} general icons, ${Object.keys(aliases).length} aliases`);
const missingColor = [...new Set(entries.filter(e => e.kind !== 'general' && !e.categoryColor).map(e => e.category))];
if (missingColor.length) console.warn('categories without color:', missingColor.join(', '));
