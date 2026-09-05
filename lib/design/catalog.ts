/**
 * The furniture vocabulary.
 *
 * An *archetype* is one kind of object the studio knows how to place and draw: its real-world
 * size, which catalogue category it buys from, and the rule for where it goes in a room.
 * A *room program* is the list of archetypes a room of a given type should contain.
 *
 * This module is pure data plus a couple of lookups — no THREE, no React. The layout engine
 * (`autoLayout.ts`) reads the placement rules; the geometry builders
 * (`lib/design3d/buildScene`) read the sizes; `/api/design/suggest` reads `categorySlug` to
 * find real products.
 */

import type { RoomType } from '@/lib/calculator/types';
import type { SlotKind } from './types';

export interface Size3 {
  width: number;
  depth: number;
  height: number;
}

export type PlacementRule =
  /** Stands against a wall, back to it, facing into the room. */
  | {
      type: 'wall';
      /** Which wall to prefer when several are free. */
      prefer: 'longest' | 'opposite-door' | 'beside-window' | 'shortest' | 'any';
      /** Keep this much walking space in front of the item. */
      clearanceM: number;
      /** Slide along the wall: 0.5 = centred, 0 = hard against the start corner. */
      along?: number;
    }
  /** Free-standing in the middle of the room. */
  | { type: 'center' }
  /** Positioned relative to another already-placed item. */
  | {
      type: 'relative';
      to: SlotKind;
      /** Metres in front of the anchor (along the direction it faces). */
      forward: number;
      /** Metres to the anchor's right. */
      lateral: number;
      /** 'facing' turns to look back at the anchor, 'same' copies its rotation. */
      align: 'facing' | 'same' | 'sideways';
    }
  /** Tucked into the freest corner. */
  | { type: 'corner'; clearanceM: number }
  /** Hangs from the ceiling. */
  | { type: 'ceiling' }
  /** Fixed flat to a wall at a given height (mirrors, art). */
  | { type: 'wall-mounted'; heightM: number }
  /** Laid on the floor under another item, sized to it. */
  | { type: 'under'; to: SlotKind; padM: number }
  /** Runs the full length of a wall (kitchen counters). */
  | { type: 'wall-run'; prefer: 'longest' | 'shortest'; clearanceM: number }
  /** Hangs at a window. */
  | { type: 'window' };

export interface Archetype {
  kind: string;
  slot: SlotKind;
  labelKa: string;
  labelEn: string;
  labelRu: string;
  /** Catalogue category to buy this from. Null = decor we render but do not sell. */
  categorySlug: string | null;
  size: Size3;
  placement: PlacementRule;
  /** Items with a higher priority are placed first and win collisions. */
  priority: number;
  /** Skip this item if the room is smaller than this. */
  minRoomAreaM2?: number;
  /** Rendering hint only — never blocks another item's footprint. */
  ghost?: boolean;
}

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

