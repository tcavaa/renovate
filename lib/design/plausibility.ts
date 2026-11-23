/**
 * What a product of a kind can be — the sizes a floor lamp, a wardrobe, a door mat… cannot fall
 * outside, and the names that say a product is something else than the kind it is filed under
 * (the owner's decision 9, 23 Nov 2026: both — the team corrects kinds and sizes in admin, from a
 * list the app gives, and generation refuses implausible products).
 *
 * Each kind has two sets of checks (`KIND_BOUNDS`):
 *
 * - `refuse` — generation never takes a product that fails them (`isPlausibleForGeneration`, read
 *   by the matcher's pools, `kindPool`). The product stays in the catalogue, in admin and in the
 *   studio's swap list.
 * - `list` — only listed for the team (`pnpm audit:catalog-kinds`): refusing these would leave
 *   rooms worse than the product does — a check that `pnpm audit:generation` showed costs rooms
 *   their piece, or more clashes, until the catalogue has the products to replace them.
 *
 * The bounds are wide on purpose: they keep out what cannot be the kind (a 30 cm "floor lamp", a
 * 2 m door mat, a 6.9 m wardrobe), not what is merely unusual — a narrow wardrobe, a small round
 * dining table for four. Each was checked against the fixture catalogue (tests/fixtures/generation)
 * and against `pnpm audit:generation` (generation-audit.md, K1–K4). Pure data and pure functions.
 */

import type { CatalogProduct } from './matcher';

/** A range in metres; either end may be open. */
export interface Range {
  min?: number;
  max?: number;
}

export interface SizeChecks {
  /** Each of the product's own sizes (width, depth, height — `widthCm`…), metres. */
  width?: Range;
  depth?: Range;
  height?: Range;
  /** The longer of width and depth: a table or a rug whose two sides were entered the other way round still counts. */
  longSide?: Range;
  /** A name that says the product is something else (tall kitchen units filed as a kitchen run). */
  misfiled?: RegExp;
}

export interface KindBounds {
  /** What generation refuses. */
  refuse?: SizeChecks;
  /** What is only listed for the team. */
  list?: SizeChecks;
}

/**
 * The bounds per kind, metres. A kind not listed has none: generation takes every product of it.
 */
export const KIND_BOUNDS: Readonly<Record<string, KindBounds>> = {
  // A floor lamp stands 1.2–2.1 m; 11 of the catalogue's 23 are table lamps of 0.29–0.9 m (K1).
  floor_lamp: { refuse: { height: { min: 1.2, max: 2.4 } }, list: { misfiled: /\btable lamp\b|\bdesk lamp\b/i } },
  // A wardrobe is a person's height or more and at most a wall long: the cabinets of 1.35–1.45 m
  // filed as wardrobes (one a 38 cm column taken for the bedroom's wardrobe in a quarter of the
  // fixture flats) and a 6.88 m "system" are not one (K1, K2). A 35–40 cm deep one is a shallow
  // wardrobe, kept.
  wardrobe: { refuse: { height: { min: 1.6, max: 3 }, width: { min: 0.4, max: 4 } } },
  // A single bed is one a grown-up sleeps in: 80 cm wide and 1.8 m long or more. Of the six filed
  // single, a 54 × 122 cm one is not to scale, a 1.31 × 1.66 m daybed is a sofa's length and a
  // 1.97 m × 85 cm day bed is modelled sideways (RB5); the three left (90 × 200, a bunk, a child's
  // house bed) are what a bedroom under 11 m² is given (decision 3.2), any style's when its own has none.
  bed_single: { refuse: { width: { min: 0.8 }, depth: { min: 1.8 } } },
  // A door mat is under 1.2 m either way (five of six are filed 2.03 × 1.27 m, K2). No least size
  // refused: the one left is filed 15 × 11 cm, and with a least size no hall would have a mat.
  door_mat: { refuse: { longSide: { max: 1.2 } }, list: { longSide: { min: 0.3 } } },
  // A rug is 0.6–4 m on its longer side: a 29 cm "rug" is a coaster's size, two filed 9.6 × 12 m
  // were entered in the wrong unit.
  rug: { refuse: { longSide: { min: 0.6, max: 4 } } },
  // A pendant is 15 cm to 1.5 m across: 11 of 93 are filed under 8 cm, five 1.5–4 m (K2). Listed
  // only: the tiny ones are also the short ones, and with them refused the real pendants hang into
  // what stands under them (a canopy bed: 17 → 115 pieces hung into another in 792 flats) — a
  // pendant is not yet chosen by the room under it (P5).
  pendant: { list: { longSide: { min: 0.15, max: 1.5 }, misfiled: /\bceiling fan\b/i } },
  // The kitchen's fridge is a full-height one, 1.4 m or more: an under-counter cooler is no fridge
  // (K1). A tall wine cooler is no fridge either, but it is only listed: refused, the catalogue's
  // full-height fridges that fit a 72 cm slot are black or wide, and Scandinavian kitchens (which
  // take nothing black) would be left with none — 91 of 102 lost their fridge in the fixture flats.
  fridge: { refuse: { height: { min: 1.4, max: 2.3 }, width: { min: 0.45, max: 1.3 } }, list: { misfiled: /\bwine\b/i } },
  // A dining table seats a household: 1.2 m on its longer side (the archetype is 1.6 × 0.9) — most
  // of the 13 of 31 "under 1.2 m" are wide enough, their width and depth entered the other way
  // round, and the longer side is what is measured. Listed only: a small kitchen takes the bistro
  // or round table that fits (the owner's kitchen fallbacks: a smaller table, two seats), and with
  // them refused the larger tables put chairs in doorways (door zones 56 → 82, a chair before a
  // radiator 8 → 38 in 792 flats).
  dining_table: { list: { longSide: { min: 1.2 } } },
  // A print, a painting, a frame gallery hangs flat on the wall: at most 12 cm deep and 25 cm wide
  // or more. Vases, trays, lanterns and table mirrors are filed under prints (K1).
  artwork: { refuse: { depth: { max: 0.12 }, width: { min: 0.25 } } },
  // A kitchen run is floor-standing, worktop-high or more, a cabinet's depth and at least 1.8 m
  // long: the library files ovens, a hob, range cookers and coffee machines under it (K1). A run of
  // tall units alone — no worktop, sink or hob — is not the kitchen either: its name says tall
  // units and not a run (a shop's run is taken by its kind, decision 9, so these would be).
  kitchen_run: { refuse: { height: { min: 0.85 }, depth: { min: 0.55, max: 0.72 }, width: { min: 1.8 }, misfiled: /^(?!.*\brun\b).*\btall\b/i } },
  // Storage shelves: wine racks, a trolley and a toilet-roll stand are filed here (K1).
  storage_shelf: { list: { misfiled: /\bwine rack\b|\btoilet roll\b|\btrolley\b|\bcart\b/i } },
};

