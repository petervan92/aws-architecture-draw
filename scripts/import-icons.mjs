#!/usr/bin/env node
// Import the official AWS Architecture Icons asset package into ./icons
//
// Usage:
//   node scripts/import-icons.mjs <dir> [<dir> ...]
//
// Each <dir> is a folder that contains (any of) the extracted package folders:
//   Architecture-Service-Icons_<release>/
//   Resource-Icons_<release>/
//   Architecture-Group-Icons_<release>/
//   Category-Icons_<release>/
// Only SVG files are copied (the guideline says: do not use PNG, quality degrades).
// The release tag (e.g. 07312026) is written to icons/RELEASE.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
const KINDS = ['Architecture-Service-Icons', 'Resource-Icons', 'Architecture-Group-Icons', 'Category-Icons'];

const srcs = process.argv.slice(2);
if (!srcs.length) {
  console.error('Usage: node scripts/import-icons.mjs <extracted-package-dir> [...]');
  process.exit(1);
}

function copySvgs(from, to) {
  let n = 0;
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === '__MACOSX') continue;
    const s = path.join(from, ent.name);
    if (ent.isDirectory()) n += copySvgs(s, path.join(to, ent.name));
    else if (ent.name.toLowerCase().endsWith('.svg')) {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(s, path.join(to, ent.name));
      n++;
    }
  }
  return n;
}

const releases = new Set();
for (const src of srcs) {
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const kind = KINDS.find(k => ent.name.startsWith(k + '_') || ent.name === k);
    if (!kind) continue;
    const rel = ent.name.slice(kind.length + 1);
    if (rel) releases.add(rel);
    const dest = path.join(OUT, kind);
    fs.rmSync(dest, { recursive: true, force: true });
    const n = copySvgs(path.join(src, ent.name), dest);
    console.log(`${kind.padEnd(28)} ${String(n).padStart(5)} SVG  <- ${path.join(src, ent.name)}`);
  }
}
if (releases.size > 1) console.warn('WARNING: mixed releases imported:', [...releases].join(', '));
if (releases.size) fs.writeFileSync(path.join(OUT, 'RELEASE'), [...releases].sort().join('\n') + '\n');
console.log('Done. Now run: npm run catalog');
