/**
 * Estimated material prices for the things the plan counts but nobody picks from the
 * catalogue: sockets and switches, a basic light fitting, a metre of LED strip, a plumbing
 * point's pipe and fittings, a radiator, an air conditioner, a door, a window.
 *
 * They are what the word says — estimates for the Georgian market, in GEL, marked as such in
 * the budget — and the labour for each comes from the rate book (`WORKER_RATES`, the renovation
 * team's prices, editable in admin). A real product chosen in the catalogue always replaces the
 * estimate.
 */

import type { BuildMaterial, ElectricalKind, OpeningKind, TechnicalKind } from './types';

export const ELECTRICAL_MATERIAL_GEL: Record<ElectricalKind, number> = {
  socket: 14,
  socket_double: 22,
  socket_high: 14,
  socket_kitchen: 26,
  switch: 12,
  tv: 24,
  internet: 28,
  light_ceiling: 45,
  light_wall: 65,
  light_spot: 30,
  /** Per metre. */
  light_strip: 18,
  /** Per metre of under-cabinet strip. */
  light_furniture: 22,
};

/**
 * Which labour line of the rate book each electrical kind is installed under, and how many
 * points it counts. Every fitting is one of the electrician's points (`electric_point`); a
 * strip is priced per metre and counts one point per two metres.
 */
export const ELECTRICAL_LABOUR: Record<ElectricalKind, { key: 'electric_point'; perUnit: number }> = {
  socket: { key: 'electric_point', perUnit: 1 },
  socket_double: { key: 'electric_point', perUnit: 1 },
  socket_high: { key: 'electric_point', perUnit: 1 },
  socket_kitchen: { key: 'electric_point', perUnit: 1 },
  switch: { key: 'electric_point', perUnit: 1 },
  tv: { key: 'electric_point', perUnit: 1 },
  internet: { key: 'electric_point', perUnit: 1 },
  light_ceiling: { key: 'electric_point', perUnit: 1 },
  light_wall: { key: 'electric_point', perUnit: 1 },
  light_spot: { key: 'electric_point', perUnit: 1 },
  light_strip: { key: 'electric_point', perUnit: 0.5 },
  light_furniture: { key: 'electric_point', perUnit: 0.5 },
};

export type TechnicalLabourKey = 'plumbing_install' | 'radiator_mount' | 'heating_piping' | 'ac_install' | 'extractor_install' | 'electric_point';

/**
 * What each technical point costs when the estimate has not already counted it. The
 * renovation's own phases (`lib/calculator`) price the wiring, the plumbing points and the
 * radiators' pipework and hanging from the points the plan holds; these rates are for the
 * point on its own — one somebody added to a flat whose phase is not being done — and for
 * the equipment itself (the radiator, the panel, the boiler, the air conditioner), which the
 * phases never price.
 *
 * `pipes`: the material is the plumbing point's pipes (`plumbing_pipes`, 30–35 ₾ a point),
 * which the plumbing phase already buys for every point it counts. `covered`: the whole point
 * is the heating phase's pipework, counted per radiator — a heating pipe marked on the plan
 * adds nothing to it.
 */
export const TECHNICAL_RATES: Record<
  TechnicalKind,
  { materialGel: number; labour: TechnicalLabourKey; labourUnits: number; section: 'plumbing' | 'heating' | 'climate' | 'electrical'; pipes?: boolean; covered?: boolean }
> = {
  water_supply: { materialGel: 32.5, labour: 'plumbing_install', labourUnits: 1, section: 'plumbing', pipes: true },
  sewer: { materialGel: 32.5, labour: 'plumbing_install', labourUnits: 1, section: 'plumbing', pipes: true },
  floor_drain: { materialGel: 32.5, labour: 'plumbing_install', labourUnits: 1, section: 'plumbing', pipes: true },
  gas: { materialGel: 32.5, labour: 'plumbing_install', labourUnits: 1, section: 'plumbing', pipes: true },
  electrical_panel: { materialGel: 260, labour: 'electric_point', labourUnits: 4, section: 'electrical' },
  radiator: { materialGel: 340, labour: 'radiator_mount', labourUnits: 1, section: 'heating' },
  ac_unit: { materialGel: 1250, labour: 'ac_install', labourUnits: 1, section: 'climate' },
  extractor: { materialGel: 120, labour: 'extractor_install', labourUnits: 1, section: 'climate' },
  boiler: { materialGel: 950, labour: 'plumbing_install', labourUnits: 2, section: 'heating' },
  /** 25 m of pipe at 3.60 ₾ and the fitter's 50 ₾ — the team's per-radiator pipework. */
  heating_pipe: { materialGel: 90, labour: 'heating_piping', labourUnits: 1, section: 'heating', covered: true },
};

/** The default labour price per unit when the rate book has no row for a key. */
export const TECHNICAL_LABOUR_DEFAULT_GEL: Record<TechnicalLabourKey, number> = {
  electric_point: 35,
  plumbing_install: 80,
  radiator_mount: 50,
  heating_piping: 50,
  ac_install: 180,
  extractor_install: 60,
};

/** Fitting a skirting board or a cornice, per running metre, when the rate book has no `trim_install` row. */
export const TRIM_INSTALL_DEFAULT_GEL = 4;

/** Doors per leaf, windows per square metre, archways nothing (a hole in the wall). */
export const OPENING_ESTIMATE_GEL: Record<OpeningKind, number> = {
  door: 380,
  window: 420,
  archway: 0,
};
export const ENTRANCE_DOOR_GEL = 950;

/** How the material changes the estimate: PVC is the baseline for windows, wood for doors. */
export const OPENING_MATERIAL_FACTOR: Partial<Record<BuildMaterial, number>> = {
  pvc: 1,
  wood: 1.25,
  aluminium: 1.35,
  metal: 1.2,
  glass: 1.5,
};
