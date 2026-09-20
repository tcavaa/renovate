/**
 * Estimated material prices for the things the plan counts but nobody picks from the
 * catalogue: sockets and switches, a basic light fitting, a metre of LED strip, a plumbing
 * point's pipe and fittings, a radiator, an air conditioner, a door, a window.
 *
 * They are what the word says — estimates for the Georgian market, in GEL, marked as such in
 * the budget — and the labour for each comes from the rate book (`WORKER_RATES`, editable in
 * admin). A real product chosen in the catalogue always replaces the estimate.
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

/** Which labour line of the rate book each electrical kind is installed under, and how many units it counts. */
export const ELECTRICAL_LABOUR: Record<ElectricalKind, { key: 'electrical_point' | 'lighting_point'; perUnit: number }> = {
  socket: { key: 'electrical_point', perUnit: 1 },
  socket_double: { key: 'electrical_point', perUnit: 1 },
  socket_high: { key: 'electrical_point', perUnit: 1 },
  socket_kitchen: { key: 'electrical_point', perUnit: 1 },
  switch: { key: 'electrical_point', perUnit: 1 },
  tv: { key: 'electrical_point', perUnit: 1 },
  internet: { key: 'electrical_point', perUnit: 1 },
  light_ceiling: { key: 'lighting_point', perUnit: 1 },
  light_wall: { key: 'lighting_point', perUnit: 1 },
  light_spot: { key: 'lighting_point', perUnit: 1 },
  /** Strips are priced per metre; one point of labour per two metres. */
  light_strip: { key: 'lighting_point', perUnit: 0.5 },
  light_furniture: { key: 'lighting_point', perUnit: 0.5 },
};

export type TechnicalLabourKey = 'plumbing_point' | 'radiator_install' | 'ac_install' | 'extractor_install' | 'electrical_point';

export const TECHNICAL_RATES: Record<TechnicalKind, { materialGel: number; labour: TechnicalLabourKey; labourUnits: number; section: 'plumbing' | 'heating' | 'climate' | 'electrical' }> = {
  water_supply: { materialGel: 60, labour: 'plumbing_point', labourUnits: 1, section: 'plumbing' },
  sewer: { materialGel: 75, labour: 'plumbing_point', labourUnits: 1, section: 'plumbing' },
  floor_drain: { materialGel: 85, labour: 'plumbing_point', labourUnits: 1, section: 'plumbing' },
  electrical_panel: { materialGel: 260, labour: 'electrical_point', labourUnits: 4, section: 'electrical' },
  gas: { materialGel: 150, labour: 'plumbing_point', labourUnits: 1, section: 'plumbing' },
  radiator: { materialGel: 340, labour: 'radiator_install', labourUnits: 1, section: 'heating' },
  ac_unit: { materialGel: 1250, labour: 'ac_install', labourUnits: 1, section: 'climate' },
  extractor: { materialGel: 120, labour: 'extractor_install', labourUnits: 1, section: 'climate' },
  boiler: { materialGel: 950, labour: 'plumbing_point', labourUnits: 2, section: 'heating' },
  heating_pipe: { materialGel: 70, labour: 'plumbing_point', labourUnits: 1, section: 'heating' },
};

/** The default labour price per unit when the rate book has no row for a key. */
export const TECHNICAL_LABOUR_DEFAULT_GEL: Record<TechnicalLabourKey | 'lighting_point', number> = {
  electrical_point: 25,
  lighting_point: 35,
  plumbing_point: 90,
  radiator_install: 120,
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
