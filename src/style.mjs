// Resolve guideline styles (theme colors, group strokes/icons) for renderers.
import path from 'node:path';
import { guide, iconFile, groupIconFile, ROOT } from './catalog.mjs';

export function themeOf(spec) {
  const G = guide();
  const t = { ...G.themes[spec.theme] };
  if (spec.profile === 'training') {
    // deck slide 13: white background, black type 16pt, lines 2pt
    Object.assign(t, G.themes.light, { lineWidth: 2 * G.units.pxPerPt });
  }
  t.lineWidth ??= G.arrow.strokeWidthPx;
  t.groupLineWidth = spec.profile === 'training' ? t.lineWidth : G.group.strokeWidthPx;
  t.name = spec.theme;
  return t;
}

export function groupStyle(g, theme) {
  const G = guide();
  const p = g.preset;
  let stroke = p.stroke;
  if (stroke?.startsWith('theme:')) stroke = theme[stroke.slice(6)];
  if (stroke === 'category:service') stroke = g.service?.categoryColor || '#7D8998';
  let icon = null;
  if (p.icon) {
    if (p.icon.startsWith('theme:')) icon = groupIconFile(theme[p.icon.slice(6)]);
    else if (p.icon === 'service32:service') icon = g.service ? path.join(ROOT, g.service.icon32) : null;
    else if (p.icon.startsWith('service32:')) icon = svc32(p.icon.slice(10));
    else icon = groupIconFile(p.icon);
  }
  const dash = p.dash ? G.group.dash[p.dash] : null;
  return { stroke, dash, dashName: p.dash, icon, iconPos: p.iconPos || 'top-left', labelAlign: p.labelAlign || 'left' };
}

import { resolveIcon } from './catalog.mjs';
function svc32(id) {
  const e = resolveIcon(id);
  return e?.icon32 ? path.join(ROOT, e.icon32) : null;
}

export function nodeIcon(n, theme) {
  return iconFile(n.entry, theme.iconVariant || 'light');
}

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
