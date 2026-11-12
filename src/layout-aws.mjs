// "aws" layout engine: structure first (deck slide 11 "Start with the structure"),
// then orthogonal arrows routed around icons and labels (slide 16: straight lines, right angles).
//
// 1. Groups are boxes. Inside a box, children are placed in columns along the flow
//    direction, ordered by their rank in the arrow graph (sources first). Parallel
//    siblings (Availability Zones, Regions, accounts) share one column, so AZ 1 / AZ 2
//    are stacked side by side and their subnets line up.
//    `layout: row|column` on a group overrides this with plain spec order.
// 2. Every coordinate is a multiple of 8 px, so the arrow router can work on an 8 px grid.
// 3. Arrows: A* on the grid with bend penalties; icons, labels and group titles are obstacles.
import { guide } from './catalog.mjs';
import { textWidth, wrapLabel } from './text.mjs';

const GRID = 8;
const up = (v, m = 16) => Math.ceil(v / m) * m;
const PARALLEL = new Set(['availability-zone', 'region', 'aws-account']);

export function layoutAws(spec) {
  const G = guide();
  const fontPx = spec.profile === 'training' ? 16 * G.units.pxPerPt : G.label.fontSizePx;
  const lineH = Math.round(fontPx * 1.2);
  const ICON = G.icon.size, GICON = G.groupIcon.size;
  const horiz = spec.direction !== 'down' && spec.direction !== 'up';
  const GAP_MAIN = 80, GAP_CROSS = 32, PAD = 24, MARGIN = 40;

  // ---------- tree
  const order = new Map();
  spec.groups.forEach((g, i) => order.set(g.id, i));
  spec.nodes.forEach((n, i) => order.set(n.id, 10000 + i));
  const items = new Map();
  for (const g of spec.groups) items.set(g.id, { kind: 'group', ref: g, id: g.id, parent: g.parent, children: [] });
  for (const n of spec.nodes) items.set(n.id, { kind: 'node', ref: n, id: n.id, parent: n.parent, children: [] });
  const root = { kind: 'root', id: '__root', children: [] };
  for (const it of items.values()) (it.parent ? items.get(it.parent) : root).children.push(it);
  const childOrder = (a, b) => (a.ref?.order ?? order.get(a.id)) - (b.ref?.order ?? order.get(b.id));
  for (const it of [root, ...items.values()]) it.children.sort(childOrder);

  // ---------- ranks (longest path over arrows, back edges ignored)
  const adj = new Map();
  for (const e of spec.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const rank = new Map();
  const state = new Map();
  const indeg = new Map();
  for (const e of spec.edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const dfsOrder = [];
  const visit = id => {
    state.set(id, 1);
    for (const t of adj.get(id) || []) if (!state.get(t)) visit(t);
    state.set(id, 2);
    dfsOrder.push(id);
  };
  const endpoints = [...new Set(spec.edges.flatMap(e => [e.from, e.to]))].sort((a, b) => order.get(a) - order.get(b));
  for (const id of endpoints) if (!indeg.get(id) && !state.get(id)) visit(id);
  for (const id of endpoints) if (!state.get(id)) visit(id);
  // topological order = reverse post-order; edges going "back" in it are ignored
  const topo = dfsOrder.reverse();
  const pos = new Map(topo.map((id, i) => [id, i]));
  for (const id of topo) rank.set(id, rank.get(id) ?? 0);
  for (const id of topo) for (const t of adj.get(id) || []) if (pos.get(t) > pos.get(id)) rank.set(t, Math.max(rank.get(t) ?? 0, rank.get(id) + 1));
  const rankOf = it => {
    let r = rank.has(it.id) ? rank.get(it.id) : Infinity;
    for (const c of it.children) r = Math.min(r, rankOf(c));
    return r;
  };

  // ---------- measure (bottom-up)
  const nodeCell = n => {
    const lw = n.lines.length ? Math.max(...n.lines.map(l => textWidth(l, fontPx))) : 0;
    return { w: up(Math.max(ICON, lw) + 24), h: up(8 + ICON + 4 + n.lines.length * lineH + 12) };
  };

  function measure(it) {
    if (it.kind === 'node') { Object.assign(it, nodeCell(it.ref)); return; }
    for (const c of it.children) measure(c);
    const g = it.ref;
    // header
    let top = 0, minW = 0;
    if (g) {
      const p = g.preset;
      const lw = textWidth(g.label || '', fontPx);
      const cidrW = g.cidr ? textWidth(g.cidr, fontPx) + 24 : 0;
      const insetL = p.icon && p.iconPos !== 'top-center' ? G.group.labelInsetLeftWithIconPx : G.group.labelInsetLeftNoIconPx;
      top = p.iconPos === 'top-center' ? 72 : 56;
      minW = up(Math.max(insetL + lw + cidrW + 16, 160));
      it.insetL = insetL; it.top = top;
    }
    // columns
    const kids = it.children;
    let cols;
    const mode = g?.layout || 'flow';
    if (mode === 'row' || mode === 'column') {
      const alongMain = (mode === 'row') === horiz;
      cols = alongMain ? kids.map(k => [k]) : [kids];
    } else {
      const key = new Map(kids.map(k => [k, rankOf(k)]));
      // parallel siblings share one column
      const parTypes = new Set(kids.filter(k => k.kind === 'group' && PARALLEL.has(k.ref.type)).map(k => k.ref.type));
      for (const t of parTypes) {
        const same = kids.filter(k => k.kind === 'group' && k.ref.type === t);
        const m = Math.min(...same.map(k => key.get(k)));
        for (const k of same) key.set(k, m);
      }
      // unconnected children: place right before the next ranked sibling (or after the previous one)
      kids.forEach((k, i) => {
        if (Number.isFinite(key.get(k))) return;
        const next = kids.slice(i + 1).find(x => Number.isFinite(key.get(x)));
        const prev = kids.slice(0, i).reverse().find(x => Number.isFinite(key.get(x)));
        key.set(k, next ? key.get(next) - 0.5 + i * 1e-3 : prev ? key.get(prev) + 0.5 + i * 1e-3 : i * 1e-3);
      });
      const byKey = new Map();
      for (const k of kids) {
        const kk = key.get(k);
        if (!byKey.has(kk)) byKey.set(kk, []);
        byKey.get(kk).push(k);
      }
      cols = [...byKey.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    }
    // equalize parallel groups in a column (same size across the flow)
    for (const col of cols) {
      const par = col.filter(k => k.kind === 'group' && PARALLEL.has(k.ref.type));
      if (par.length > 1) {
        const m = Math.max(...par.map(k => (horiz ? k.w : k.h)));
        for (const k of par) horiz ? (k.w = m) : (k.h = m);
      }
    }
    const main = k => (horiz ? k.w : k.h), cross = k => (horiz ? k.h : k.w);
    it.cols = cols.map(col => ({
      items: col,
      main: Math.max(...col.map(main)),
      cross: col.reduce((s, k) => s + cross(k), 0) + GAP_CROSS * (col.length - 1),
    }));
    const innerMain = it.cols.reduce((s, c) => s + c.main, 0) + GAP_MAIN * Math.max(0, it.cols.length - 1);
    const innerCross = Math.max(0, ...it.cols.map(c => c.cross));
    const pad = g ? PAD : 0;
    const innerW = horiz ? innerMain : innerCross, innerH = horiz ? innerCross : innerMain;
    it.w = up(Math.max(innerW + 2 * pad, minW));
    it.h = up(innerH + (g ? top + PAD : 0));
    if (g && !kids.length) it.h = up(top + 40);
    it.innerW = innerW; it.innerH = innerH;
  }
  measure(root);

  // ---------- place (top-down)
  const out = { groups: [], nodes: [], edges: [], callouts: [], lineH, fontPx };
  const depthOf = new Map();
  function place(it, x, y, depth) {
    it.x = x; it.y = y;
    if (it.kind === 'node') {
      const n = it.ref;
      out.nodes.push({ ...n, x: x + (it.w - ICON) / 2, y: y + 8, w: ICON, h: ICON, cell: { x, y, w: it.w, h: it.h } });
      return;
    }
    const g = it.ref;
    if (g) {
      out.groups.push({ ...g, x, y, w: it.w, h: it.h, depth, insetL: it.insetL, top: it.top });
      depthOf.set(g.id, depth);
    }
    const pad = g ? PAD : 0, top = g ? it.top : 0;
    const availW = it.w - 2 * pad, availH = it.h - top - (g ? PAD : 0);
    // center the content block
    let cx = x + pad + up((availW - it.innerW) / 2, 8);
    let cy = y + top + up((availH - it.innerH) / 2, 8);
    for (const col of it.cols) {
      // center each column across the flow
      const innerCross = horiz ? it.innerH : it.innerW;
      let off = up((innerCross - col.cross) / 2, 8);
      // a lone icon is aligned on the icon centre line, so straight arrows stay straight
      if (col.items.length === 1 && col.items[0].kind === 'node') {
        const k = col.items[0];
        const iconMid = horiz ? 8 + ICON / 2 : k.w / 2;
        off = Math.max(0, Math.min(innerCross - (horiz ? k.h : k.w), Math.round((innerCross / 2 - iconMid) / 8) * 8));
      }
      for (const k of col.items) {
        const along = up((col.main - (horiz ? k.w : k.h)) / 2, 8);
        if (horiz) place(k, cx + along, cy + off, depth + 1);
        else place(k, cx + off, cy + along, depth + 1);
        off += (horiz ? k.h : k.w) + GAP_CROSS;
      }
      if (horiz) cx += col.main + GAP_MAIN; else cy += col.main + GAP_MAIN;
    }
  }
  place(root, MARGIN, MARGIN, -1);
  let W = root.w + 2 * MARGIN, H = root.h + 2 * MARGIN;

  // ---------- route arrows
  const router = makeRouter(W, H);
  for (const n of out.nodes) {
    router.block(n.x - 8, n.y - 8, n.w + 16, n.h + 16);
    if (n.lines.length) {
      const lw = Math.max(...n.lines.map(l => textWidth(l, fontPx)));
      router.block(n.x + n.w / 2 - lw / 2 - 4, n.y + n.h + 2, lw + 8, n.lines.length * lineH + 4);
    }
  }
  for (const g of out.groups) {
    const lw = textWidth(g.label || '', fontPx);
    if (g.preset.iconPos === 'top-center') router.block(g.x + g.w / 2 - Math.max(lw, 40) / 2 - 4, g.y, Math.max(lw, 40) + 8, 40 + lineH + 8);
    else {
      const lx = g.preset.icon ? g.x : (g.preset.labelAlign === 'center' ? g.x + g.w / 2 - lw / 2 - 8 : g.x + g.insetL - 4);
      const w = g.preset.icon ? g.insetL + lw + 8 : lw + 16;
      router.block(lx, g.y, w, 40);
    }
    if (g.cidr) { const cw = textWidth(g.cidr, fontPx); router.block(g.x + g.w - cw - 16, g.y, cw + 16, 40); }
    router.border(g.x, g.y, g.w, g.h);
  }
  const boxOf = id => {
    const n = out.nodes.find(x => x.id === id);
    if (n) return { ...n, labelBottom: n.y + n.h + 4 + n.lines.length * lineH };
    const g = out.groups.find(x => x.id === id);
    return g ? { x: g.x, y: g.y, w: g.w, h: g.h, labelBottom: g.y + g.h, group: true } : null;
  };
  // route shorter connections first: they get the clean, straight paths
  const edgeOrder = [...spec.edges].sort((a, b) => dist(boxOf(a.from), boxOf(a.to)) - dist(boxOf(b.from), boxOf(b.to)));
  const routed = new Map();
  for (const e of edgeOrder) {
    const pts = router.route(boxOf(e.from), boxOf(e.to), horiz);
    routed.set(e.id, pts);
  }
  for (const e of spec.edges) {
    const pts = routed.get(e.id);
    if (!pts) continue;
    let labelBox = null;
    if (e.label) {
      const w = wrapLabel(e.label, { fontPx, maxWidth: 160, maxLines: 2 });
      const s = longestSegment(pts);
      const bw = w.width + 8, bh = w.lines.length * lineH + 2;
      const vertical = s.a.x === s.b.x;
      const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
      // beside a vertical segment, above a horizontal one
      labelBox = vertical ? { x: mx + 6, y: my - bh / 2, w: bw, h: bh, lines: w.lines } : { x: mx - bw / 2, y: my - bh - 3, w: bw, h: bh, lines: w.lines };
      if (!vertical) labelBox.x = Math.max(labelBox.x, Math.min(s.a.x, s.b.x) + 4);
    }
    out.edges.push({ ...e, points: pts, labelBox });
  }

  // ---------- numbered callouts (slide 18)
  const C = G.callout[spec.calloutSize] || G.callout.large;
  const D = C.diameterPx;
  for (const n of out.nodes) if (n.step != null) out.callouts.push({ n: n.step, cx: n.x - D / 2 - 4, cy: n.y + 4, d: D, fontPx: C.fontSizePx });
  for (const e of out.edges) {
    if (e.step == null) continue;
    // on the first segment long enough to hold it, near the source
    const p = calloutPoint(e.points, D);
    out.callouts.push({ n: e.step, cx: p.x, cy: p.y, d: D, fontPx: C.fontSizePx });
  }
  // keep callouts on the canvas
  const minX = Math.min(MARGIN, ...out.callouts.map(c => c.cx - D / 2 - 8));
  if (minX < MARGIN) shift(out, MARGIN - minX, 0), (W += MARGIN - minX);

  // ---------- step legend (slide 21 example)
  if (spec.steps && Object.keys(spec.steps).length) {
    let y = H - MARGIN / 2;
    const x = MARGIN;
    const rows = Object.entries(spec.steps).map(([k, v]) => ({ n: Number(k), lines: greedyWrap(String(v), fontPx, 640) })).sort((a, b) => a.n - b.n);
    out.legend = rows.map(it => {
      const h = Math.max(D, it.lines.length * lineH);
      const row = { n: it.n, cx: x + D / 2, cy: y + D / 2, d: D, fontPx: C.fontSizePx, tx: x + D + 12, ty: y + (D - lineH) / 2, lines: it.lines };
      y += h + 10;
      return row;
    });
    H = y + MARGIN / 2;
    W = Math.max(W, x + D + 12 + Math.max(...rows.map(r => Math.max(...r.lines.map(l => textWidth(l, fontPx))))) + MARGIN);
  }
  out.width = Math.ceil(W);
  out.height = Math.ceil(H);
  return out;
}

const dist = (a, b) => Math.abs(a.x + a.w / 2 - b.x - b.w / 2) + Math.abs(a.y + a.h / 2 - b.y - b.h / 2);

function shift(out, dx, dy) {
  for (const g of out.groups) { g.x += dx; g.y += dy; }
  for (const n of out.nodes) { n.x += dx; n.y += dy; }
  for (const e of out.edges) { e.points = e.points.map(p => ({ x: p.x + dx, y: p.y + dy })); if (e.labelBox) { e.labelBox.x += dx; e.labelBox.y += dy; } }
  for (const c of out.callouts) { c.cx += dx; c.cy += dy; }
}

function longestSegment(pts) {
  let best = { a: pts[0], b: pts[1], L: -1 };
  for (let i = 1; i < pts.length; i++) {
    const L = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    if (L > best.L) best = { a: pts[i - 1], b: pts[i], L };
  }
  return best;
}

function calloutPoint(pts, D) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (L >= D + 24) {
      const t = Math.min(0.5, (D / 2 + 14) / L);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const s = longestSegment(pts);
  return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
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

// ---------------- orthogonal A* router on an 8px grid ----------------
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N

function makeRouter(W, H) {
  const cols = Math.ceil(W / GRID) + 1, rows = Math.ceil(H / GRID) + 1;
  const blocked = new Uint8Array(cols * rows);
  const borderCost = new Uint8Array(cols * rows);
  const usedH = new Uint8Array(cols * rows), usedV = new Uint8Array(cols * rows);
  const idx = (c, r) => r * cols + c;
  const cell = v => Math.round(v / GRID);

  function block(x, y, w, h) {
    const c0 = Math.max(0, Math.floor(x / GRID)), c1 = Math.min(cols - 1, Math.ceil((x + w) / GRID));
    const r0 = Math.max(0, Math.floor(y / GRID)), r1 = Math.min(rows - 1, Math.ceil((y + h) / GRID));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[idx(c, r)] = 1;
  }
  function border(x, y, w, h) {
    const c0 = cell(x), c1 = cell(x + w), r0 = cell(y), r1 = cell(y + h);
    for (let c = c0; c <= c1; c++) { borderCost[idx(c, r0)] = 1; borderCost[idx(c, r1)] = 1; }
    for (let r = r0; r <= r1; r++) { borderCost[idx(c0, r)] = 1; borderCost[idx(c1, r)] = 1; }
  }

  // ports: [x, y, dirIndex outward]
  function ports(b) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return [
      [b.x + b.w, cy, 0],
      [cx, b.group ? b.y + b.h : b.labelBottom + 4, 1],
      [b.x, cy, 2],
      [cx, b.y, 3],
    ];
  }

  function route(src, dst, horizFlow = true) {
    const sidePenalty = d => ((d % 2 === 0) === horizFlow ? 0 : 10);
    const BEND = 6, OVERLAP = 12, CROSS = 2, BORDER = 3, STUB = 2;
    const N = cols * rows;
    const g = new Float64Array(N * 4).fill(Infinity);
    const prev = new Int32Array(N * 4).fill(-1);
    const heap = new MinHeap();
    const goal = new Map(); // state cell -> {port, dir}
    const dstPorts = ports(dst);
    for (const [px, py, d] of dstPorts) {
      const sc = cell(px) + DIRS[d][0] * STUB, sr = cell(py) + DIRS[d][1] * STUB;
      if (sc < 0 || sr < 0 || sc >= cols || sr >= rows || blocked[idx(sc, sr)]) continue;
      goal.set(idx(sc, sr), { px, py, d, pen: sidePenalty(d) });
    }
    const gx = cell(dst.x + dst.w / 2), gy = cell(dst.y + dst.h / 2);
    const starts = [];
    for (const [px, py, d] of ports(src)) {
      const sc = cell(px) + DIRS[d][0] * STUB, sr = cell(py) + DIRS[d][1] * STUB;
      if (sc < 0 || sr < 0 || sc >= cols || sr >= rows || blocked[idx(sc, sr)]) continue;
      const s = idx(sc, sr) * 4 + d;
      g[s] = sidePenalty(d);
      heap.push(s, g[s] + Math.abs(sc - gx) + Math.abs(sr - gy));
      starts.push({ s, px, py, d });
    }
    let found = -1, foundCost = Infinity;
    while (heap.size) {
      const [s, f] = heap.pop();
      if (f >= foundCost) break;
      const ci = s >> 2, d = s & 3;
      const c = ci % cols, r = (ci / cols) | 0;
      if (goal.has(ci)) {
        const gd = goal.get(ci).d;
        // arriving direction must point into the target: opposite of the port's outward dir
        const extra = (d === (gd + 2) % 4 ? 0 : BEND * 2) + goal.get(ci).pen;
        if (g[s] + extra < foundCost) { foundCost = g[s] + extra; found = s; }
      }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const nc = c + DIRS[nd][0], nr = r + DIRS[nd][1];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = idx(nc, nr);
        if (blocked[ni] && !goal.has(ni)) continue;
        const horiz = nd % 2 === 0;
        let cost = 1 + (nd !== d ? BEND : 0);
        cost += (horiz ? usedH[ni] : usedV[ni]) ? OVERLAP : 0;
        cost += (horiz ? usedV[ni] : usedH[ni]) ? CROSS : 0;
        cost += borderCost[ni] ? BORDER : 0;
        const ns = ni * 4 + nd;
        const ng = g[s] + cost;
        if (ng < g[ns]) {
          g[ns] = ng; prev[ns] = s;
          heap.push(ns, ng + Math.abs(nc - gx) + Math.abs(nr - gy));
        }
      }
    }
    const cxy = i => ({ x: (i % cols) * GRID, y: ((i / cols) | 0) * GRID });
    if (found < 0) {
      // fallback: straight elbow between centers
      const a = { x: src.x + src.w, y: src.y + src.h / 2 }, b = { x: dst.x, y: dst.y + dst.h / 2 };
      const mx = (a.x + b.x) / 2;
      return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
    }
    const cells = [];
    for (let s = found; s >= 0; s = prev[s]) cells.push(s);
    cells.reverse();
    const start = starts.find(x => x.s === cells[0]);
    const gl = goal.get(found >> 2);
    // mark usage
    for (let i = 1; i < cells.length; i++) {
      const ci = cells[i] >> 2, d = cells[i] & 3;
      (d % 2 === 0 ? usedH : usedV)[ci] = 1;
    }
    const pts = [{ x: start.px, y: start.py }, ...cells.map(s => cxy(s >> 2)), { x: gl.px, y: gl.py }];
    return simplify(snapPorts(pts));
  }
  return { block, border, route };
}

// the first/last grid point must line up with the (possibly off-grid) port
function snapPorts(pts) {
  const n = pts.length;
  const fix = (port, next) => {
    if (Math.abs(port.x - next.x) < Math.abs(port.y - next.y)) next.x = port.x; else next.y = port.y;
  };
  if (n > 2) { fix(pts[0], pts[1]); fix(pts[n - 1], pts[n - 2]); }
  // propagate the snapped coordinate along the straight stub
  for (let i = 2; i < n - 1; i++) {
    if (pts[i - 1].x === pts[0].x && Math.abs(pts[i].x - pts[0].x) < GRID && pts[i].y !== pts[i - 1].y) pts[i].x = pts[0].x; else break;
  }
  return pts;
}

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const q = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    const a = out[out.length - 2], b = out[out.length - 1];
    if (b && b.x === q.x && b.y === q.y) continue;
    if (a && b && ((a.x === b.x && b.x === q.x) || (a.y === b.y && b.y === q.y))) out[out.length - 1] = q;
    else out.push(q);
  }
  return out;
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p;
    let i = K.length; K.push(k); P.push(p);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (P[j] <= p) break;
      K[i] = K[j]; P[i] = P[j]; i = j;
    }
    K[i] = k; P[i] = p;
  }
  pop() {
    const K = this.k, P = this.p;
    const top = [K[0], P[0]];
    const k = K.pop(), p = P.pop();
    if (K.length) {
      let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, m = i;
        let mp = p;
        if (l < K.length && P[l] < mp) { m = l; mp = P[l]; }
        if (r < K.length && P[r] < mp) { m = r; mp = P[r]; }
        if (m === i) break;
        K[i] = K[m]; P[i] = P[m]; i = m;
      }
      K[i] = k; P[i] = p;
    }
    return top;
  }
}
