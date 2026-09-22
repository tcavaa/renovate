import { describe, expect, it } from 'vitest';
import { ARCHETYPES, ROOM_PROGRAMS, SHELF_ROOMS, kindsForRoom, unroomedKinds } from '@/lib/design/catalog';

describe('the furniture shelf’s rooms', () => {
  it('lists every room type that has a program, once', () => {
    expect([...SHELF_ROOMS].sort()).toEqual(Object.keys(ROOM_PROGRAMS).sort());
    expect(new Set(SHELF_ROOMS).size).toBe(SHELF_ROOMS.length);
  });

  it('puts a kind in a room by the slot it fills, the program’s own kind first', () => {
    const bedroom = kindsForRoom('bedroom');
    expect(bedroom.slice(0, 3)).toEqual(['bed_double', 'bed_single', 'nightstand']);
    expect(bedroom).toEqual(expect.arrayContaining(['wardrobe', 'dresser', 'rug_bed', 'rug']));
    // The bedside rug is the bedroom's own, so it comes before the living room's.
    expect(bedroom.indexOf('rug_bed')).toBeLessThan(bedroom.indexOf('rug'));

    const living = kindsForRoom('living_room');
    expect(living.slice(0, 2)).toEqual(['sofa_3seat', 'sofa_corner']);
    expect(living).toEqual(expect.arrayContaining(['coffee_table', 'tv_unit', 'bookshelf', 'storage_shelf', 'dining_table']));

    expect(kindsForRoom('toilet')).toEqual(['toilet', 'sink', 'mirror']);
    expect(kindsForRoom('bathroom')).toEqual(expect.arrayContaining(['shower', 'bathtub', 'washer']));
    expect(kindsForRoom('bathroom')).not.toContain('sofa_3seat');
  });

  it('names no kind twice and no kind that is not an archetype', () => {
    for (const room of SHELF_ROOMS) {
      const kinds = kindsForRoom(room);
      expect(new Set(kinds).size).toBe(kinds.length);
      for (const kind of kinds) expect(ARCHETYPES[kind]).toBeDefined();
    }
  });

  it('leaves no archetype without a room today', () => {
    // If this fails an archetype was added with a slot no program has: give a room the slot,
    // or accept that the piece is only found under "all".
    expect(unroomedKinds()).toEqual([]);
  });
});
