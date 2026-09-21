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

export const tickFor = {
  item: (itemId: string): string => `item:${itemId}`,
  finish: (productId: number): string => `finish:${productId}`,
  opening: (productId: number): string => `opening:${productId}`,
  fixture: (productId: number): string => `fixture:${productId}`,
  radiator: (productId: number): string => `radiator:${productId}`,
};

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
  return excluded.filter((t) => typeof t !== 'string' || !t.startsWith('item:') || present.has(t.slice('item:'.length)));
}
