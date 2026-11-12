// Auto-layout with ELK (layered, orthogonal edges, nested groups).
// Output: absolute coordinates for groups, icons, labels, edges and callouts.
import ELK from 'elkjs/lib/elk.bundled.js';
import { guide } from './catalog.mjs';
import { textWidth, wrapLabel } from './text.mjs';

const DIR = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };

import { layoutAws } from './layout-aws.mjs';

/** engine "aws" (default): structure-first layout + A* orthogonal routing. engine "elk": ELK layered. */
export async function layout(spec) {
  return spec.engine === 'elk' ? layoutElk(spec) : layoutAws(spec);
}

export async function layoutElk(spec) {
  const G = guide();
  const training = spec.profile === 'training';
  const fontPx = training ? 16 * G.units.pxPerPt : G.label.fontSizePx;
  const lineH = Math.round(fontPx * 1.2);
  const ICON = G.icon.size, GICON = G.groupIcon.size;
  const PAD = 24; // >= the 0.05" (5px) nested-group buffer from slide 14, roomier for readability
  const HEADER = GICON + 16;

  // ---- build ELK graph
  const elkNode = new Map();
  const mk = (id, extra) => { const n = { id, children: [], edges: [], ...extra }; elkNode.set(id, n); return n; };
  const root = mk('__root', {
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': DIR[spec.direction] || 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '16',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.spacing.labelNode': String(G.label.gapBelowIconPx),
      'elk.spacing.edgeLabel': '4',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
      'elk.layered.mergeEdges': 'false',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
      ...Object.fromEntries(Object.entries(spec.elk || {}).map(([k, v]) => [k.startsWith('elk.') ? k : 'elk.' + k, String(v)])),
    },
  });

  // groups (create first, attach after so order of definition does not matter)
  const groupInfo = new Map();
  for (const g of spec.groups) {
    const lbl = g.label || '';
    const lw = textWidth(lbl, fontPx);
    const cidrW = g.cidr ? textWidth(g.cidr, fontPx) + 24 : 0;
    const hasIcon = !!g.preset.icon;
    const insetL = hasIcon && g.preset.iconPos !== 'top-center' ? G.group.labelInsetLeftWithIconPx : G.group.labelInsetLeftNoIconPx;
    const top = g.preset.iconPos === 'top-center' ? GICON + lineH + 12 : HEADER;
    const minW = Math.max(insetL + lw + cidrW + 16, hasIcon ? GICON * 2 : 80, 160);
    groupInfo.set(g.id, { top, insetL, labelWidth: lw });
    mk(g.id, {
      layoutOptions: {
        'elk.padding': `[top=${top},left=${PAD},bottom=${PAD},right=${PAD}]`,
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
        'elk.nodeSize.minimum': `(${Math.ceil(minW)},${top + 40})`,
      },
    });
  }
  const parentOf = id => elkNode.get(id);
  for (const g of spec.groups) (g.parent && elkNode.get(g.parent) || root).children.push(elkNode.get(g.id));

  for (const n of spec.nodes) {
    const node = mk(n.id, {
      width: ICON, height: ICON,
      labels: n.lines.length ? [{ text: n.lines.join('\n'), width: Math.ceil(n.labelWidth) + 2, height: n.lines.length * lineH }] : [],
      layoutOptions: { 'elk.nodeLabels.placement': 'OUTSIDE V_BOTTOM H_CENTER', 'elk.portConstraints': 'FREE' },
    });
    (n.parent && parentOf(n.parent) || root).children.push(node);
  }

  for (const e of spec.edges) {
    const labels = [];
    if (e.label) {
      const w = wrapLabel(e.label, { fontPx, maxWidth: 160, maxLines: 2 });
      labels.push({ text: w.lines.join('\n'), width: Math.ceil(w.width) + 8, height: w.lines.length * lineH + 2,
        layoutOptions: { 'elk.edgeLabels.placement': 'CENTER' } });
      e._lines = w.lines;
    }
    root.edges.push({ id: e.id, sources: [e.from], targets: [e.to], labels });
  }

  const elk = new ELK();
  const res = await elk.layout(root);

  // ---- collect absolute geometry
  const MARGIN = 32;
  const out = { groups: [], nodes: [], edges: [], callouts: [], lineH, fontPx };
  const byId = new Map();
  // ELK returns child coordinates relative to the parent, edge coordinates relative to edge.container
  const absPos = new Map([['__root', { x: 0, y: 0 }]]);
  (function walk(n, depth, ox, oy) {
    for (const c of n.children || []) {
      const ax = ox + c.x, ay = oy + c.y;
      absPos.set(c.id, { x: ax, y: ay });
      byId.set(c.id, { ...c, x: ax, y: ay, depth });
      walk(c, depth + 1, ax, ay);
    }
  })(res, 0, 0, 0);

  for (const g of spec.groups) {
    const b = byId.get(g.id);
    out.groups.push({ ...g, x: b.x + MARGIN, y: b.y + MARGIN, w: b.width, h: b.height, depth: b.depth, ...groupInfo.get(g.id) });
  }
  for (const n of spec.nodes) {
    const b = byId.get(n.id);
    out.nodes.push({ ...n, x: b.x + MARGIN, y: b.y + MARGIN, w: ICON, h: ICON });
  }
  const resEdges = new Map();
  (function walkE(n) { for (const e of n.edges || []) resEdges.set(e.id, e); for (const c of n.children || []) walkE(c); })(res);
  for (const e of spec.edges) {
    const r = resEdges.get(e.id);
    const s = r?.sections?.[0];
    if (!s) continue;
    const o = absPos.get(r.container || '__root') || { x: 0, y: 0 };
    const pts = [s.startPoint, ...(s.bendPoints || []), s.endPoint].map(p => ({ x: p.x + o.x + MARGIN, y: p.y + o.y + MARGIN }));
    const lab = r.labels?.[0];
    out.edges.push({ ...e, points: pts, labelBox: lab ? { x: lab.x + o.x + MARGIN, y: lab.y + o.y + MARGIN, w: lab.width, h: lab.height, lines: e._lines } : null });
  }

  // ---- numbered callouts (slide 18)
  const C = G.callout[spec.calloutSize] || G.callout.large;
  const D = C.diameterPx;
  for (const n of out.nodes) {
    if (n.step == null) continue;
    out.callouts.push({ n: n.step, cx: n.x - D / 2 - 2, cy: n.y - D / 2 + 4, d: D, fontPx: C.fontSizePx });
  }
  for (const e of out.edges) {
    if (e.step == null) continue;
    out.callouts.push({ n: e.step, ...pointOnPath(e.points, e.labelBox ? 0.25 : null), d: D, fontPx: C.fontSizePx });
  }

  // ---- canvas size
  let W = res.width + 2 * MARGIN, H = res.height + 2 * MARGIN;
  for (const c of out.callouts) { W = Math.max(W, c.cx + D); H = Math.max(H, c.cy + D); }
  const minX = Math.min(MARGIN, ...out.callouts.map(c => c.cx - D / 2 - 8));
  const minY = Math.min(MARGIN, ...out.callouts.map(c => c.cy - D / 2 - 8));
  const dx = MARGIN - minX, dy = MARGIN - minY;
  if (dx || dy) shiftAll(out, dx, dy);
  W += dx; H += dy;

  // ---- step legend (like the Chef example, slide 21)
  if (spec.steps && Object.keys(spec.steps).length) {
    const items = Object.entries(spec.steps).map(([k, v]) => ({ n: Number(k), lines: greedyWrap(String(v), fontPx, 560) }))
      .sort((a, b) => a.n - b.n);
    let y = H;
    const x = MARGIN;
    out.legend = items.map(it => {
      const h = Math.max(D, it.lines.length * lineH);
      const row = { n: it.n, cx: x + D / 2, cy: y + D / 2, d: D, fontPx: C.fontSizePx, tx: x + D + 12, ty: y + (D - lineH) / 2, lines: it.lines };
      y += h + 10;
      return row;
    });
    H = y + MARGIN / 2;
    W = Math.max(W, x + D + 12 + Math.max(...items.map(it => Math.max(...it.lines.map(l => textWidth(l, fontPx))))) + MARGIN);
  }

  out.width = Math.ceil(W);
  out.height = Math.ceil(H);
  return out;
}

