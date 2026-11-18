import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '@/lib/design/catalog';
import { BATH_OR_SHOWER, COMPANION_SLOTS, CUSTOM_KITCHEN_KINDS, CUSTOM_KITCHEN_SLOTS, isCustomKitchenSlot, LAID_TO_ANOTHER, LIES_FLAT, NOT_IN_THE_WAY, SIZED_BY_LAYOUT } from '@/lib/design/kinds';

/** The named sets of slots and kinds (`lib/design/kinds`): each list that means one thing, once. */

const SLOTS = new Set(Object.values(ARCHETYPES).map((a) => a.slot));
const sorted = (set: Iterable<string>) => [...set].sort();

describe('the named sets of slots', () => {
  it('names only slots some archetype fills — a kind (a blind) is no slot', () => {
    for (const [name, set] of Object.entries({ LAID_TO_ANOTHER, SIZED_BY_LAYOUT, LIES_FLAT, NOT_IN_THE_WAY, COMPANION_SLOTS, BATH_OR_SHOWER })) {
      for (const slot of set) expect(SLOTS.has(slot), `${name}: ${slot}`).toBe(true);
    }
    for (const slot of CUSTOM_KITCHEN_SLOTS) expect(SLOTS.has(slot), slot).toBe(true);
  });

  it('builds each wider set on the narrower one it says it is', () => {
    expect(sorted(LAID_TO_ANOTHER)).toEqual(['curtain', 'rug']);
    expect(sorted(SIZED_BY_LAYOUT)).toEqual(['curtain', 'kitchen_run', 'rug']);
    expect(sorted(LIES_FLAT)).toEqual(['curtain', 'door_mat', 'rug']);
    expect(sorted(NOT_IN_THE_WAY)).toEqual(['curtain', 'door_mat', 'pendant', 'rug']);
    // A blind dresses a window as a curtain does: it fills the curtain's slot.
    expect(ARCHETYPES.blind.slot).toBe('curtain');
  });

  it('names the kitchen made to measure, the companions and where one bathes', () => {
    expect(sorted(CUSTOM_KITCHEN_KINDS)).toEqual(['kitchen_island', 'kitchen_run', 'kitchen_wall']);
    expect(isCustomKitchenSlot('kitchen_wall')).toBe(true);
    expect(isCustomKitchenSlot('fridge')).toBe(false);
    expect(isCustomKitchenSlot(null)).toBe(false);
    expect(sorted(COMPANION_SLOTS)).toEqual(['bath_mixer', 'dryer', 'tap']);
    expect(sorted(BATH_OR_SHOWER)).toEqual(['bathtub', 'shower']);
  });
});
