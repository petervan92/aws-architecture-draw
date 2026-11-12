// Text measurement (Arial metrics) and label wrapping per the AWS guideline (deck slide 17):
//  - at most 2 lines, never break mid-word
//  - "AWS"/"Amazon" stays on the same line as the first word of the service name
//  - preferably break after the second word

// Arial / Helvetica advance widths for ASCII 32..126, in 1/1000 em.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // ' '..'/'
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0..?
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @..O
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P.._
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // `..o
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,      // p..~
];

export function textWidth(str, fontPx, bold = false) {
  let w = 0;
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    w += c >= 32 && c <= 126 ? W[c - 32] : 600; // non-ASCII (e.g. Vietnamese): rough estimate
  }
  return (w / 1000) * fontPx * (bold ? 1.06 : 1);
}

const VENDOR = new Set(['AWS', 'Amazon']);

/**
 * Wrap a label into <= maxLines lines of <= maxWidth px.
 * Returns { lines, width, fits } (fits=false when the guideline cannot be met).
 * Explicit "\n" in the label is respected as a forced break.
 */
export function wrapLabel(text, { fontPx = 16, maxWidth = 140, maxLines = 2 } = {}) {
  text = String(text ?? '').trim();
  if (!text) return { lines: [], width: 0, fits: true };
  const measure = l => textWidth(l, fontPx);
  if (text.includes('\n')) {
    const lines = text.split('\n').map(s => s.trim());
    const width = Math.max(...lines.map(measure));
    return { lines, width, fits: lines.length <= maxLines && width <= maxWidth };
  }
  if (measure(text) <= maxWidth) return { lines: [text], width: measure(text), fits: true };

  const words = text.split(/\s+/);
  if (words.length === 1) return { lines: [text], width: measure(text), fits: false };

  // candidate break positions (break before words[i])
  const cands = [];
  for (let i = 1; i < words.length; i++) {
    if (VENDOR.has(words[i - 1]) && i === 1) continue; // keep "AWS"/"Amazon" with next word
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const wa = measure(a), wb = measure(b);
    const fits = wa <= maxWidth && wb <= maxWidth;
    // prefer: fits, then break after the 2nd word, then balanced
    const score = (fits ? 0 : 10000) + (i === 2 ? 0 : 50) + Math.abs(wa - wb) / 10 + Math.max(wa, wb) / 100;
    cands.push({ lines: [a, b], width: Math.max(wa, wb), fits, score });
  }
  // no allowed break (e.g. "Amazon CloudFront"): one line is what the guideline asks for
  if (!cands.length) return { lines: [text], width: measure(text), fits: measure(text) <= maxWidth * 1.5 };
  cands.sort((x, y) => x.score - y.score);
  const best = cands[0];
  if (best.fits || maxLines <= 2) return { lines: best.lines, width: best.width, fits: best.fits };
  return best;
}
