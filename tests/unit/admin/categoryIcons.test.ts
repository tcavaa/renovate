import { describe, expect, it } from 'vitest';
import { icons } from 'lucide-react';
import { ICON_GROUPS, STUDIO_ICONS, SUGGESTED_ICONS, iconKebabName, iconLookupKey, iconMatches } from '@/lib/admin/icons';
import { lucideIconFor } from '@/components/admin/CategoryIcon';
import { iconNodeFor } from '@/lib/catalog/iconNodes';

describe('category icons', () => {
  it('writes lucide names the way lucide.dev shows them', () => {
    expect(iconKebabName('DoorOpen')).toBe('door-open');
    expect(iconKebabName('Grid3x3')).toBe('grid-3x3');
    expect(iconKebabName('Grid2x2Check')).toBe('grid-2x2-check');
    expect(iconKebabName('LampWallUp')).toBe('lamp-wall-up');
    expect(iconKebabName('Flower2')).toBe('flower-2');
    expect(iconKebabName('AArrowDown')).toBe('a-arrow-down');
  });

  it('finds every lucide icon again from the name it is stored under', () => {
    for (const pascal of Object.keys(icons)) {
      expect(lucideIconFor(iconKebabName(pascal))).toBe(icons[pascal as keyof typeof icons]);
    }
  });

  it('reads any spelling of a name, and nothing that is not one', () => {
    expect(iconLookupKey('Door Open')).toBe(iconLookupKey('door-open'));
    expect(lucideIconFor('DoorOpen')).toBe(icons.DoorOpen);
    expect(lucideIconFor('flame')).toBe(icons.Flame);
    expect(lucideIconFor('no-such-icon')).toBeNull();
    expect(lucideIconFor('')).toBeNull();
    expect(lucideIconFor(null)).toBeNull();
  });

  it('suggests only real icons, each once, each in a known group', () => {
    const keys = SUGGESTED_ICONS.map((s) => iconLookupKey(s.name));
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SUGGESTED_ICONS) {
      expect(lucideIconFor(s.name), s.name).not.toBeNull();
      expect(ICON_GROUPS).toContain(s.group);
    }
  });

  it('searches in Georgian, Russian and English', () => {
    const find = (q: string) => SUGGESTED_ICONS.filter((s) => iconMatches(s.name, q, s.words)).map((s) => s.name);
    expect(find('კარი')).toContain('door-open');
    expect(find('радиатор')).toContain('heater');
    expect(find('bed')).toEqual(expect.arrayContaining(['bed', 'bed-double', 'bed-single']));
    expect(find('door open')).toEqual(['door-open']);
    expect(find('')).toHaveLength(SUGGESTED_ICONS.length);
    expect(find('zzzz')).toEqual([]);
  });

  it('draws the studio\'s own furniture icons, which lucide has not', () => {
    for (const name of Object.keys(STUDIO_ICONS)) {
      expect(lucideIconFor(name), name).not.toBeNull();
      expect(icons[name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase()) as keyof typeof icons], name).toBeUndefined();
    }
    expect(SUGGESTED_ICONS.filter((s) => s.group === 'studio').map((s) => s.name).sort()).toEqual(Object.keys(STUDIO_ICONS).sort());
  });
});

describe('icon drawings for the studio', () => {
  it('reads a lucide icon\'s drawing and the studio\'s own', () => {
    const door = iconNodeFor('door-open');
    expect(door?.length).toBeGreaterThan(0);
    expect(door?.every(([tag]) => typeof tag === 'string')).toBe(true);
    expect(iconNodeFor('DoorOpen')).toEqual(door);
    expect(iconNodeFor('sofa-corner')).toBe(STUDIO_ICONS['sofa-corner']);
  });

  it('draws nothing for no name or one that is not an icon', () => {
    expect(iconNodeFor(null)).toBeNull();
    expect(iconNodeFor('')).toBeNull();
    expect(iconNodeFor('no-such-icon')).toBeNull();
  });
});
