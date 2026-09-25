import type { HomeState, RoomType, WorkChoices } from './types';

/**
 * What each home state needs, as the renovation team prices it (September 2026). Every work
 * is one phase and a home state is the set of phases it still needs — so a work common to
 * several states (the laminate, the ceiling, the bathroom tiles) is one line whichever state
 * is chosen, never one per state. A black frame needs everything; a white frame has its walls
 * built and plastered and its floor screeded; a green frame is wired, plumbed, heated and has
 * its doors, and needs the finishing. An old renovation is stripped out first (phase 0) and
 * then needs what a black frame does, except building the walls — they are standing — and the
 * new-build rubbish, which the strip-out's own removal covers.
 */
export const HOME_STATES: Record<
  HomeState,
  { labelKa: string; descriptionKa: string; includedPhases: number[] }
> = {
  old_renovation: {
    labelKa: 'ძველი რემონტი',
    descriptionKa:
      'ბინაში ძველი რემონტია. საჭიროა ძველი იატაკის, კედლების და კაფელ-მეტლახის დემონტაჟი და ნაგვის გატანა, შემდეგ — ყველა სამუშაო თავიდან.',
    includedPhases: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  },
  black_frame: {
    labelKa: 'შავი კარკასი',
    descriptionKa: 'მხოლოდ ბეტონის კარკასი. საჭიროა ყველა სამუშაო — კედლების აშენებიდან კარების დაყენებამდე.',
    includedPhases: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  },
  white_frame: {
    labelKa: 'თეთრი კარკასი',
    descriptionKa: 'კედლები აშენებული და შელესილია, იატაკი მოჭიმულია. საჭიროა ელექტროობა, სანტექნიკა, გათბობა, სააბაზანო, საფარი, ჭერი და კარები.',
    includedPhases: [2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  },
  green_frame: {
    labelKa: 'მწვანე კარკასი',
    descriptionKa: 'ელექტროობა, სანტექნიკა, გათბობა და კარები მზადაა. საჭიროა შეღებვა, ფილები, იატაკის საფარი და ჭერი.',
    includedPhases: [6, 9, 10, 11, 12, 14],
  },
};

export const ROOM_TYPES: Record<RoomType, { labelKa: string; defaultHeight: number }> = {
  living_room: { labelKa: 'მისაღები ოთახი', defaultHeight: 2.8 },
  bedroom: { labelKa: 'საძინებელი', defaultHeight: 2.8 },
  kitchen: { labelKa: 'სამზარეულო', defaultHeight: 2.7 },
  bathroom: { labelKa: 'სველი წერტილი', defaultHeight: 2.5 },
  toilet: { labelKa: 'ტუალეტი', defaultHeight: 2.5 },
  hallway: { labelKa: 'დერეფანი', defaultHeight: 2.8 },
  balcony: { labelKa: 'აივანი', defaultHeight: 2.5 },
  storage: { labelKa: 'საწყობი', defaultHeight: 2.5 },
  office: { labelKa: 'საოფისე ოთახი', defaultHeight: 2.8 },
  closet: { labelKa: 'გარდერობი', defaultHeight: 2.6 },
  studio: { labelKa: 'სტუდიო', defaultHeight: 2.8 },
};

/** The two parts a studio starts with, in the order of its line: kitchen first, then the living room. */
export const DEFAULT_STUDIO_PARTS: [RoomType, RoomType] = ['kitchen', 'living_room'];

/** The share of a studio's floor its first part is given when the room becomes a studio. */
export const DEFAULT_FIRST_SHARE = 0.35;

export const WET_ROOM_TYPES: RoomType[] = ['bathroom', 'toilet', 'kitchen'];

/**
 * Rooms whose floor and walls are tiled and prepared as a bathroom (screed at the bathroom
 * rate, walls levelled with adhesive cement, tiles floor to ceiling). The team's "ტუალეტი"
 * is both of these; neither is painted.
 */
export const BATH_ROOM_TYPES: RoomType[] = ['bathroom', 'toilet'];

/** Rooms whose floor is tiled (მეტლახი) rather than laid with laminate or parquet. */
export const TILED_FLOOR_ROOM_TYPES: RoomType[] = ['kitchen', 'balcony'];

/**
 * How many electrical points (sockets, switches, lights), plumbing points and radiators a room
 * of each type usually has — what the calculator counts with, since it has no plan to count
 * from. The studio counts the points actually placed instead (`EstimateCounts`).
 */
export const ROOM_POINTS: Record<RoomType, { electrical: number; plumbing: number; radiators: number }> = {
  living_room: { electrical: 10, plumbing: 0, radiators: 1 },
  bedroom: { electrical: 8, plumbing: 0, radiators: 1 },
  kitchen: { electrical: 10, plumbing: 2, radiators: 1 },
  bathroom: { electrical: 4, plumbing: 4, radiators: 1 },
  toilet: { electrical: 2, plumbing: 2, radiators: 0 },
  hallway: { electrical: 4, plumbing: 0, radiators: 0 },
  balcony: { electrical: 2, plumbing: 0, radiators: 0 },
  storage: { electrical: 2, plumbing: 0, radiators: 0 },
  office: { electrical: 8, plumbing: 0, radiators: 1 },
  closet: { electrical: 2, plumbing: 0, radiators: 0 },
  // A studio is priced by its two parts (`parts`); this is only its kitchen and living room together.
  studio: { electrical: 20, plumbing: 2, radiators: 2 },
};

/** The washing machine's water and drain: one plumbing point per flat that has a bathroom or a kitchen. */
export const WASHING_MACHINE_POINTS = 1;

/** Metres of heating pipe one radiator needs, run from the boiler. */
export const HEATING_PIPE_M_PER_RADIATOR = 25;

/**
 * The two works that come in two kinds. The floor is laid as laminate or as parquet (the
 * material itself is the person's pick from the catalogue); the ceiling is plasterboard,
 * then filled and painted, or a stretch ceiling (ბარისოლი), which comes finished.
 */
export type { WorkChoices };

export const DEFAULT_WORK_CHOICES: WorkChoices = { floor: 'laminate', ceiling: 'gypsum' };

/** A stored choice, read defensively: anything unknown is the default. */
export function workChoices(input?: Partial<WorkChoices> | null): WorkChoices {
  return {
    floor: input?.floor === 'parquet' ? 'parquet' : 'laminate',
    ceiling: input?.ceiling === 'barisol' ? 'barisol' : 'gypsum',
  };
}

/**
 * The labour book, as the renovation team prices it. Where the team gave a range the middle
 * of it is used (plastering 15–18 ₾, plumbing pipes 30–35 ₾); admin can reprice any line at
 * `/admin/rates`. Two lines are material and labour in one price, as the team quotes them:
 * the floor screed and the stretch ceiling.
 */
export const WORKER_RATES = {
  // 0 — stripping out an old renovation (rough figures: it depends on the flat, the site and the floor).
  demolish_floor: { labelKa: 'ძველი იატაკის ნგრევა', pricePerM2: 15, unit: 'm2' as const },
  demolish_walls: { labelKa: 'კედლების ძველი საფარის ნგრევა', pricePerM2: 20, unit: 'm2' as const },
  demolish_tiles: { labelKa: 'ძველი კაფელის და მეტლახის ნგრევა', pricePerM2: 12, unit: 'm2' as const },
  debris_old: { labelKa: 'ძველი რემონტის ნაგვის გატანა', pricePerM2: 40, unit: 'm2' as const },
  // 1 — building the partition walls.
  wall_build: { labelKa: 'კედლების აშენება (ხელობა, მოტანა)', pricePerM2: 45, unit: 'm2' as const },
  // 2 — heating.
  heating_piping: { labelKa: 'გათბობის მილების დაქსელვა', pricePerUnit: 50, unit: 'unit' as const },
  radiator_mount: { labelKa: 'რადიატორის მიყენება', pricePerUnit: 50, unit: 'unit' as const },
  // 3 — the floor screed, material and labour.
  floor_screed: { labelKa: 'იატაკის გაჭიმვა (მასალა და ხელობა)', pricePerM2: 35, unit: 'm2' as const },
  // 4 — electrical.
  electric_point: { labelKa: 'ელ. წერტილი (როზეტი, ჩამრთველი, სანათი)', pricePerUnit: 35, unit: 'unit' as const },
  wall_chasing: { labelKa: 'კედლის ამონგრევა ელ. წერტილისთვის', pricePerUnit: 5, unit: 'unit' as const },
  // 5 — plastering.
  plaster_walls: { labelKa: 'კედლების შელესვა', pricePerM2: 16.5, unit: 'm2' as const },
  // 6 — painting the walls.
  paint_walls: { labelKa: 'კედლების შეღებვა და დამუშავება', pricePerM2: 35, unit: 'm2' as const },
  // 7 — plumbing.
  plumbing_install: { labelKa: 'სანტექნიკის წერტილი', pricePerUnit: 80, unit: 'unit' as const },
  // 8 — the bathroom's floor and walls, ready for tiles.
  bath_screed: { labelKa: 'სააბაზანოს იატაკის გაჭიმვა', pricePerM2: 80, unit: 'm2' as const },
  bath_wall_prep: { labelKa: 'სააბაზანოს კედლების მომზადება', pricePerM2: 80, unit: 'm2' as const },
  // 9 — the bathroom's tiles.
  bath_tiling: { labelKa: 'სააბაზანოში ფილების გაკვრა', pricePerM2: 60, unit: 'm2' as const },
  // 10 — the kitchen's floor tiles.
  kitchen_tiling: { labelKa: 'სამზარეულოს მეტლახის დაგება', pricePerM2: 60, unit: 'm2' as const },
  // 11 — the floor covering: one of the two, by `WorkChoices.floor`.
  laminate_laying: { labelKa: 'ლამინატის დაგება', pricePerM2: 15, unit: 'm2' as const },
  parquet_laying: { labelKa: 'პარკეტის დაგება', pricePerM2: 80, unit: 'm2' as const },
  // 12 — the ceiling: plasterboard and its painting, or a stretch ceiling, by `WorkChoices.ceiling`.
  ceiling_gypsum: { labelKa: 'თაბაშირ-მუყაოს ჭერის აწყობა', pricePerM2: 30, unit: 'm2' as const },
  ceiling_finish: { labelKa: 'ჭერის შეღებვა და დამუშავება', pricePerM2: 35, unit: 'm2' as const },
  ceiling_barisol: { labelKa: 'ბარისოლის ჭერი (მასალა და ხელობა)', pricePerM2: 35, unit: 'm2' as const },
  // 13 — doors.
  door_install: { labelKa: 'კარის დაყენება', pricePerUnit: 150, unit: 'unit' as const },
  // 14 — rubbish from a new build (≈ 500 ₾ for 100 m²).
  debris_new: { labelKa: 'ნაგვის გატანა', pricePerM2: 5, unit: 'm2' as const },
  // Studio-only work the team did not price: the equipment the technical step can place.
  ac_install: { labelKa: 'კონდიციონერის მონტაჟი', pricePerUnit: 180, unit: 'unit' as const },
  extractor_install: { labelKa: 'გამწოვის მონტაჟი', pricePerUnit: 60, unit: 'unit' as const },
  // Fitting a skirting board or a cornice the person chose, per running metre.
  trim_install: { labelKa: 'პლინტუსის მონტაჟი', pricePerUnit: 4, unit: 'unit' as const },
} as const;

export type WorkerRateKey = keyof typeof WORKER_RATES;

/**
 * What a material's quantity is counted from. The areas split the flat the way the team does:
 * bathrooms (`bath_*`) apart from everything else (`dry_*`), the partition walls apart from
 * the room walls; the counts are points and radiators.
 */
export const MATERIAL_BASES = [
  'floor',
  'dry_floor',
  'bath_floor',
  'wall',
  'dry_wall',
  'bath_wall',
  'ceiling',
  'partition',
  'radiator',
  'electric_point',
  'plumbing_point',
] as const;
export type MaterialBasis = (typeof MATERIAL_BASES)[number];

export interface MaterialRate {
  labelKa: string;
  qtyPerM2: number;
  unit: 'm2' | 'linear_m' | 'piece' | 'liter' | 'kg' | 'm3';
  wasteFactorPct: number;
  phase: number;
  basis: MaterialBasis;
  linkedCategorySlug?: string | null;
  estimatedPriceGEL?: number | null;
}

/** The materials the team prices, per unit of their basis (a square metre, a radiator, a point). */
export const MATERIAL_RATES_PER_M2: Record<string, MaterialRate> = {
  wall_blocks: {
    labelKa: 'ბლოკი 15სმ, ქვიშა, ცემენტი (13 ბლოკი მ²-ზე)',
    qtyPerM2: 1,
    unit: 'm2',
    wasteFactorPct: 0,
    phase: 1,
    basis: 'partition',
    estimatedPriceGEL: 45,
  },
  heating_pipe: {
    labelKa: 'გათბობის მილი (25 მ რადიატორზე)',
    qtyPerM2: HEATING_PIPE_M_PER_RADIATOR,
    unit: 'linear_m',
    wasteFactorPct: 0,
    phase: 2,
    basis: 'radiator',
    estimatedPriceGEL: 3.6,
  },
  electric_cable: {
    labelKa: 'ელ. სადენი (შნური)',
    qtyPerM2: 1,
    unit: 'm2',
    wasteFactorPct: 0,
    phase: 4,
    basis: 'floor',
    estimatedPriceGEL: 12,
  },
  plaster_mix: {
    labelKa: 'შელესვის მასალა (ცემენტი, ქვიშა)',
    qtyPerM2: 1,
    unit: 'm2',
    wasteFactorPct: 0,
    phase: 5,
    basis: 'dry_wall',
    estimatedPriceGEL: 12,
  },
  wall_putty: {
    labelKa: 'იაპი გიფსი, შპაკლი',
    qtyPerM2: 1,
    unit: 'm2',
    wasteFactorPct: 0,
    phase: 6,
    basis: 'dry_wall',
    estimatedPriceGEL: 5,
  },
  plumbing_pipes: {
    labelKa: 'სანტექნიკის მილები (წერტილზე)',
    qtyPerM2: 1,
    unit: 'piece',
    wasteFactorPct: 0,
    phase: 7,
    basis: 'plumbing_point',
    estimatedPriceGEL: 32.5,
  },
  bath_floor_mix: {
    labelKa: 'შავი ქვიშა, ცემენტი (სააბაზანოს იატაკი)',
    qtyPerM2: 1,
    unit: 'm2',
    wasteFactorPct: 0,
    phase: 8,
    basis: 'bath_floor',
    estimatedPriceGEL: 40,
  },
  bath_wall_adhesive: {
    labelKa: 'წებო-ცემენტი (სააბაზანოს კედლები)',
    qtyPerM2: 1,
    unit: 'm2',
    wasteFactorPct: 0,
    phase: 8,
    basis: 'bath_wall',
    estimatedPriceGEL: 12,
  },
  ceiling_board: {
    labelKa: 'თაბაშირ-მუყაო (ჭერი)',
    qtyPerM2: 1,
    unit: 'm2',
    wasteFactorPct: 0,
    phase: 12,
    basis: 'ceiling',
    estimatedPriceGEL: 12,
  },
};

/** Materials that belong to one kind of a two-kind work (`WorkChoices`) and are left out for the other. */
export const MATERIAL_CHOICE: Record<string, Partial<WorkChoices>> = {
  ceiling_board: { ceiling: 'gypsum' },
};

/**
 * Every rate key the calculator shipped with before the team's book replaced it. A row of the
 * `rates` table under one of these is never read (`rateBookFromRows`), and
 * `pnpm db:seed:rates` deletes them — so a database seeded with the old book cannot bring its
 * prices or its units back.
 */
export const RETIRED_RATE_KEYS: readonly string[] = [
  // labour
  'strip_floor', 'strip_walls', 'strip_ceiling', 'strip_tiles', 'remove_doors_windows', 'remove_sanitary',
  'debris_removal', 'demolition', 'plumbing_rough', 'electrical_rough', 'insulation', 'screed', 'plastering',
  'waterproofing', 'tiling', 'windows', 'doors', 'flooring', 'ceiling', 'painting', 'electrical_finish',
  'plumbing_finish', 'electrical_point', 'lighting_point', 'plumbing_point', 'radiator_install',
  // materials
  'debris_bags', 'waste_container', 'gas_block', 'construction_mesh', 'construction_foam', 'ppr_pipe_20mm',
  'ppr_pipe_25mm', 'sewage_pipe_50mm', 'sewage_pipe_110mm', 'pipe_fittings', 'cable_1_5mm', 'cable_2_5mm',
  'cable_4mm', 'corrugated_tube', 'junction_boxes', 'circuit_breakers', 'eps_insulation', 'vapor_barrier',
  'cement', 'sand', 'self_leveling', 'floor_primer', 'gypsum_plaster', 'plaster_primer', 'corner_beads',
  'joint_compound', 'waterproof_membrane', 'waterproof_tape', 'silicone', 'tile_adhesive', 'tile_grout',
  'tile_spacers', 'tile_leveling_svp', 'wall_primer_paint', 'interior_paint', 'ceiling_paint',
];

/** The phases whose work comes in two kinds (`WorkChoices`). */
export const FLOOR_PHASE = 11;
export const CEILING_PHASE = 12;

export const PHASE_NAMES: Record<number, string> = {
  0: 'ძველი რემონტის დემონტაჟი',
  1: 'კედლების აშენება',
  2: 'გათბობა',
  3: 'იატაკის გაჭიმვა',
  4: 'ელექტროობა',
  5: 'შელესვა',
  6: 'კედლების შეღებვა',
  7: 'სანტექნიკა',
  8: 'სააბაზანოს იატაკი და კედლები',
  9: 'სააბაზანოს ფილები',
  10: 'სამზარეულოს მეტლახი',
  11: 'იატაკის საფარი',
  12: 'ჭერი',
  13: 'კარები',
  14: 'ნაგვის გატანა',
};

export const CONTINGENCY_PCT = 15;
