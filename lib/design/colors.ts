/**
 * Colour families for the furniture shelf's colour filter.
 *
 * A catalogue of two hundred models has nearly as many hex values, and nobody filters by
 * `#C8B79A`. So a product's colours (`products.colorHex`, and `specs.colors` when a piece is
 * really two — an oak frame under white linen) are each read as one of a dozen families a
 * person would actually name, and the shelf offers the families that are on it as swatches.
 *
 * The rules work on hue, lightness and **chroma** (max − min), not HSL saturation: HSL's
 * saturation races to 1 as a colour nears white, so a pale peach wood read as a vivid orange.
 * Pure arithmetic, no DOM — the scripts that read colours off the models use it too.
 */

export const COLOR_FAMILIES = [
  { id: 'white', hex: '#FFFFFF' },
  { id: 'beige', hex: '#E3D3B8' },
  { id: 'grey', hex: '#9B9B9B' },
  { id: 'black', hex: '#1F1F1F' },
  { id: 'brown', hex: '#7A5230' },
  { id: 'red', hex: '#C8372D' },
  { id: 'pink', hex: '#F2A7B0' },
  { id: 'orange', hex: '#E8852C' },
  { id: 'yellow', hex: '#EBC83A' },
  { id: 'green', hex: '#4E9A51' },
  { id: 'blue', hex: '#3B78C4' },
  { id: 'purple', hex: '#8B5FBF' },
] as const;

export type ColorFamily = (typeof COLOR_FAMILIES)[number]['id'];

/** `#RGB` or `#RRGGBB` → 0–255 channels; null for anything else. */
export function parseHex(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** The family a colour belongs to, from 0–255 channels. */
export function familyOfRgb(r: number, g: number, b: number): ColorFamily {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const chroma = max - min;
  const light = (max + min) / 2;

  // Nothing of a hue about it — or so pale that whatever hue it has is a tint of white.
  if (chroma < 0.08 || (light > 0.9 && chroma < 0.12)) return light > 0.85 ? 'white' : light < 0.22 ? 'black' : 'grey';

  let hue: number;
  if (max === r / 255) hue = ((g - b) / 255 / chroma) % 6;
  else if (max === g / 255) hue = (b - r) / 255 / chroma + 2;
  else hue = (r - g) / 255 / chroma + 4;
  hue = (hue * 60 + 360) % 360;

  // Reds: pale is pink, dark and dull is the brown of cognac leather and brick.
  if (hue < 15 || hue >= 345) return light > 0.7 ? 'pink' : light < 0.45 && chroma < 0.5 ? 'brown' : 'red';
  // The woods and the leathers: a dull warm colour is beige when light and brown when not;
  // only a vivid one is orange.
  if (hue < 42) {
    if (chroma < 0.35) return light > 0.62 ? 'beige' : 'brown';
    return light < 0.45 ? 'brown' : 'orange';
  }
  if (hue < 70) {
    if (chroma < 0.3) return light > 0.62 ? 'beige' : light < 0.35 ? 'brown' : 'yellow';
    return light < 0.3 ? 'brown' : 'yellow';
  }
  if (hue < 185) return 'green'; // teal reads as a green, not as a blue
  if (hue < 260) return 'blue';
  if (hue < 300) return 'purple';
  return light < 0.4 ? 'purple' : 'pink';
}

/** The family of a hex colour, or null when it is not one. */
export function colorFamily(hex: string | null | undefined): ColorFamily | null {
  const rgb = parseHex(hex);
  return rgb ? familyOfRgb(rgb[0], rgb[1], rgb[2]) : null;
}

/**
 * Every colour a product is known by: `specs.colors` (read off its model, the largest
 * first) when it has them, its one `colorHex` otherwise.
 */
export function productColors(product: { colorHex?: string | null; specs?: unknown }): string[] {
  const specs = product.specs && typeof product.specs === 'object' ? (product.specs as { colors?: unknown }) : null;
  const listed = Array.isArray(specs?.colors) ? specs.colors.filter((c): c is string => typeof c === 'string' && parseHex(c) !== null) : [];
  if (listed.length > 0) return listed;
  return product.colorHex && parseHex(product.colorHex) ? [product.colorHex] : [];
}

/** The families a product can be found under, the dominant one first, none repeated. */
export function productColorFamilies(product: { colorHex?: string | null; specs?: unknown }): ColorFamily[] {
  const out: ColorFamily[] = [];
  for (const hex of productColors(product)) {
    const family = colorFamily(hex);
    if (family && !out.includes(family)) out.push(family);
  }
  return out;
}
