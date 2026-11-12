// Render a laid-out diagram to an editable draw.io (.drawio) file.
// Official icons are embedded as SVG images (draw.io's "data:image/svg+xml,<base64>" form),
// groups are real containers (moving a group moves its children), edges keep their
// orthogonal waypoints.
import { svgBase64 } from './catalog.mjs';
import { themeOf, groupStyle, nodeIcon, esc } from './style.mjs';

const r = v => Math.round(v * 100) / 100;
const imgStyle = file => `image=data:image/svg+xml,${svgBase64(file)}`;

export function renderDrawio(spec, L) {
  const T = themeOf(spec);
  const font = `fontFamily=Arial;fontSize=${r(L.fontPx)};fontColor=${T.text};`;
  const cells = [];
  const abs = new Map(); // id -> absolute {x,y}
  const parentOf = new Map([...L.groups, ...L.nodes].map(i => [i.id, i.parent || null]));
  const cellId = id => `c-${id}`;
  const parentCell = id => (parentOf.get(id) ? cellId(parentOf.get(id)) : '1');
  const rel = (id, x, y) => {
    const p = parentOf.get(id);
    if (!p) return { x, y };
    const a = abs.get(p);
    return { x: x - a.x, y: y - a.y };
  };
  const vertex = (id, parent, value, style, x, y, w, h) =>
    cells.push(`<mxCell id="${esc(id)}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="${esc(parent)}"><mxGeometry x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" as="geometry"/></mxCell>`);

  for (const g of L.groups) abs.set(g.id, { x: g.x, y: g.y });

  // groups, outer first so parents exist before children
  for (const g of [...L.groups].sort((a, b) => a.depth - b.depth)) {
    const S = groupStyle(g, T);
    const p = rel(g.id, g.x, g.y);
    const dash = S.dash ? `dashed=1;dashPattern=${S.dashName === 'sysDash' ? '3 1' : '4 3'};` : 'dashed=0;';
    let lab;
    if (S.icon && S.iconPos === 'top-center') lab = `align=center;verticalAlign=top;spacingTop=${40 + 2};`;
    else if (S.icon) lab = `align=left;verticalAlign=top;spacingLeft=${g.insetL - 2};spacingTop=8;`;
    else if (S.labelAlign === 'center') lab = 'align=center;verticalAlign=top;spacingTop=8;';
    else lab = `align=left;verticalAlign=top;spacingLeft=${g.insetL - 2};spacingTop=8;`;
    const style = `rounded=0;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;pointerEvents=0;fillColor=none;strokeColor=${S.stroke};strokeWidth=${r(T.groupLineWidth)};${dash}${lab}${font}awsGroup=${g.type};`;
    vertex(cellId(g.id), parentCell(g.id), g.label || '', style, p.x, p.y, g.w, g.h);
    if (S.icon) {
      const ix = S.iconPos === 'top-center' ? (g.w - 40) / 2 : 0;
      vertex(`${cellId(g.id)}-icon`, cellId(g.id), '', `shape=image;html=1;imageAspect=0;aspect=fixed;resizable=0;movable=0;rotatable=0;deletable=0;connectable=0;${imgStyle(S.icon)};`, ix, 0, 40, 40);
    }
    if (g.cidr) vertex(`${cellId(g.id)}-cidr`, cellId(g.id), g.cidr, `text;html=1;align=right;verticalAlign=top;spacingTop=6;connectable=0;resizable=0;${font}`, g.w - 170, 0, 160, 30);
  }

  // icons
  for (const n of L.nodes) {
    const p = rel(n.id, n.x, n.y);
    const style = `shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;spacingTop=0;imageAspect=0;aspect=fixed;resizable=0;${font}${imgStyle(nodeIcon(n, T))};awsIcon=${n.entry.id};`;
    vertex(cellId(n.id), parentCell(n.id), n.lines.map(esc).join('<br>'), style, p.x, p.y, n.w, n.h);
  }

  // edges (layer root, absolute waypoints)
  const box = id => {
    const n = L.nodes.find(x => x.id === id);
    if (n) return { x: n.x, y: n.y, w: n.w, h: n.h };
    const g = L.groups.find(x => x.id === id);
    return g ? { x: g.x, y: g.y, w: g.w, h: g.h } : null;
  };
  const anchor = (b, p) => `${r((p.x - b.x) / b.w)}`.concat('|', `${r((p.y - b.y) / b.h)}`);
  for (const e of L.edges) {
    const s = e.points[0], t = e.points[e.points.length - 1];
    const sb = box(e.from), tb = box(e.to);
    const [ex, ey] = anchor(sb, s).split('|'), [nx, ny] = anchor(tb, t).split('|');
    const endA = e.arrow === 'end' || e.arrow === 'both' ? 'open' : 'none';
    const startA = e.arrow === 'start' || e.arrow === 'both' ? 'open' : 'none';
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${T.line};strokeWidth=${r(T.lineWidth)};endArrow=${endA};endFill=0;startArrow=${startA};startFill=0;endSize=6;startSize=6;exitX=${ex};exitY=${ey};exitDx=0;exitDy=0;exitPerimeter=0;entryX=${nx};entryY=${ny};entryDx=0;entryDy=0;entryPerimeter=0;labelBackgroundColor=${T.background};${font}`;
    const bends = e.points.slice(1, -1).map(p => `<mxPoint x="${r(p.x)}" y="${r(p.y)}"/>`).join('');
    const value = e.labelBox ? e.labelBox.lines.map(esc).join('<br>') : '';
    cells.push(`<mxCell id="${esc(cellId(e.id))}" value="${esc(value)}" style="${esc(style)}" edge="1" parent="1" source="${esc(cellId(e.from))}" target="${esc(cellId(e.to))}"><mxGeometry relative="1" as="geometry"><Array as="points">${bends}</Array></mxGeometry></mxCell>`);
  }

  // callouts + legend
  const cstyle = c => `ellipse;html=1;aspect=fixed;resizable=0;fillColor=${T.calloutFill};strokeColor=none;fontColor=${T.calloutText};fontStyle=1;fontFamily=Arial;fontSize=${r(c.fontPx)};verticalAlign=middle;align=center;spacing=0;awsCallout=1;`;
  L.callouts.forEach((c, i) => vertex(`callout-${i}`, '1', String(c.n), cstyle(c), c.cx - c.d / 2, c.cy - c.d / 2, c.d, c.d));
  (L.legend || []).forEach((row, i) => {
    vertex(`legend-${i}`, '1', String(row.n), cstyle(row), row.cx - row.d / 2, row.cy - row.d / 2, row.d, row.d);
    vertex(`legend-${i}-text`, '1', row.lines.map(esc).join('<br>'), `text;html=1;align=left;verticalAlign=top;spacing=0;${font}`, row.tx, row.ty, Math.max(...row.lines.map(l => l.length)) * L.fontPx * 0.55 + 10, row.lines.length * L.lineH);
  });

  const name = esc(spec.title || 'AWS architecture');
  return `<mxfile host="aws-architecture-draw" type="device">
  <diagram id="aws-arch" name="${name}">
    <mxGraphModel dx="${L.width}" dy="${L.height}" grid="1" gridSize="8" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${L.width}" pageHeight="${L.height}" background="${T.background}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}
