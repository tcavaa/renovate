/**
 * The ticks on the budget: which lines the person is *not* ordering.
 *
 * A tick belongs to a line, not to a product. The first version kept product ids, and a flat
 * with the same bed in four bedrooms has four lines of one product — unticking the bed in
 * one room struck all four, which read as three rows appearing out of nowhere. So a line
 * carries a key of its own: a placed piece is `item:<its id>`, and the lines the budget folds
 * per product (a finish over every room it is on, the doors of one model, the sockets of one
 * model, the radiators of one design) are that product within its kind. The kind is in the
 * key so that one product id showing up in two sections can never tick both.
 *
 * Bare numbers are product ids from scenes saved before this; they still mean "every line of
 * that product" when read, and are never written again.
 */

export type Tick = string | number;

/**
 * Every line of the budget has a key — not only the products. The person decides what of the
 * estimate they are taking: the tiles, but also the plastering, the bags of screed, the
 * electrician's points. A key names the line for good, whatever else on the sheet changes,
 * so a tick and a changed quantity (`Quantities`) both hang on it.
 */
export const tickFor = {
  item: (itemId: string): string => `item:${itemId}`,
  finish: (productId: number): string => `finish:${productId}`,
  opening: (productId: number): string => `opening:${productId}`,
  fixture: (productId: number): string => `fixture:${productId}`,
  radiator: (productId: number): string => `radiator:${productId}`,
  /** A made-to-measure kitchen: the joiner's quote for one placed run or island. */
  kitchen: (itemId: string): string => `kitchen:${itemId}`,
  /** A door or window with no product chosen, estimated on its own. */
  openingEstimate: (openingId: string): string => `opening-estimate:${openingId}`,
  /** A catalogue-free estimate folded per kind: `electrical_socket`, `technical_sewer`… */
  estimate: (key: string): string => `estimate:${key}`,
  /** A bulk material of the rate book: `cement`, `plaster`… */
  material: (key: string): string => `material:${key}`,
  /** A labour line: `plastering`, `electrical_point`, `trim_install`… */
  labour: (key: string): string => `labour:${key}`,
  /** A product picked in the calculator, by its selection key (`lib/calculator/quantities`). */
  pick: (selectionKey: string): string => `pick:${selectionKey}`,
  /** A piece of furniture picked in the calculator for one room — the n-th of that product there, since the same chair can be picked twice. */
  furniture: (roomId: string, productId: number, n = 0): string => `furniture:${roomId}:${productId}:${n}`,
};

/**
 * Quantities the person set themselves, by line key. The sheet works every quantity out —
 * square metres off the plan, sections off the heat a room needs — and that stays the
 * *original*: an entry here is what is being ordered instead, shown beside it.
 */
export type Quantities = Record<string, number>;

/** A quantity somebody could mean: finite, not negative, not absurd. */
export function validQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000;
}

/** The map with one line's quantity set — or let go of, when it is back to what was worked out. */
export function withQuantity(quantities: Quantities, tick: string, qty: number | null, original?: number): Quantities {
  const next = { ...quantities };
  if (qty == null || !validQuantity(qty) || (original != null && Math.abs(qty - original) < 1e-9)) delete next[tick];
  else next[tick] = qty;
  return next;
}

/** Is this line ticked off? By its own key, or by a bare product id from an older scene. */
export function tickedOff(excluded: readonly Tick[] | null | undefined): (tick: string, productId?: number | null) => boolean {
  const set = new Set<Tick>(excluded ?? []);
  if (set.size === 0) return () => false;
  return (tick, productId) => set.has(tick) || (productId != null && set.has(productId));
}

/** The list with this line's tick flipped. Putting a line back also drops an old product-wide entry that was holding it out. */
export function toggleTick(excluded: readonly Tick[], tick: string, productId?: number | null): Tick[] {
  const out = tickedOff(excluded)(tick, productId);
  if (out) return excluded.filter((t) => t !== tick && (productId == null || t !== productId));
  return [...excluded, tick];
}

/** Ticks whose piece is no longer in the design — kept out of what gets saved. */
export function pruneTicks(excluded: readonly Tick[], itemIds: Iterable<string>): Tick[] {
  const present = new Set(itemIds);
  return excluded.filter((t) => typeof t !== 'string' || !ofMissingPiece(t, present));
}

/** The same for quantities: one set on a piece since deleted is not saved. */
export function pruneQuantities(quantities: Quantities, itemIds: Iterable<string>): Quantities {
  const present = new Set(itemIds);
  return Object.fromEntries(Object.entries(quantities).filter(([tick]) => !ofMissingPiece(tick, present)));
}

function ofMissingPiece(tick: string, present: Set<string>): boolean {
  for (const prefix of ['item:', 'kitchen:']) if (tick.startsWith(prefix)) return !present.has(tick.slice(prefix.length));
  return false;
}
