// Load, normalize and validate a diagram spec (YAML/JSON). See references/spec.md.
import fs from 'node:fs';
import yaml from 'js-yaml';
import { catalog, guide, resolveIcon, suggestIcons } from './catalog.mjs';
import { wrapLabel } from './text.mjs';

export function loadSpec(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return file.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw);
}

const ENUMS = {
  theme: ['light', 'dark'],
  profile: ['default', 'training'],
  direction: ['right', 'down', 'left', 'up'],
  callouts: ['large', 'small'],
  engine: ['aws', 'elk'],
};

/**
 * Normalize + validate. Returns { spec, errors, warnings }.
 * errors   -> the diagram would break the guideline or cannot be drawn: fix before rendering.
 * warnings -> allowed by the deck but worth a second look.
 */
export function validate(input) {
  const G = guide();
  const errors = [], warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  if (!input || typeof input !== 'object') return { spec: null, errors: ['spec: not an object'], warnings };

  const spec = {
    title: input.title || '',
    theme: input.theme || 'light',
    profile: input.profile || 'default',
    direction: input.direction || 'right',
    calloutSize: input.callouts || 'large',
    steps: input.steps || null,
    elk: input.elk || {},
    engine: input.engine || 'aws',
    groups: [], nodes: [], edges: [],
  };
  for (const [k, vals] of Object.entries(ENUMS)) {
    const v = k === 'callouts' ? spec.calloutSize : spec[k];
    if (!vals.includes(v)) err(k, `"${v}" must be one of ${vals.join(', ')}`);
  }
  if (spec.profile === 'training' && spec.theme !== 'light') {
    warn('profile', 'Training & Certification diagrams must use a white background (deck slide 13) - theme forced to light');
    spec.theme = 'light';
  }
  const fontPx = spec.profile === 'training' ? 16 * G.units.pxPerPt : G.label.fontSizePx;

  const ids = new Map();
  const claim = (id, where) => {
    if (!id || typeof id !== 'string') { err(where, 'missing "id"'); return false; }
    if (ids.has(id)) { err(where, `duplicate id "${id}" (also ${ids.get(id)})`); return false; }
    ids.set(id, where); return true;
  };

  // ---- groups
  const groupById = new Map();
  (input.groups || []).forEach((g, i) => {
    const where = `groups[${i}]${g?.id ? ` (${g.id})` : ''}`;
    if (!claim(g?.id, where)) return;
    const preset = G.groups[g.type];
    if (!preset) { err(where, `unknown group type "${g.type}". Allowed: ${Object.keys(G.groups).join(', ')}`); return; }
    const out = { id: g.id, type: g.type, parent: g.parent || null, label: g.label ?? preset.label, cidr: g.cidr || null, layout: g.layout || null, preset };
    if (g.layout && !['row', 'column', 'flow'].includes(g.layout)) err(where, `layout must be row|column|flow`);
    if (g.type === 'custom') {
      const svc = g.service && resolveIcon(g.service);
      if (!svc || svc.kind !== 'service') err(where, `custom group needs "service:" = an AWS service (got "${g.service ?? ''}")${g.service ? `; did you mean: ${suggestIcons(g.service).join(', ')}` : ''}`);
      else if (!svc.icon32) err(where, `service "${svc.id}" has no 32px icon for a custom group`);
      else out.service = svc;
      if (!g.label) warn(where, 'custom group without "label"');
    }
    if ((g.type === 'generic' || g.type === 'generic-dashed') && !g.label) warn(where, 'generic group without "label"');
    if (g.label && preset.label && g.label !== preset.label && ['vpc', 'public-subnet', 'private-subnet', 'security-group', 'auto-scaling-group', 'availability-zone', 'region'].includes(g.type) && !/^(Availability Zone|Region|AWS account|Security group|Auto Scaling group|Public subnet|Private subnet)\b/.test(g.label))
      warn(where, `label "${g.label}" differs from the preset "${preset.label}" - keep the preset wording (e.g. "Availability Zone 1", "Public subnet") so readers recognize the group`);
    groupById.set(g.id, out);
    spec.groups.push(out);
  });

  // ---- nodes
  const nodeById = new Map();
  (input.nodes || []).forEach((n, i) => {
    const where = `nodes[${i}]${n?.id ? ` (${n.id})` : ''}`;
    if (!claim(n?.id, where)) return;
    const ref = n.icon ?? n.service ?? n.resource;
    if (!ref) { err(where, 'missing "icon"'); return; }
    const entry = resolveIcon(ref);
    if (!entry) { err(where, `unknown icon "${ref}". Did you mean: ${suggestIcons(ref).join(', ') || '(no match - run: npm run find -- <keyword>)'}`); return; }
    const label = n.label ?? entry.name;
    const wrapped = wrapLabel(label, { fontPx, maxWidth: G.label.maxWidthPx, maxLines: G.label.maxLines });
    if (!wrapped.fits) {
      const lim = `${G.label.maxLines} lines of ${G.label.maxWidthPx}px`;
      if (wrapped.lines.length > G.label.maxLines || wrapped.width > G.label.maxWidthPx * 1.5) err(where, `label "${label}" needs more than ${lim} (slide 17). Shorten it or use the short service form`);
      else warn(where, `label "${label}" does not fit ${lim}; consider the short form (e.g. "Amazon S3"), and mention the full name once in the document`);
    }
    if (/\b(\w+)-\s/.test(label)) err(where, `label "${label}" breaks a word with a hyphen - never break mid-word (slide 17)`);
    const out = { id: n.id, entry, label, lines: wrapped.lines, labelWidth: wrapped.width, parent: n.parent || null, step: n.step ?? null };
    nodeById.set(n.id, out);
    spec.nodes.push(out);
  });

  // ---- parents & nesting
  const parentType = p => (p ? groupById.get(p)?.type : 'root');
  for (const item of [...spec.groups, ...spec.nodes]) {
    if (!item.parent) continue;
    if (!groupById.has(item.parent)) {
      err(item.id, nodeById.has(item.parent) ? `parent "${item.parent}" is a node; only groups can contain things` : `unknown parent "${item.parent}"`);
      item.parent = null;
    }
  }
  for (const g of spec.groups) { // cycles
    const seen = new Set([g.id]);
    for (let p = g.parent; p; p = groupById.get(p)?.parent) {
      if (seen.has(p)) { err(g.id, `parent cycle through "${p}"`); g.parent = null; break; }
      seen.add(p);
    }
  }
  for (const g of spec.groups) {
    const rule = G.nesting[g.type];
    if (!rule) continue;
    const pt = parentType(g.parent);
    if (!rule.parents.includes(pt)) {
      const msg = `"${g.type}" inside "${pt}" - expected inside one of: ${rule.parents.join(', ')}`;
      rule.strict ? err(g.id, msg) : warn(g.id, msg);
    }
  }
  const hasCloud = spec.groups.some(g => g.type.startsWith('aws-cloud'));
  const insideCloud = id => { for (let p = id; p; p = groupById.get(p)?.parent) if (groupById.get(p)?.type.startsWith('aws-cloud')) return true; return false; };
  for (const n of spec.nodes) {
    if (hasCloud && n.entry.kind !== 'general' && !insideCloud(n.parent) && !n.entry.id.startsWith('aws-management-console'))
      warn(n.id, `AWS ${n.entry.kind} "${n.entry.id}" is outside the AWS Cloud group - intended?`);
  }
  for (const g of spec.groups) {
    const has = spec.groups.some(x => x.parent === g.id) || spec.nodes.some(x => x.parent === g.id);
    if (!has) warn(g.id, 'empty group');
  }

  // ---- edges
  (input.edges || []).forEach((e, i) => {
    const where = `edges[${i}]${e?.from ? ` (${e.from}->${e.to})` : ''}`;
    if (!e || !e.from || !e.to) { err(where, 'edge needs "from" and "to"'); return; }
    for (const k of ['from', 'to']) if (!nodeById.has(e[k]) && !groupById.has(e[k])) err(where, `unknown ${k} "${e[k]}"`);
    if (e.from === e.to) err(where, 'self-loop');
    const arrow = e.arrow || 'end';
    if (!['end', 'both', 'none', 'start'].includes(arrow)) err(where, `arrow must be end|both|none|start (preset arrows only, slide 16)`);
    spec.edges.push({ id: e.id || `e${i}`, from: e.from, to: e.to, label: e.label || '', step: e.step ?? null, arrow });
  });

  // ---- numbered callouts (slide 18)
  const steps = [...spec.nodes, ...spec.edges].filter(x => x.step != null);
  for (const s of steps) {
    if (!Number.isInteger(s.step) || s.step < 1) err(s.id, `step "${s.step}" must be a positive integer - callouts use digits only (no letters/symbols)`);
  }
  const nums = [...new Set(steps.map(s => s.step).filter(Number.isInteger))].sort((a, b) => a - b);
  nums.forEach((n, i) => { if (n !== i + 1) warn('steps', `callout numbers should run 1..${nums.length} without gaps (found ${nums.join(', ')})`); });
  const dup = nums.filter(n => steps.filter(s => s.step === n).length > 1);
  if (dup.length) warn('steps', `callout number(s) ${dup.join(', ')} used more than once`);
  if (spec.steps) for (const k of Object.keys(spec.steps)) if (!nums.includes(Number(k))) warn('steps', `description for step ${k} but no callout uses it`);
  if (spec.calloutSize === 'large' && nums.length > 6) warn('callouts', `${nums.length} callouts - consider "callouts: small" for a complex diagram`);

  if (!spec.nodes.length) err('nodes', 'no nodes');
  return { spec, errors, warnings };
}

export function formatReport({ errors, warnings }) {
  const out = [];
  for (const e of errors) out.push(`ERROR   ${e}`);
  for (const w of warnings) out.push(`WARN    ${w}`);
  if (!errors.length && !warnings.length) out.push('OK      spec follows the guideline checks');
  return out.join('\n');
}

export { catalog };