export const ARCHETYPES: Record<string, Archetype> = {
  // --- sleeping ---
  bed_double: {
    kind: 'bed_double',
    slot: 'bed',
    labelKa: 'ორადგილიანი საწოლი',
    labelEn: 'Double bed',
    labelRu: 'Двуспальная кровать',
    categorySlug: 'beds',
    size: { width: 1.6, depth: 2.05, height: 1.05 },
    placement: { type: 'wall', prefer: 'opposite-door', clearanceM: 0.7 },
    priority: 100,
  },
  bed_single: {
    kind: 'bed_single',
    slot: 'bed',
    labelKa: 'ერთადგილიანი საწოლი',
    labelEn: 'Single bed',
    labelRu: 'Односпальная кровать',
    categorySlug: 'beds',
    size: { width: 0.95, depth: 2.0, height: 0.95 },
    placement: { type: 'wall', prefer: 'longest', clearanceM: 0.6 },
    priority: 100,
  },
  nightstand: {
    kind: 'nightstand',
    slot: 'nightstand',
    labelKa: 'ღამის მაგიდა',
    labelEn: 'Nightstand',
    labelRu: 'Тумба прикроватная',
    categorySlug: 'storage',
    size: { width: 0.45, depth: 0.4, height: 0.52 },
    placement: { type: 'relative', to: 'bed', forward: -0.05, lateral: 1.06, align: 'same' },
    priority: 60,
  },
  wardrobe: {
    kind: 'wardrobe',
    slot: 'wardrobe',
    labelKa: 'კარადა',
    labelEn: 'Wardrobe',
    labelRu: 'Шкаф',
    categorySlug: 'wardrobes',
    size: { width: 1.8, depth: 0.62, height: 2.25 },
    placement: { type: 'wall', prefer: 'longest', clearanceM: 0.75 },
    priority: 90,
    minRoomAreaM2: 8,
  },
  dresser: {
    kind: 'dresser',
    slot: 'dresser',
    labelKa: 'კომოდი',
    labelEn: 'Dresser',
    labelRu: 'Комод',
    categorySlug: 'storage',
    size: { width: 1.1, depth: 0.45, height: 0.82 },
    placement: { type: 'wall', prefer: 'any', clearanceM: 0.6 },
    priority: 50,
    minRoomAreaM2: 12,
  },

  // --- living ---
  sofa_3seat: {
    kind: 'sofa_3seat',
    slot: 'sofa',
    labelKa: 'სამადგილიანი დივანი',
    labelEn: 'Three-seat sofa',
    labelRu: 'Трёхместный диван',
    categorySlug: 'sofas',
    size: { width: 2.2, depth: 0.92, height: 0.84 },
    placement: { type: 'wall', prefer: 'longest', clearanceM: 0.9 },
    priority: 100,
  },
  sofa_corner: {
    kind: 'sofa_corner',
    slot: 'sofa',
    labelKa: 'კუთხის დივანი',
    labelEn: 'Corner sofa',
    labelRu: 'Угловой диван',
    categorySlug: 'sofas',
    size: { width: 2.7, depth: 1.75, height: 0.84 },
    placement: { type: 'wall', prefer: 'longest', clearanceM: 0.9 },
    priority: 100,
    minRoomAreaM2: 20,
  },
  armchair: {
    kind: 'armchair',
    slot: 'armchair',
    labelKa: 'სავარძელი',
    labelEn: 'Armchair',
    labelRu: 'Кресло',
    categorySlug: 'sofas',
    size: { width: 0.86, depth: 0.88, height: 0.82 },
    placement: { type: 'relative', to: 'sofa', forward: 1.7, lateral: -1.25, align: 'facing' },
    priority: 45,
    minRoomAreaM2: 15,
  },
  coffee_table: {
    kind: 'coffee_table',
    slot: 'coffee_table',
    labelKa: 'ჟურნალის მაგიდა',
    labelEn: 'Coffee table',
    labelRu: 'Журнальный столик',
    categorySlug: 'tables',
    size: { width: 1.1, depth: 0.6, height: 0.42 },
    placement: { type: 'relative', to: 'sofa', forward: 1.05, lateral: 0, align: 'same' },
    priority: 70,
  },
  tv_unit: {
    kind: 'tv_unit',
    slot: 'tv_unit',
    labelKa: 'ტელევიზორის თარო',
    labelEn: 'TV unit',
    labelRu: 'ТВ-тумба',
    categorySlug: 'storage',
    size: { width: 1.8, depth: 0.42, height: 0.5 },
    placement: { type: 'relative', to: 'sofa', forward: 3.0, lateral: 0, align: 'facing' },
    priority: 65,
  },
  storage_shelf: {
    kind: 'storage_shelf',
    slot: 'bookshelf',
    labelKa: 'ღია სტელაჟი',
    labelEn: 'Open shelving',
    labelRu: 'Открытый стеллаж',
    categorySlug: 'storage',
    size: { width: 0.9, depth: 0.4, height: 1.9 },
    placement: { type: 'wall', prefer: 'any', clearanceM: 0.6 },
    priority: 38,
  },
  bookshelf: {
    kind: 'bookshelf',
    slot: 'bookshelf',
    labelKa: 'წიგნების თარო',
    labelEn: 'Bookshelf',
    labelRu: 'Книжный шкаф',
    categorySlug: 'storage',
    size: { width: 0.9, depth: 0.35, height: 1.9 },
    placement: { type: 'wall', prefer: 'any', clearanceM: 0.6 },
    priority: 40,
    minRoomAreaM2: 14,
  },

  // --- dining ---
  dining_table: {
    kind: 'dining_table',
    slot: 'dining_table',
    labelKa: 'სასადილო მაგიდა',
    labelEn: 'Dining table',
    labelRu: 'Обеденный стол',
    categorySlug: 'tables',
    size: { width: 1.6, depth: 0.9, height: 0.76 },
    placement: { type: 'center' },
    priority: 95,
    minRoomAreaM2: 9,
  },
  dining_chair: {
    kind: 'dining_chair',
    slot: 'dining_chair',
    labelKa: 'სასადილო სკამი',
    labelEn: 'Dining chair',
    labelRu: 'Обеденный стул',
    categorySlug: 'chairs',
    size: { width: 0.46, depth: 0.5, height: 0.92 },
    placement: { type: 'relative', to: 'dining_table', forward: 0, lateral: 0, align: 'facing' },
    priority: 55,
  },

  // --- kitchen ---
  kitchen_run: {
    kind: 'kitchen_run',
    slot: 'kitchen_run',
    labelKa: 'სამზარეულოს ავეჯი',
    labelEn: 'Kitchen units',
    labelRu: 'Кухонный гарнитур',
    categorySlug: 'kitchen-furniture',
    size: { width: 3.0, depth: 0.62, height: 0.92 },
    placement: { type: 'wall-run', prefer: 'longest', clearanceM: 0.95 },
    priority: 100,
  },
  kitchen_island: {
    kind: 'kitchen_island',
    slot: 'kitchen_island',
    labelKa: 'სამზარეულოს კუნძული',
    labelEn: 'Kitchen island',
    labelRu: 'Кухонный остров',
    categorySlug: 'kitchen-furniture',
    size: { width: 1.8, depth: 0.9, height: 0.94 },
    placement: { type: 'center' },
    priority: 80,
    minRoomAreaM2: 16,
  },
  fridge: {
    kind: 'fridge',
    slot: 'fridge',
    labelKa: 'მაცივარი',
    labelEn: 'Fridge',
    labelRu: 'Холодильник',
    categorySlug: 'kitchen-furniture',
    size: { width: 0.72, depth: 0.72, height: 1.92 },
    placement: { type: 'wall', prefer: 'shortest', clearanceM: 0.8 },
    priority: 75,
  },

  // --- work ---
  desk: {
    kind: 'desk',
    slot: 'desk',
    labelKa: 'სამუშაო მაგიდა',
    labelEn: 'Desk',
    labelRu: 'Письменный стол',
    categorySlug: 'tables',
    size: { width: 1.4, depth: 0.7, height: 0.75 },
    placement: { type: 'wall', prefer: 'beside-window', clearanceM: 0.85 },
    priority: 95,
  },
  office_chair: {
    kind: 'office_chair',
    slot: 'office_chair',
    labelKa: 'საოფისე სკამი',
    labelEn: 'Office chair',
    labelRu: 'Офисное кресло',
    categorySlug: 'chairs',
    size: { width: 0.62, depth: 0.62, height: 1.05 },
    placement: { type: 'relative', to: 'desk', forward: 0.75, lateral: 0, align: 'facing' },
    priority: 55,
  },

  // --- bathroom ---
  toilet: {
    kind: 'toilet',
    slot: 'toilet',
    labelKa: 'უნიტაზი',
    labelEn: 'Toilet',
    labelRu: 'Унитаз',
    categorySlug: 'sanitary',
    size: { width: 0.4, depth: 0.68, height: 0.82 },
    placement: { type: 'wall', prefer: 'shortest', clearanceM: 0.6 },
    priority: 100,
  },
  sink: {
    kind: 'sink',
    slot: 'sink',
    labelKa: 'ნიჟარა',
    labelEn: 'Sink',
    labelRu: 'Раковина',
    categorySlug: 'sanitary',
    size: { width: 0.62, depth: 0.48, height: 0.88 },
    placement: { type: 'wall', prefer: 'any', clearanceM: 0.6 },
    priority: 95,
  },
  shower: {
    kind: 'shower',
    slot: 'shower',
    labelKa: 'შხაპი',
    labelEn: 'Shower',
    labelRu: 'Душ',
    categorySlug: 'sanitary',
    size: { width: 0.92, depth: 0.92, height: 2.05 },
    placement: { type: 'corner', clearanceM: 0.5 },
    priority: 98,
  },
  bathtub: {
    kind: 'bathtub',
    slot: 'bathtub',
    labelKa: 'აბაზანა',
    labelEn: 'Bathtub',
    labelRu: 'Ванна',
    categorySlug: 'sanitary',
    size: { width: 1.7, depth: 0.75, height: 0.58 },
    placement: { type: 'wall', prefer: 'longest', clearanceM: 0.6 },
    priority: 98,
    minRoomAreaM2: 6,
  },
  washer: {
    kind: 'washer',
    slot: 'washer',
    labelKa: 'სარეცხი მანქანა',
    labelEn: 'Washing machine',
    labelRu: 'Стиральная машина',
    categorySlug: 'sanitary',
    size: { width: 0.6, depth: 0.62, height: 0.86 },
    placement: { type: 'wall', prefer: 'any', clearanceM: 0.55 },
    priority: 60,
    minRoomAreaM2: 4,
  },

  // --- hallway ---
  console_table: {
    kind: 'console_table',
    slot: 'console',
    labelKa: 'კონსოლი',
    labelEn: 'Console table',
    labelRu: 'Консоль',
    categorySlug: 'storage',
    size: { width: 1.0, depth: 0.35, height: 0.8 },
    placement: { type: 'wall', prefer: 'longest', clearanceM: 0.7 },
    priority: 80,
  },
  shoe_cabinet: {
    kind: 'shoe_cabinet',
    slot: 'shoe_cabinet',
    labelKa: 'ფეხსაცმლის კარადა',
    labelEn: 'Shoe cabinet',
    labelRu: 'Обувница',
    categorySlug: 'storage',
    size: { width: 0.9, depth: 0.36, height: 0.62 },
    placement: { type: 'wall', prefer: 'any', clearanceM: 0.7 },
    priority: 75,
  },
  mirror: {
    kind: 'mirror',
    slot: 'mirror',
    labelKa: 'სარკე',
    labelEn: 'Mirror',
    labelRu: 'Зеркало',
    categorySlug: 'decor',
    size: { width: 0.7, depth: 0.05, height: 1.1 },
    placement: { type: 'wall-mounted', heightM: 1.0 },
    priority: 30,
    ghost: true,
  },

  // --- soft goods, light, decor ---
  rug: {
    kind: 'rug',
    slot: 'rug',
    labelKa: 'ხალიჩა',
    labelEn: 'Rug',
    labelRu: 'Ковёр',
    categorySlug: 'rugs',
    size: { width: 2.4, depth: 1.7, height: 0.02 },
    placement: { type: 'under', to: 'coffee_table', padM: 0.7 },
    priority: 20,
    ghost: true,
  },
  rug_bed: {
    kind: 'rug_bed',
    slot: 'rug',
    labelKa: 'ხალიჩა',
    labelEn: 'Rug',
    labelRu: 'Ковёр',
    categorySlug: 'rugs',
    size: { width: 2.6, depth: 2.0, height: 0.02 },
    placement: { type: 'under', to: 'bed', padM: 0.55 },
    priority: 20,
    ghost: true,
  },
  floor_lamp: {
    kind: 'floor_lamp',
    slot: 'floor_lamp',
    labelKa: 'იატაკის სანათი',
    labelEn: 'Floor lamp',
    labelRu: 'Торшер',
    categorySlug: 'lighting',
    size: { width: 0.42, depth: 0.42, height: 1.62 },
    placement: { type: 'corner', clearanceM: 0.35 },
    priority: 35,
    minRoomAreaM2: 10,
  },
  pendant: {
    kind: 'pendant',
    slot: 'pendant',
    labelKa: 'ჭაღი',
    labelEn: 'Pendant light',
    labelRu: 'Подвесной светильник',
    categorySlug: 'lighting',
    size: { width: 0.52, depth: 0.52, height: 0.55 },
    placement: { type: 'ceiling' },
    priority: 25,
    ghost: true,
  },
  plant: {
    kind: 'plant',
    slot: 'plant',
    labelKa: 'მცენარე',
    labelEn: 'Plant',
    labelRu: 'Растение',
    categorySlug: 'decor',
    size: { width: 0.55, depth: 0.55, height: 1.25 },
    placement: { type: 'corner', clearanceM: 0.3 },
    priority: 15,
    minRoomAreaM2: 10,
  },
  artwork: {
    kind: 'artwork',
    slot: 'artwork',
    labelKa: 'ნახატი',
    labelEn: 'Artwork',
    labelRu: 'Картина',
    categorySlug: 'decor',
    size: { width: 0.95, depth: 0.05, height: 0.7 },
    placement: { type: 'wall-mounted', heightM: 1.55 },
    priority: 12,
    ghost: true,
  },
  curtain: {
    kind: 'curtain',
    slot: 'curtain',
    labelKa: 'ფარდა',
    labelEn: 'Curtains',
    labelRu: 'Шторы',
    categorySlug: 'decor',
    size: { width: 2.0, depth: 0.12, height: 2.4 },
    placement: { type: 'window' },
    priority: 10,
    ghost: true,
  },
};

