// Render a laid-out diagram to SVG (official icons embedded as base64 SVG images).
import { svgBase64 } from './catalog.mjs';
import { textWidth } from './text.mjs';
import { themeOf, groupStyle, nodeIcon, esc } from './style.mjs';

const r = v => Math.round(v * 100) / 100;

export function renderSvg(spec, L) {
  const T = themeOf(spec);
  const F = `font-family="Arial, Helvetica, sans-serif"`;
  const asc = L.fontPx * 0.905; // Arial ascent
  const img = (file, x, y, s) => `<image x="${r(x)}" y="${r(y)}" width="${s}" height="${s}" href="data:image/svg+xml;base64,${svgBase64(file)}"/>`;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}">`);
  if (spec.title) out.push(`<title>${esc(spec.title)}</title>`);
  // open arrow head ("Open Arrow", med width, small length) drawn as a stroke, not a filled triangle
  const hw = 4.5, hl = 6;
  out.push(`<defs>
  <marker id="arrow-end" viewBox="0 0 ${hl + 2} ${hw * 2 + 2}" refX="${hl + 0.5}" refY="${hw + 1}" markerWidth="${hl + 2}" markerHeight="${hw * 2 + 2}" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M1,1 L${hl + 0.5},${hw + 1} L1,${hw * 2 + 1}" fill="none" stroke="${T.line}" stroke-width="${r(T.lineWidth)}" stroke-linejoin="miter"/>
  </marker>
  <marker id="arrow-start" viewBox="0 0 ${hl + 2} ${hw * 2 + 2}" refX="${hl + 0.5}" refY="${hw + 1}" markerWidth="${hl + 2}" markerHeight="${hw * 2 + 2}" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
    <path d="M1,1 L${hl + 0.5},${hw + 1} L1,${hw * 2 + 1}" fill="none" stroke="${T.line}" stroke-width="${r(T.lineWidth)}" stroke-linejoin="miter"/>
  </marker>
</defs>`);
  out.push(`<rect width="100%" height="100%" fill="${T.background}"/>`);

  // groups: outer first
  for (const g of [...L.groups].sort((a, b) => a.depth - b.depth)) {
    const S = groupStyle(g, T);
    const dash = S.dash ? ` stroke-dasharray="${S.dash.join(' ')}"` : '';
    out.push(`<g id="group-${esc(g.id)}">`);
    out.push(`<rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.w)}" height="${r(g.h)}" fill="none" stroke="${S.stroke}" stroke-width="${r(T.groupLineWidth)}"${dash}/>`);
    const GI = 40;
    let ly = g.y + 10 + asc, lx, anchor = 'start';
    if (S.icon && S.iconPos === 'top-center') {
      out.push(img(S.icon, g.x + (g.w - GI) / 2, g.y, GI));
      lx = g.x + g.w / 2; anchor = 'middle'; ly = g.y + GI + 4 + asc;
    } else if (S.icon) {
      out.push(img(S.icon, g.x, g.y, GI));
      lx = g.x + g.insetL;
    } else if (S.labelAlign === 'center') {
      lx = g.x + g.w / 2; anchor = 'middle';
    } else lx = g.x + g.insetL;
    if (g.label) out.push(`<text x="${r(lx)}" y="${r(ly)}" ${F} font-size="${r(L.fontPx)}" fill="${T.text}" text-anchor="${anchor}">${esc(g.label)}</text>`);
    if (g.cidr) out.push(`<text x="${r(g.x + g.w - 10)}" y="${r(g.y + 10 + asc)}" ${F} font-size="${r(L.fontPx)}" fill="${T.text}" text-anchor="end">${esc(g.cidr)}</text>`);
    out.push(`</g>`);
  }

  // edges
  for (const e of L.edges) {
    const d = e.points.map((p, i) => `${i ? 'L' : 'M'}${r(p.x)},${r(p.y)}`).join(' ');
    const me = e.arrow === 'end' || e.arrow === 'both' ? ' marker-end="url(#arrow-end)"' : '';
    const ms = e.arrow === 'start' || e.arrow === 'both' ? ' marker-start="url(#arrow-start)"' : '';
    out.push(`<path d="${d}" fill="none" stroke="${T.line}" stroke-width="${r(T.lineWidth)}"${me}${ms}/>`);
    if (e.labelBox) {
      const b = e.labelBox;
      out.push(`<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" fill="${T.background}"/>`);
      b.lines.forEach((l, i) => out.push(`<text x="${r(b.x + b.w / 2)}" y="${r(b.y + 1 + i * L.lineH + asc)}" ${F} font-size="${r(L.fontPx)}" fill="${T.text}" text-anchor="middle">${esc(l)}</text>`));
    }
  }

  // icons + labels
  for (const n of L.nodes) {
    out.push(`<g id="node-${esc(n.id)}">`);
    out.push(img(nodeIcon(n, T), n.x, n.y, n.w));
    n.lines.forEach((l, i) => out.push(`<text x="${r(n.x + n.w / 2)}" y="${r(n.y + n.h + 4 + i * L.lineH + asc)}" ${F} font-size="${r(L.fontPx)}" fill="${T.text}" text-anchor="middle">${esc(l)}</text>`));
    out.push(`</g>`);
  }

  // callouts (on top)
  const callout = c => `<circle cx="${r(c.cx)}" cy="${r(c.cy)}" r="${r(c.d / 2)}" fill="${T.calloutFill}"/>` +
    `<text x="${r(c.cx)}" y="${r(c.cy + c.fontPx * 0.36)}" ${F} font-size="${r(c.fontPx)}" font-weight="bold" fill="${T.calloutText}" text-anchor="middle">${c.n}</text>`;
  for (const c of L.callouts) out.push(callout(c));
  for (const row of L.legend || []) {
    out.push(callout(row));
    row.lines.forEach((l, i) => out.push(`<text x="${r(row.tx)}" y="${r(row.ty + i * L.lineH + asc)}" ${F} font-size="${r(L.fontPx)}" fill="${T.text}">${esc(l)}</text>`));
  }
  out.push('</svg>');
  return out.join('\n');
}

export { textWidth };
