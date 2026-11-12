#!/usr/bin/env node
// Render AWS architecture spec(s) -> .drawio + .svg + .png
//
// Usage:
//   node scripts/render.mjs <spec.yaml> [more.yaml ...] [--out <dir>] [--formats drawio,svg,png] [--scale 2] [--strict]
//
// Exit code 1 when the spec has errors (or warnings with --strict). Nothing is written in that case.
import fs from 'node:fs';
import path from 'node:path';
import { loadSpec, validate, formatReport } from '../src/spec.mjs';
import { layout } from '../src/layout.mjs';
import { renderSvg } from '../src/render-svg.mjs';
import { renderDrawio } from '../src/render-drawio.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const outDir = opt('--out', null);
const formats = opt('--formats', 'drawio,svg,png').split(',').map(s => s.trim());
const scale = Number(opt('--scale', '2'));
const strict = flag('--strict');
if (!args.length) {
  console.error('Usage: node scripts/render.mjs <spec.yaml> [...] [--out dir] [--formats drawio,svg,png] [--scale 2] [--strict]');
  process.exit(2);
}

let failed = 0;
for (const file of args) {
  const base = path.basename(file).replace(/\.(ya?ml|json)$/i, '');
  const dir = outDir || path.dirname(file);
  console.log(`\n== ${file}`);
  let res;
  try { res = validate(loadSpec(file)); } catch (e) { console.log(`ERROR   cannot read spec: ${e.message}`); failed++; continue; }
  console.log(formatReport(res));
  if (res.errors.length || (strict && res.warnings.length)) { failed++; console.log('-> not rendered'); continue; }

  const L = await layout(res.spec);
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  if (formats.includes('drawio')) {
    const p = path.join(dir, `${base}.drawio`);
    fs.writeFileSync(p, renderDrawio(res.spec, L)); written.push(p);
  }
  const svg = renderSvg(res.spec, L);
  if (formats.includes('svg')) {
    const p = path.join(dir, `${base}.svg`);
    fs.writeFileSync(p, svg); written.push(p);
  }
  if (formats.includes('png')) {
    const { Resvg } = await import('@resvg/resvg-js');
    const png = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: scale },
      font: { loadSystemFonts: true, defaultFontFamily: 'Arial', sansSerifFamily: 'Arial' },
      background: undefined,
    }).render().asPng();
    const p = path.join(dir, `${base}.png`);
    fs.writeFileSync(p, png); written.push(p);
  }
  console.log(`-> ${L.width}x${L.height}px: ${written.join(', ')}`);
}
process.exit(failed ? 1 : 0);
