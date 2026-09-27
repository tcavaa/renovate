/**
 * The colours of the build mode — one language for the 2D editor, the 3D view's outlines
 * and the layers panel, so a thing looks the same everywhere it is drawn.
 *
 * The plan itself reads like an architect's drawing: black walls, white floors, red doors,
 * blue windows (`EDITOR`). A room's type is its label, not a tint — the tints below mark the
 * type in the lists beside the plan (the rooms panel, a studio's parts). Structure can be
 * coloured by *origin* instead (what came with the flat, what the person changed, what the
 * app generated, the "origins" layer), and the technical systems by what flows through them.
 */

import type { RoomType } from '@/lib/calculator/types';
import type { ElementOrigin, TechnicalKind } from '@/lib/design/types';

/** A room type's swatch in the lists beside the plan (the plan's floors are white). */
export const ROOM_TINT_STRONG: Record<RoomType, string> = {
  living_room: '#E6C79A',
  bedroom: '#B7C4EA',
  kitchen: '#F0C589',
  bathroom: '#9FD1E0',
  toilet: '#ABD5DC',
  hallway: '#CFCAC0',
  balcony: '#BCDBA8',
  storage: '#D2C8B8',
  office: '#C6BAE6',
  studio: '#EBC690',
  closet: '#DCC9AF',
};

/** Structure by who put it there. */
export const ORIGIN_COLOR: Record<ElementOrigin, string> = {
  existing: '#3A3733',
  user: '#E85D26',
  generated: '#2E8B85',
};

export const ORIGIN_SOFT: Record<ElementOrigin, string> = {
  existing: '#8A8378',
  user: '#F19E73',
  generated: '#7FC1BC',
};

/** Technical systems by what runs through them. */
export const TECHNICAL_COLOR: Record<TechnicalKind, string> = {
  water_supply: '#2F7FD6',
  sewer: '#8A5A2B',
  floor_drain: '#5C4A34',
  electrical_panel: '#D9A000',
  gas: '#E0B300',
  radiator: '#D64545',
  ac_unit: '#2FA7A0',
  extractor: '#5D8AA8',
  boiler: '#C2442F',
  heating_pipe: '#E07A5F',
};

export const ELECTRICAL_COLOR = {
  socket: '#C9A227',
  switch: '#8C6B1A',
  data: '#3F7ACC',
  lightOn: '#F5B400',
  lightOff: '#A39D94',
};

export const EDITOR = {
  paper: '#FBFAF7',
  gridMinor: '#EEEAE2',
  gridMajor: '#DDD6CB',
  /** Every room's floor, a studio's two parts alike; its type is on its label. */
  roomFill: '#FFFFFF',
  roomHover: '#F4F2EE',
  roomSelected: '#FCEBE2',
  wall: '#141414',
  wallLocked: '#2B2B2B',
  /** A partition that already stands in a black frame (`Wall.built`): not built again, not priced. */
  wallBuilt: '#A29C93',
  /** A room separator (`Wall.separator`): the dashed line where one room opens onto the next. */
  separator: '#141414',
  selected: '#E85D26',
  hover: '#F5A623',
  guide: '#2FA7A0',
  door: '#D92D20',
  window: '#5B8FB9',
  label: '#161513',
  labelMuted: '#6F6A63',
  dimension: '#3A3733',
  column: '#4A4A4A',
  beam: '#7A6E62',
  zone: '#2E8B85',
  furniture: '#B9B2A6',
  furnitureFill: 'rgba(233,226,216,0.55)',
  valid: '#22C55E',
  invalid: '#EF4444',
};
