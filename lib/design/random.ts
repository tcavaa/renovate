/**
 * Seeded randomness for generating a design: the same seed gives the same flat (tests, a design
 * reproduced), a new seed another one. `generate` draws a fresh seed every time, so the same plan
 * generated twice is furnished, placed and finished differently; everything that is not generating
 * (adding a piece, a swap, a change of style) passes no `Rng` and stays deterministic.
 *
 * Pure; no `Math.random` except in `randomSeed`.
 */

export type Rng = () => number;

/** mulberry32: small, fast and good enough to vary a layout. Returns floats in [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** One of `items`, each as likely as its weight (a weight of 0 or less is never picked). Null for none. */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | null {
  const weights = items.map((item) => Math.max(0, weight(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0 && weights[i] > 0) return items[i];
  }
  for (let i = items.length - 1; i >= 0; i--) if (weights[i] > 0) return items[i];
  return null;
}

/** All of `items` in a random order where the heavier tend to come first (weighted sampling without replacement). */
export function weightedOrder<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T[] {
  // Efraimidis–Spirakis: each item's key is u^(1/w); sorting by key draws without replacement.
  return items
    .map((item) => {
      const w = Math.max(1e-9, weight(item));
      return { item, key: Math.pow(Math.max(rng(), 1e-12), 1 / w) };
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
}

/**
 * Among scored options, one of the good ones: everything within `spread` of the best stays in
 * the draw, the better more likely — so a layout varies between the spots a designer would
 * accept, never the bad ones. Without an `rng`, simply the best.
 */
export function pickNearBest<T>(options: ReadonlyArray<{ value: T; score: number }>, spread: number, rng?: Rng): T | null {
  if (options.length === 0) return null;
  const best = options.reduce((a, b) => (b.score > a.score ? b : a));
  if (!rng) return best.value;
  const floor = best.score - spread;
  return weightedPick(options.filter((o) => o.score >= floor), (o) => o.score - floor + spread * 0.25, rng)?.value ?? best.value;
}