function shiftAll(out, dx, dy) {
  for (const g of out.groups) { g.x += dx; g.y += dy; }
  for (const n of out.nodes) { n.x += dx; n.y += dy; }
  for (const e of out.edges) {
    e.points = e.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    if (e.labelBox) { e.labelBox.x += dx; e.labelBox.y += dy; }
  }
  for (const c of out.callouts) { c.cx += dx; c.cy += dy; }
}

// Midpoint of the longest segment (frac=null) or the point at `frac` of the path length.
function pointOnPath(pts, frac) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push({ a: pts[i - 1], b: pts[i], L, at: total });
    total += L;
  }
  if (frac == null) {
    const s = segs.reduce((m, s) => (s.L > m.L ? s : m), segs[0]);
    return { cx: (s.a.x + s.b.x) / 2, cy: (s.a.y + s.b.y) / 2 };
  }
  const target = total * frac;
  const s = segs.find(s => s.at + s.L >= target) || segs[segs.length - 1];
  const t = s.L ? (target - s.at) / s.L : 0;
  return { cx: s.a.x + (s.b.x - s.a.x) * t, cy: s.a.y + (s.b.y - s.a.y) * t };
}

function greedyWrap(text, fontPx, maxW) {
  const lines = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && textWidth(t, fontPx) > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
