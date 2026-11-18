/**
 * Seeded randomness for generating a design: the same seed gives the same flat (tests, a design
 * reproduced), a new seed another one. `generate` draws a fresh seed every time, so the same plan
 * generated twice is furnished, placed and finished differently; everything that is not generating
 * (adding a piece, a swap, a change of style) passes no `Rng` and stays deterministic.
 *
 * Generating a flat draws each room's layout, products, bathroom pass and finishes from that
 * room's own stream (`rngStreams`, `roomStreams`), not from one stream through the flat: a change
 * in one room (a piece more, a wall moved) leaves every other room's draw as it was.
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

/** FNV-1a over a string's UTF-16 code units: the key's 32 bits. */
function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** murmur3's finaliser: every bit of the input moves every bit of the output. */
function mix32(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A stream of its own for a seed and a key (a stage and a room's id — `layout:r2`): seeded from a
 * hash of both, so it is the same however many numbers other keys draw and in whatever order the
 * keys are asked for. What one room draws never moves another room's draw.
 */
export function streamRng(seed: number, key: string): Rng {
  return seededRng(mix32(mix32(seed >>> 0) ^ hashKey(key)));
}

/** A seed's streams by key: the same key gives the same stream object, which carries on where it left off. */
export type RngStreams = (key: string) => Rng;

/** The streams of a seed (`streamRng`), each made once and kept: asking for a key again continues its stream. */
export function rngStreams(seed: number): RngStreams {
  const made = new Map<string, Rng>();
  return (key) => {
    let rng = made.get(key);
    if (!rng) made.set(key, (rng = streamRng(seed, key)));
    return rng;
  };
}

/**
 * Per room, a stream of its own for one stage of generating (`roomStreams`): the stage's draws for
 * a room come from that room's stream alone. `part` names a draw of its own inside the room (a
 * slot's way out in the matcher), so it moves nothing else in the room either.
 */
export type RoomRng = (roomId: string, part?: string) => Rng;

/** A stage's per-room streams from a seed's streams: `stage:roomId` (and `stage:roomId:part`). */
export function roomStreams(streams: RngStreams, stage: string): RoomRng {
  return (roomId, part) => streams(part ? `${stage}:${roomId}:${part}` : `${stage}:${roomId}`);
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
