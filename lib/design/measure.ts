/**
 * Reads the dimension strings printed on a floor plan.
 *
 * These are the only exact numbers on the drawing — everything else is pixels and inference —
 * so getting them right is what separates a plan that is inch-perfect from one that is merely
 * plausible. Georgian plans are usually metric, but plans drawn for or by international
 * offices are routinely in feet and inches, and both turn up in the same inbox.
 *
 * Pure and dependency-free.
 */

/** Metres per unit, for the units that appear on architectural drawings. */
const METRES_PER = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
} as const;

export type LengthUnit = keyof typeof METRES_PER;

export interface ParsedLength {
  metres: number;
  /** The unit the drawing actually used, so the UI can echo it back the same way. */
  unit: LengthUnit;
  /** The string this came from, kept for display and for debugging a bad read. */
  source: string;
}

/**
 * Parses one dimension label into metres.
 *
 * Handles the shapes that actually appear on drawings:
 *
 *   18' 3"    18'-3"    18ft 3in    18'      → feet and inches
 *   3.5 m     3,5м      350 cm      3500mm   → metric, comma or point decimal
 *   4.25      → bare number, interpreted with `fallbackUnit`
 *
 * Returns null rather than guessing when the string is not a length at all, which matters
 * because a vision model will occasionally hand back a room name in a dimension field.
 */
export function parseLength(input: string, fallbackUnit: LengthUnit = 'm'): ParsedLength | null {
  const source = input.trim();
  if (!source) return null;

  // Normalise the punctuation drawings use: typographic quotes, comma decimals, NBSP.
  const text = source
    .replace(/[‘’ʹ′]/g, "'")
    .replace(/[“”ʺ″]/g, '"')
    .replace(/ /g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .toLowerCase();

  // --- feet and inches, the compound case ---
  const feetInches = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:-|\s)?\s*(\d+(?:\.\d+)?)\s*(?:"|in|inch(?:es)?)?$/);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = Number(feetInches[2]);
    if (Number.isFinite(feet) && Number.isFinite(inches)) {
      return { metres: feet * METRES_PER.ft + inches * METRES_PER.in, unit: 'ft', source };
    }
  }

  // --- a single value with a unit ---
  const single = text.match(
    /^(-?\d+(?:\.\d+)?)\s*(мм|см|м|mm|cm|m|in|inch(?:es)?|ft|feet|'|")$/
  );
  if (single) {
    const value = Number(single[1]);
    const unit = normaliseUnit(single[2]);
    if (Number.isFinite(value) && unit) {
      return { metres: value * METRES_PER[unit], unit, source };
    }
  }

  // --- a bare number ---
  const bare = text.match(/^(-?\d+(?:\.\d+)?)$/);
  if (bare) {
    const value = Number(bare[1]);
    if (Number.isFinite(value)) {
      return { metres: value * METRES_PER[fallbackUnit], unit: fallbackUnit, source };
    }
  }

  return null;
}

/** Square metres per unit of area. */
const M2_PER_FT2 = 0.09290304;

/**
 * Parses a printed floor area into square metres: "10.8 m²", "10,8 მ2", "48.4 кв.м", "116 sq ft",
 * "116 SF"; a bare number is read in `fallbackUnit`. Null when the string is not an area — a
 * length ("3.5 m") is not one, so a size put in the wrong field is not taken for an area.
 */
export function parseArea(input: string, fallbackUnit: 'm2' | 'ft2' = 'm2'): number | null {
  const text = input
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .toLowerCase();
  if (!text) return null;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].replace(/[\s.]/g, '');
  if (unit === '') return value * (fallbackUnit === 'ft2' ? M2_PER_FT2 : 1);
  if (/^(m2|m²|м2|м²|მ2|მ²|sqm|sqmeters?|sqmetres?|квм|кв\/м|კვმ|m\^2)$/.test(unit)) return value;
  if (/^(sqft|sf|ft2|ft²|sqfeet|sqfoot|ft\^2)$/.test(unit)) return value * M2_PER_FT2;
  return null;
}

function normaliseUnit(token: string): LengthUnit | null {
  switch (token) {
    case 'мм':
    case 'mm':
      return 'mm';
    case 'см':
    case 'cm':
      return 'cm';
    case 'м':
    case 'm':
      return 'm';
    case 'in':
    case 'inch':
    case 'inches':
    case '"':
      return 'in';
    case 'ft':
    case 'feet':
    case "'":
      return 'ft';
    default:
      return null;
  }
}

/**
 * Which unit system a set of labels is written in.
 *
 * Used to decide how to interpret bare numbers, and to echo dimensions back in the units the
 * drawing used rather than converting everything to metres in the UI.
 */
export function detectUnitSystem(labels: string[]): 'imperial' | 'metric' {
  let imperial = 0;
  let metric = 0;

  for (const label of labels) {
    const parsed = parseLength(label);
    if (!parsed) continue;
    if (parsed.unit === 'ft' || parsed.unit === 'in') imperial++;
    else metric++;
  }
  return imperial > metric ? 'imperial' : 'metric';
}

/** Formats metres back into the drawing's own units, for echoing a dimension in the UI. */
export function formatLength(metres: number, system: 'imperial' | 'metric'): string {
  if (system === 'imperial') {
    const totalInches = metres / METRES_PER.in;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches - feet * 12);
    // 11.6" rounds to 12", which is a foot.
    return inches === 12 ? `${feet + 1}' 0"` : `${feet}' ${inches}"`;
  }
  return `${metres.toFixed(2)} მ`;
}
