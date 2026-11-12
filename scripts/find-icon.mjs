#!/usr/bin/env node
// Search the official icon catalog.
// Usage: node scripts/find-icon.mjs <keyword> [--kind service|resource|general] [--limit 20]
import { searchIcons, suggestIcons, catalog } from '../src/catalog.mjs';

const args = process.argv.slice(2);
const take = n => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const kind = take('--kind');
const limit = Number(take('--limit') || 20);
const q = args.join(' ');
if (!q) { console.error('Usage: node scripts/find-icon.mjs <keyword> [--kind service|resource|general] [--limit N]'); process.exit(2); }

let res = searchIcons(q, 500);
if (kind) res = res.filter(e => e.kind === kind);
if (!res.length) {
  const c = catalog();
  res = suggestIcons(q, limit).map(id => c.byId.get(id));
  if (res.length) console.log('(no direct match; closest:)');
}
for (const e of res.slice(0, limit)) {
  const extra = e.service ? ` [of ${e.service}]` : '';
  const al = e.aliases.length ? `  aliases: ${e.aliases.slice(0, 6).join(', ')}` : '';
  console.log(`${e.kind.padEnd(8)} ${e.id.padEnd(48)} "${e.name}"${extra}  (${e.category})${al}`);
}
if (!res.length) { console.log('no match'); process.exit(1); }