export function getArchetype(kind: string): Archetype | null {
  return ARCHETYPES[kind] ?? null;
}

// ---------------------------------------------------------------------------
// Room programs
// ---------------------------------------------------------------------------

export interface ProgramEntry {
  kind: string;
  /** How many to place. `'fill'` means as many as fit (dining chairs). */
  count: number | 'fill';
  /** Only include when the room is at least this big. */
  minAreaM2?: number;
  /** Prefer this variant when the room is at least this big (e.g. corner sofa). */
  preferAboveM2?: number;
}

/**
 * What belongs in each kind of room, in the order it should be placed.
 *
 * Order matters: anchors (bed, sofa, dining table) come first because everything else is
 * positioned relative to them.
 */
export const ROOM_PROGRAMS: Record<RoomType, ProgramEntry[]> = {
  bedroom: [
    { kind: 'bed_double', count: 1 },
    { kind: 'nightstand', count: 2 },
    { kind: 'wardrobe', count: 1, minAreaM2: 8 },
    { kind: 'dresser', count: 1, minAreaM2: 13 },
    { kind: 'rug_bed', count: 1 },
    { kind: 'pendant', count: 1 },
    { kind: 'artwork', count: 1 },
    { kind: 'curtain', count: 1 },
    { kind: 'plant', count: 1, minAreaM2: 12 },
  ],
  living_room: [
    { kind: 'sofa_3seat', count: 1, preferAboveM2: 22 },
    { kind: 'coffee_table', count: 1 },
    { kind: 'tv_unit', count: 1 },
    { kind: 'armchair', count: 1, minAreaM2: 16 },
    { kind: 'bookshelf', count: 1, minAreaM2: 15 },
    { kind: 'rug', count: 1 },
    { kind: 'floor_lamp', count: 1, minAreaM2: 11 },
    { kind: 'pendant', count: 1 },
    { kind: 'artwork', count: 1 },
    { kind: 'plant', count: 1, minAreaM2: 12 },
    { kind: 'curtain', count: 1 },
    { kind: 'dining_table', count: 1, minAreaM2: 26 },
    { kind: 'dining_chair', count: 'fill', minAreaM2: 26 },
  ],
  kitchen: [
    { kind: 'kitchen_run', count: 1 },
    { kind: 'fridge', count: 1 },
    { kind: 'kitchen_island', count: 1, minAreaM2: 17 },
    { kind: 'dining_table', count: 1, minAreaM2: 10 },
    { kind: 'dining_chair', count: 'fill', minAreaM2: 10 },
    { kind: 'pendant', count: 1 },
    { kind: 'curtain', count: 1 },
  ],
  bathroom: [
    { kind: 'toilet', count: 1 },
    { kind: 'sink', count: 1 },
    { kind: 'shower', count: 1 },
    { kind: 'bathtub', count: 1, minAreaM2: 7.5 },
    { kind: 'washer', count: 1, minAreaM2: 4.5 },
    { kind: 'mirror', count: 1 },
  ],
  toilet: [
    { kind: 'toilet', count: 1 },
    { kind: 'sink', count: 1 },
    { kind: 'mirror', count: 1 },
  ],
  hallway: [
    { kind: 'console_table', count: 1 },
    { kind: 'shoe_cabinet', count: 1 },
    { kind: 'mirror', count: 1 },
    { kind: 'pendant', count: 1 },
    { kind: 'plant', count: 1, minAreaM2: 8 },
  ],
  office: [
    { kind: 'desk', count: 1 },
    { kind: 'office_chair', count: 1 },
    { kind: 'bookshelf', count: 1 },
    { kind: 'armchair', count: 1, minAreaM2: 14 },
    { kind: 'rug', count: 1 },
    { kind: 'pendant', count: 1 },
    { kind: 'artwork', count: 1 },
    { kind: 'curtain', count: 1 },
  ],
  storage: [
    { kind: 'storage_shelf', count: 2 },
    { kind: 'pendant', count: 1 },
  ],
  balcony: [
    { kind: 'armchair', count: 1, minAreaM2: 4 },
    { kind: 'plant', count: 2 },
  ],
};

/** Chooses the better variant when a program entry has a size-gated upgrade. */
export function resolveVariant(entry: ProgramEntry, roomAreaM2: number): string {
  if (entry.kind === 'sofa_3seat' && entry.preferAboveM2 && roomAreaM2 >= entry.preferAboveM2) {
    return 'sofa_corner';
  }
  if (entry.kind === 'bed_double' && roomAreaM2 < 9) return 'bed_single';
  return entry.kind;
}

/** Every category the studio can buy from — used to prefetch the catalogue in one query. */
export const DESIGN_CATEGORY_SLUGS = Array.from(
  new Set(
    Object.values(ARCHETYPES)
      .map((a) => a.categorySlug)
      .filter((s): s is string => !!s)
  )
);

/** The archetype's label in the visitor's language, falling back to Georgian. */
export function archetypeLabel(kind: string, locale: 'ka' | 'en' | 'ru'): string {
  const archetype = getArchetype(kind);
  if (!archetype) return kind;
  if (locale === 'en') return archetype.labelEn || archetype.labelKa;
  if (locale === 'ru') return archetype.labelRu || archetype.labelEn || archetype.labelKa;
  return archetype.labelKa;
}
