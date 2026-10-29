/**
 * A shower's floor and its glass (the owner's notes of 29 Oct 2026: "a shower enclosure's glass is
 * walls on the 2D board, 2–5 cm thick, whose height and width the person changes").
 *
 * The shower slot is an area (`PlacedItem.areaM`: the tray the layout squared into a corner), with
 * the product — a column or a panel, about 50 cm across — standing at its back against the wall.
 * The area is not stored where it is: it is found from the piece, its back on the piece's back and
 * centred across it, so it follows the shower wherever it is dragged or turned. Its glass stands on
 * every side of the area that is not on a wall of the room — the front, and the side away from the
 * corner — inside the area's footprint, `PlacedItem.glass` thick and tall (defaults below).
 *
 * The glass is not a wall of the plan: a wall bounds rooms (`roomsFromWalls`), and an enclosure
 * drawn as walls would have made the shower a room of its own. It is drawn as walls are — on the
 * board, the PDF and in 3D — and edited on the piece's card.
 *
 * Pure: no React, no three.js.
 */

import { roomEdges } from './planGeometry';
import type { PlacedItem, PlanRoom, Vec2 } from './types';

/** A shower's glass unless the person changed it: drawn 3 cm thick (2–5 cm), 2 m tall. */
export const SHOWER_GLASS_THICKNESS_M = 0.03;
export const SHOWER_GLASS_MIN_THICKNESS_M = 0.02;
export const SHOWER_GLASS_MAX_THICKNESS_M = 0.05;
export const SHOWER_GLASS_HEIGHT_M = 2;
/** The smallest and largest a shower's area is made by hand (the layout's smallest is 80 × 80). */
export const SHOWER_AREA_MIN_M = 0.7;
export const SHOWER_AREA_MAX_M = 2;
/** A side this close to a wall, and along it, is on the wall: no glass there. */
const ON_WALL_M = 0.08;

export interface ShowerArea {
  centre: Vec2;
  rotation: number;
  width: number;
  depth: number;
}

export interface GlassPane {
  a: Vec2;
  b: Vec2;
  thicknessM: number;
  heightM: number;
}

const axes = (rotation: number) => ({ forward: { x: Math.sin(rotation), z: Math.cos(rotation) }, right: { x: Math.cos(rotation), z: -Math.sin(rotation) } });

/** The shower's glass as it is: the person's, else the defaults. */
export function glassOf(item: Pick<PlacedItem, 'glass'>): { thicknessM: number; heightM: number } {
  return { thicknessM: item.glass?.thicknessM ?? SHOWER_GLASS_THICKNESS_M, heightM: item.glass?.heightM ?? SHOWER_GLASS_HEIGHT_M };
}

/** The floor a shower takes, where it is now: its back on the piece's back, centred across it. Null for anything else. */
export function showerArea(item: Pick<PlacedItem, 'slot' | 'areaM' | 'position' | 'rotation' | 'size'>): ShowerArea | null {
  if (item.slot !== 'shower' || !item.areaM) return null;
  const { forward } = axes(item.rotation);
  const ahead = item.areaM.depth / 2 - item.size.depth / 2;
  return { centre: { x: item.position.x + forward.x * ahead, z: item.position.z + forward.z * ahead }, rotation: item.rotation, width: item.areaM.width, depth: item.areaM.depth };
}

/** The area's four corners, back-left first, going round. */
function corners(area: ShowerArea): Vec2[] {
  const { forward, right } = axes(area.rotation);
  const at = (across: number, ahead: number) => ({ x: area.centre.x + right.x * across + forward.x * ahead, z: area.centre.z + right.z * across + forward.z * ahead });
  const w = area.width / 2;
  const d = area.depth / 2;
  return [at(-w, -d), at(w, -d), at(w, d), at(-w, d)];
}

/** Whether a stretch from `a` to `b` lies along a wall of the room. */
function onWall(a: Vec2, b: Vec2, room: Pick<PlanRoom, 'polygon'>): boolean {
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return true;
  const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  return roomEdges(room.polygon).some((edge) => {
    if (Math.abs(dir.x * edge.dir.z - dir.z * edge.dir.x) > 0.05) return false;
    const off = Math.abs((mid.x - edge.a.x) * edge.inward.x + (mid.z - edge.a.z) * edge.inward.z);
    const along = (mid.x - edge.a.x) * edge.dir.x + (mid.z - edge.a.z) * edge.dir.z;
    return off < ON_WALL_M && along > -ON_WALL_M && along < edge.length + ON_WALL_M;
  });
}

/**
 * The shower's glass: a pane on each side of its area that is not on a wall of the room, inside
 * the area by half its thickness. None for a piece that is not a shower with an area.
 */
export function showerGlass(item: Pick<PlacedItem, 'slot' | 'areaM' | 'position' | 'rotation' | 'size' | 'glass'>, room: Pick<PlanRoom, 'polygon'>): GlassPane[] {
  const area = showerArea(item);
  if (!area) return [];
  const { thicknessM, heightM } = glassOf(item);
  const ring = corners(area);
  const inset = thicknessM / 2;
  const panes: GlassPane[] = [];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    if (onWall(a, b, room)) continue;
    // Pulled in towards the area's middle, so the glass stands on the tray, not in the way past it.
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const toCentre = { x: area.centre.x - mid.x, z: area.centre.z - mid.z };
    const len = Math.hypot(toCentre.x, toCentre.z) || 1;
    const shift = { x: (toCentre.x / len) * inset, z: (toCentre.z / len) * inset };
    panes.push({ a: { x: a.x + shift.x, z: a.z + shift.z }, b: { x: b.x + shift.x, z: b.z + shift.z }, thicknessM, heightM });
  }
  return panes;
}

/**
 * The shower resized on its card: its area's width and depth (kept between the smallest and the
 * largest a shower is) — its back staying on its wall and a side on a wall staying on it, the
 * piece moving across to keep it there — and its glass's thickness (2–5 cm) and height.
 */
export function resizedShower(item: PlacedItem, room: Pick<PlanRoom, 'polygon'>, change: { widthM?: number; depthM?: number; glassThicknessM?: number; glassHeightM?: number }): Pick<PlacedItem, 'areaM' | 'glass' | 'position'> | null {
  const area = showerArea(item);
  if (!area || !item.areaM) return null;
  const clampArea = (n: number) => Math.min(SHOWER_AREA_MAX_M, Math.max(SHOWER_AREA_MIN_M, n));
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const glass = glassOf(item);
  const width = round(clampArea(change.widthM ?? item.areaM.width));
  const depth = round(clampArea(change.depthM ?? item.areaM.depth));
  // The side on a wall stays on it: the piece moves across by half the change, away from that wall.
  const ring = corners(area);
  const leftOnWall = onWall(ring[0], ring[3], room);
  const rightOnWall = onWall(ring[1], ring[2], room);
  const across = leftOnWall === rightOnWall ? 0 : ((width - item.areaM.width) / 2) * (leftOnWall ? 1 : -1);
  const { right } = axes(item.rotation);
  return {
    areaM: { width, depth },
    glass: {
      thicknessM: round(Math.min(SHOWER_GLASS_MAX_THICKNESS_M, Math.max(SHOWER_GLASS_MIN_THICKNESS_M, change.glassThicknessM ?? glass.thicknessM))),
      heightM: round(Math.min(2.6, Math.max(1.6, change.glassHeightM ?? glass.heightM))),
    },
    position: { x: round(item.position.x + right.x * across), z: round(item.position.z + right.z * across) },
  };
}
