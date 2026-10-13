/**
 * The plan reader's ruler numbers ("0.0" … "1.0", `planVision.ts`) as SVG paths rather than
 * `<text>`. sharp draws an SVG through librsvg, which finds fonts through fontconfig — and a
 * Vercel function has no system fonts, so `<text>` came out as nothing there: the lines without
 * their numbers, on the image the prompt tells the model to read the ruler from. Ten digits and a
 * point, drawn as strokes on a 6 × 10 box, need no font and look the same on every server.
 */

/** Each glyph's stroke, in a box 6 wide and 10 high (y down). */
const GLYPHS: Record<string, string> = {
  '0': 'M3 0Q1 0 1 3L1 7Q1 10 3 10Q5 10 5 7L5 3Q5 0 3 0Z',
  '1': 'M1.6 2L3.4 0L3.4 10M1.6 10L5.2 10',
  '2': 'M1 2.2Q1.2 0 3 0Q5 0 5 2.4Q5 4.2 3.2 6L1 10L5.2 10',
  '3': 'M1 1Q2 0 3 0Q5 0 5 2.4Q5 4.8 2.4 4.9Q5.2 5 5.2 7.5Q5 10 3 10Q1.6 10 0.8 9',
  '4': 'M4 10L4 0L0.8 7L5.4 7',
  '5': 'M5 0L1.4 0L1 4.6Q2 3.9 3 3.9Q5.2 4 5.2 6.9Q5 10 3 10Q1.6 10 0.8 9.2',
  '6': 'M4.6 0.6Q4 0 3 0Q1 0 1 4L1 7Q1 10 3 10Q5 10 5 7.4Q5 4.8 3 4.8Q1.6 4.8 1 6',
  '7': 'M0.8 0L5.2 0L2.4 10',
  '8': 'M3 4.8Q1.1 4.6 1.1 2.4Q1.1 0 3 0Q4.9 0 4.9 2.4Q4.9 4.6 3 4.8Q1 5 1 7.4Q1 10 3 10Q5 10 5 7.4Q5 5 3 4.8Z',
  '9': 'M1.4 9.4Q2 10 3 10Q5 10 5 6L5 3Q5 0 3 0Q1 0 1 2.6Q1 5.2 3 5.2Q4.4 5.2 5 4',
};
const DIGIT_ADVANCE = 6.8;
const POINT_ADVANCE = 3.4;

const advanceOf = (ch: string) => (ch === '.' ? POINT_ADVANCE : DIGIT_ADVANCE);

/**
 * `text` as SVG elements, `size` px tall, its baseline at `y`, anchored at `x` like
 * `text-anchor` (`middle` or `end`). Characters other than digits and a point are left out.
 */
export function rulerLabel(text: string, x: number, y: number, anchor: 'middle' | 'end', size: number, color: string): string {
  const scale = size / 10;
  const chars = [...text].filter((ch) => ch === '.' || ch in GLYPHS);
  const width = chars.reduce((sum, ch) => sum + advanceOf(ch), 0) * scale;
  let cursor = anchor === 'middle' ? x - width / 2 : x - width;
  const top = y - size;
  const parts: string[] = [];
  for (const ch of chars) {
    if (ch === '.') {
      parts.push(`<circle cx="${(cursor + 1.6 * scale).toFixed(2)}" cy="${(top + 9.2 * scale).toFixed(2)}" r="${(0.9 * scale).toFixed(2)}" fill="${color}"/>`);
    } else {
      parts.push(
        `<path d="${GLYPHS[ch]}" transform="translate(${cursor.toFixed(2)} ${top.toFixed(2)}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${(1.3 / scale).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
    cursor += advanceOf(ch) * scale;
  }
  return parts.join('');
}