type Sized = Pick<CatalogProduct, 'model3dKind' | 'widthCm' | 'depthCm' | 'heightCm' | 'nameEn' | 'nameKa'>;

const metres = (cm: number | null | undefined): number | null => (cm != null && cm > 0 ? cm / 100 : null);

/** Why a size is out of its range, or null when it is in (or unknown). */
function outOf(label: string, value: number | null, range: Range | undefined): string | null {
  if (!range || value == null) return null;
  if (range.min != null && value < range.min) return `${label} ${value.toFixed(2)} m, under ${range.min} m`;
  if (range.max != null && value > range.max) return `${label} ${value.toFixed(2)} m, over ${range.max} m`;
  return null;
}

/** Every check of a set the product fails: one reason per size out of range, and its name when it says another kind. */
function failed(product: Sized, checks: SizeChecks | undefined): string[] {
  if (!checks) return [];
  const width = metres(product.widthCm);
  const depth = metres(product.depthCm);
  const height = metres(product.heightCm);
  const long = width != null && depth != null ? Math.max(width, depth) : null;
  const named = !!checks.misfiled && checks.misfiled.test(`${product.nameEn ?? ''} ${product.nameKa ?? ''}`);
  return [outOf('width', width, checks.width), outOf('depth', depth, checks.depth), outOf('height', height, checks.height), outOf('longer side', long, checks.longSide), named ? 'its name says another kind' : null].filter((p): p is string => !!p);
}

/**
 * Why a product cannot be its kind (`KIND_BOUNDS`): what generation refuses it for (`refused`) and
 * what is only listed (`listed`). Both empty when its kind has no bounds, or nothing fails — a size
 * not given fails nothing.
 */
export function kindProblems(product: Sized): { refused: string[]; listed: string[] } {
  const bounds = product.model3dKind ? KIND_BOUNDS[product.model3dKind] : undefined;
  return { refused: failed(product, bounds?.refuse), listed: failed(product, bounds?.list) };
}

/** Whether generation may take the product for its kind: nothing its kind refuses (`KindBounds.refuse`). */
export function isPlausibleForGeneration(product: Sized): boolean {
  const bounds = product.model3dKind ? KIND_BOUNDS[product.model3dKind] : undefined;
  return !bounds?.refuse || failed(product, bounds.refuse).length === 0;
}
