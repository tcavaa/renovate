/**
 * What each decor family is made of and how it is set by default — the reference library's
 * primitives (`reference-library.json`, "primitives") as code. A family names its slots (the
 * parts that wear a material of their own), which kinds of material each slot takes, and the
 * knobs it starts from.
 */

import type { DecorFamily, DecorParams, DecorSlot } from '@/lib/design/types';
import type { DecorMaterialKind } from './materials';

export interface DecorSlotSpec {
  /** Kinds of material this slot takes, the usual first. */
  kinds: DecorMaterialKind[];
  /** The piece stands without it (a screen of slats with no board behind, no light line). */
  optional?: boolean;
}

export interface DecorFamilySpec {
  slots: Partial<Record<DecorSlot, DecorSlotSpec>>;
  /** The knobs a piece of this family starts from; its own `params` override them. */
  params: DecorParams;
}

export const DECOR_FAMILY_LIST: DecorFamily[] = ['slats', 'moulding', 'niche', 'slab', 'light', 'panel', 'cladding', 'mural', 'tile', 'box'];

/** The families the AI designer composes with: not the WC's box, which the generation builds behind every WC itself (`wcBoxes`). */
export const AI_DECOR_FAMILIES: DecorFamily[] = DECOR_FAMILY_LIST.filter((f) => f !== 'box');

export const DECOR_FAMILIES: Record<DecorFamily, DecorFamilySpec> = {
  slats: {
    slots: { face: { kinds: ['wood', 'board'] }, backing: { kinds: ['board'], optional: true }, led: { kinds: ['led'], optional: true } },
    params: { slatWidthMm: 40, gapMm: 18, depthMm: 22, backing: true, led: 'none' },
  },
  moulding: {
    slots: { profile: { kinds: ['moulding'] } },
    params: { dadoMm: 920, bayWidthMm: 780, upper: true, lower: true, rail: true },
  },
  niche: {
    slots: { body: { kinds: ['gypsum'] }, shelf: { kinds: ['wood'], optional: true }, surround: { kinds: ['stone'], optional: true }, led: { kinds: ['led'], optional: true } },
    params: { shape: 'arch', count: 2, nicheWidthMm: 900, nicheHeightMm: 2000, depthMm: 300, shelves: 3, mantel: false, led: 'inside' },
  },
  slab: {
    slots: { face: { kinds: ['stone', 'concrete'] }, trim: { kinds: ['trim'], optional: true }, led: { kinds: ['led'], optional: true } },
    params: { thicknessMm: 20, standoffMm: 40, moduleWidthMm: 1600, moduleHeightMm: 3200, jointMm: 2, led: 'none' },
  },
  light: {
    slots: { led: { kinds: ['led'] }, body: { kinds: ['gypsum'], optional: true } },
    params: { path: 'cove' },
  },
  panel: {
    slots: { face: { kinds: ['fabric', 'relief', 'board', 'wood'] }, led: { kinds: ['led'], optional: true } },
    params: { style: 'upholstered', moduleWidthMm: 300, jointMm: 6, thicknessMm: 50, led: 'none' },
  },
  cladding: {
    slots: { face: { kinds: ['brick', 'concrete', 'wood'] }, trim: { kinds: ['trim'], optional: true } },
    params: { moduleWidthMm: 600, moduleHeightMm: 1200, jointMm: 4, thicknessMm: 15 },
  },
  mural: {
    slots: { face: { kinds: ['wallpaper'] }, trim: { kinds: ['moulding', 'trim'], optional: true } },
    params: { thicknessMm: 2 },
  },
  tile: {
    slots: { face: { kinds: ['tile', 'stone'] }, border: { kinds: ['tile'], optional: true }, trim: { kinds: ['trim'], optional: true } },
    params: { moduleWidthMm: 300, moduleHeightMm: 300, jointMm: 3, thicknessMm: 10, border: false },
  },
  // A wall-hung WC's installation box: plasterboard, tiled (face) or painted (the body's colour).
  box: {
    slots: { body: { kinds: ['gypsum'] }, face: { kinds: ['tile', 'stone'], optional: true } },
    params: { depthMm: 200, full: false },
  },
};

/** A piece's knobs with its family's defaults under them. */
export function decorParams(family: DecorFamily, params: DecorParams | undefined): DecorParams {
  return { ...DECOR_FAMILIES[family].params, ...(params ?? {}) };
}

/** The slots a family has, in the order they are listed. */
export function decorSlots(family: DecorFamily): DecorSlot[] {
  return Object.keys(DECOR_FAMILIES[family].slots) as DecorSlot[];
}

/** Whether a slot of a family takes a material of this kind. */
export function slotTakes(family: DecorFamily, slot: DecorSlot, kind: DecorMaterialKind | null): boolean {
  return !!kind && !!DECOR_FAMILIES[family].slots[slot]?.kinds.includes(kind);
}

/** Whether a piece's light line is on (a light family is its own line). */
export function hasLed(family: DecorFamily, params: DecorParams): boolean {
  if (family === 'light') return true;
  return !!DECOR_FAMILIES[family].slots.led && !!params.led && params.led !== 'none';
}
