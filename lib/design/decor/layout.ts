/**
 * How a decor piece fits its wall — pure geometry the 3D builder draws and the budget measures,
 * so what is drawn and what is bought are worked out once, the same way.
 *
 * Every shape is in the wall's own frame: x metres along the room edge from its first corner,
 * y metres above the floor, z metres out from the wall face into the room. The reference
 * library's rules for each family are followed: a real slat section repeated a whole number of
 * times with the remainder centred, frames split at doors and windows rather than stretched,
 * niches built out from the wall (its construction is unknown), slabs seamed at their real
 * size, light along a path that can be measured.
 */

import { roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import type { DecorParams, DecorPiece, Opening, PlanRoom } from '@/lib/design/types';
import { DECOR_FAMILIES } from './families';
import { COVE_DROP_M, COVE_GAP_M, COVE_STRIP_BACK_M } from '@/lib/design/rules';

const mm = (v: number | undefined, fallback: number) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) / 1000 : fallback / 1000);

export interface DecorWall {
  edge: PlanEdge;
  /** The stretch of the wall the piece covers, clipped to the wall. */
  x0: number;
  x1: number;
  /** Its band of height, clipped to the room. */
  y0: number;
  y1: number;
  width: number;
  height: number;
  roomHeight: number;
}

/** A piece's knobs over its family's defaults. */
export function paramsOf(piece: Pick<DecorPiece, 'family' | 'params'>): DecorParams {
  return { ...DECOR_FAMILIES[piece.family].params, ...(piece.params ?? {}) };
}

/** The wall a piece stands on and the part of it it covers; null for a piece with no wall or a stretch too small to build. */
export function decorWall(piece: Pick<DecorPiece, 'wallIndex' | 'span' | 'height'>, room: Pick<PlanRoom, 'polygon' | 'heightM'>): DecorWall | null {
  if (piece.wallIndex == null) return null;
  const edge = roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
  if (!edge) return null;
  const x0 = Math.max(0, Math.min(piece.span.from, piece.span.to));
  const x1 = Math.min(edge.length, Math.max(piece.span.from, piece.span.to));
  const y0 = Math.max(0, Math.min(piece.height.from, piece.height.to));
  const y1 = Math.min(room.heightM, Math.max(piece.height.from, piece.height.to));
  if (x1 - x0 < 0.1 || y1 - y0 < 0.05) return null;
  return { edge, x0, x1, y0, y1, width: x1 - x0, height: y1 - y0, roomHeight: room.heightM };
}

/** Free stretches of a wall between its doors and windows, each with a margin round the opening. */
export function freeSpans(edge: PlanEdge, openings: Opening[], from = 0, to = edge.length, margin = 0.1): Array<[number, number]> {
  const blocked = openings
    .filter((o) => o.wallIndex === edge.index)
    .map((o) => [o.t * edge.length - o.widthM / 2 - margin, o.t * edge.length + o.widthM / 2 + margin] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const spans: Array<[number, number]> = [];
  let x = from;
  for (const [a, b] of blocked) {
    if (a > x) spans.push([x, Math.min(a, to)]);
    x = Math.max(x, b);
  }
  if (x < to) spans.push([x, to]);
  return spans.filter(([a, b]) => b - a > 0.05);
}

// ---------------------------------------------------------------------------
// Slats
// ---------------------------------------------------------------------------

export interface SlatFit {
  /** Each slat's centre along the wall. */
  xs: number[];
  slatWidth: number;
  depth: number;
  /** The board behind, its thickness (0 for a see-through screen). */
  backing: number;
  /** How far the slats' back stands off the wall. */
  standoff: number;
  /** Length of the light line, metres. */
  ledM: number;
}

/** As many whole slats as fit at the chosen pitch, the remainder split evenly at the ends. */
export function fitSlats(params: DecorParams, wall: DecorWall): SlatFit {
  const slatWidth = mm(params.slatWidthMm, 40);
  const gap = mm(params.gapMm, 18);
  const depth = mm(params.depthMm, 22);
  const count = Math.max(1, Math.floor((wall.width + gap) / (slatWidth + gap)));
  const used = count * slatWidth + (count - 1) * gap;
  const first = wall.x0 + (wall.width - used) / 2 + slatWidth / 2;
  const xs = Array.from({ length: count }, (_, i) => first + i * (slatWidth + gap));
  const led = params.led === 'bottom' || params.led === 'top' ? wall.width : params.led === 'halo' ? 2 * wall.width : 0;
  return { xs, slatWidth, depth, backing: params.backing === false ? 0 : 0.012, standoff: params.standoffMm && params.standoffMm > 0 ? params.standoffMm / 1000 : 0, ledM: led };
}

// ---------------------------------------------------------------------------
// Mouldings
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MouldingFit {
  frames: Rect[];
  rails: Array<{ x0: number; x1: number; y: number }>;
  /** The profile's face width, metres. */
  profile: number;
  /** Every metre of profile: frame perimeters and rails. */
  profileM: number;
}

/**
 * Lower and upper frames on every clear stretch of the wall, sized to divide it evenly (whole
 * bays only, never a stretched profile), a frame under a window and over a door or window where
 * there is room, and the chair rail.
 */
export function fitMoulding(params: DecorParams, wall: DecorWall, openings: Opening[], profileMm = 32): MouldingFit {
  const dado = Math.min(mm(params.dadoMm, 920), wall.y1 - 0.6);
  const target = mm(params.bayWidthMm, 780);
  const profile = profileMm / 1000;
  const gap = 0.12;
  const side = 0.14;
  const lowY0 = Math.max(wall.y0, 0) + 0.24;
  const lowY1 = dado - 0.1;
  const upY0 = dado + 0.12;
  const upY1 = wall.y1 - 0.3;
  const frames: Rect[] = [];
  const rails: MouldingFit['rails'] = [];
  const add = (x: number, y: number, w: number, h: number) => {
    if (w >= 0.22 && h >= 0.18) frames.push({ x, y, w, h });
  };
  for (const [s, e] of freeSpans(wall.edge, openings, wall.x0, wall.x1, 0.06)) {
    const inner = e - s - 2 * side;
    if (inner < 0.22) continue;
    const n = Math.max(1, Math.round((inner + gap) / (target + gap)));
    const w = (inner - (n - 1) * gap) / n;
    for (let k = 0; k < n; k++) {
      const x = s + side + k * (w + gap);
      if (params.lower !== false) add(x, lowY0, w, lowY1 - lowY0);
      if (params.upper !== false) add(x, upY0, w, upY1 - upY0);
    }
    if (params.rail !== false) rails.push({ x0: s, x1: e, y: dado });
  }
  for (const op of openings.filter((o) => o.wallIndex === wall.edge.index)) {
    const cx = op.t * wall.edge.length;
    if (cx < wall.x0 || cx > wall.x1) continue;
    const w = op.widthM - 0.1;
    if (op.kind === 'window' && op.sillM > 0.55 && params.lower !== false) add(cx - w / 2, lowY0, w, Math.min(lowY1, op.sillM - 0.12) - lowY0);
    const head = op.sillM + op.heightM;
    if (params.upper !== false && upY1 - (head + 0.14) > 0.2) add(cx - w / 2, head + 0.14, w, upY1 - head - 0.14);
  }
  const profileM = frames.reduce((sum, f) => sum + 2 * (f.w + f.h), 0) + rails.reduce((sum, r) => sum + (r.x1 - r.x0), 0);
  return { frames, rails, profile, profileM };
}

// ---------------------------------------------------------------------------
// Niches
// ---------------------------------------------------------------------------

export interface NicheOpening {
  cx: number;
  y0: number;
  w: number;
  h: number;
  arch: boolean;
}

export interface NicheFit {
  /** The build-out's depth from the wall; it runs the whole stretch and height of the piece. */
  depth: number;
  niches: NicheOpening[];
  shelves: Array<{ cx: number; y: number; w: number }>;
  /** A decorative mantel between a pair of niches, with its (decorative) firebox. */
  mantel: { cx: number; w: number; h: number; fireW: number; fireH: number } | null;
  /** The plasterboard: the front less the openings, plus each niche's sides, head and back. */
  bodyM2: number;
  shelfCount: number;
  surroundM2: number;
  ledM: number;
}

function openingArea(n: NicheOpening): number {
  if (!n.arch) return n.w * n.h;
  const r = n.w / 2;
  return n.w * (n.h - r) + (Math.PI * r * r) / 2;
}

function openingPerimeter(n: NicheOpening): number {
  if (!n.arch) return 2 * n.h + n.w;
  const r = n.w / 2;
  return 2 * (n.h - r) + Math.PI * r;
}

/** Niches spaced evenly along the build-out (a pair either side of a mantel when there is one), shelves inside. */
export function fitNiche(params: DecorParams, wall: DecorWall): NicheFit {
  const depth = Math.min(0.45, Math.max(0.12, mm(params.depthMm, 300)));
  const count = Math.max(1, Math.min(4, Math.round(params.count ?? 2)));
  const mantel = !!params.mantel && count === 2 && wall.width >= 3.2;
  const arch = params.shape !== 'rect';
  const fireW = 0.92;
  const fireH = 0.72;
  const mantelW = 1.55;
  const centres: number[] = [];
  let slot: number;
  if (mantel) {
    slot = (wall.width - mantelW - 0.15) / 2;
    centres.push(wall.x0 + slot / 2, wall.x1 - slot / 2);
  } else {
    slot = wall.width / count;
    for (let i = 0; i < count; i++) centres.push(wall.x0 + slot * (i + 0.5));
  }
  const w = Math.max(0.35, Math.min(mm(params.nicheWidthMm, 900), slot - 0.4));
  const y0 = wall.y0 + Math.min(0.5, wall.height * 0.18);
  const h = Math.max(w * 0.9, Math.min(mm(params.nicheHeightMm, 2000), wall.y1 - y0 - 0.3));
  const niches = centres.map((cx) => ({ cx, y0, w, h, arch }));
  const shelvesPer = Math.max(0, Math.min(5, Math.round(params.shelves ?? 3)));
  const shelves: NicheFit['shelves'] = [];
  const straight = arch ? h - w / 2 : h;
  for (const n of niches) {
    for (let k = 0; k < shelvesPer; k++) shelves.push({ cx: n.cx, y: n.y0 + 0.02 + (straight * k) / Math.max(1, shelvesPer), w: n.w });
  }
  const front = wall.width * wall.height - niches.reduce((s, n) => s + openingArea(n), 0) - (mantel ? fireW * fireH : 0);
  const returns = niches.reduce((s, n) => s + openingPerimeter(n) * depth + openingArea(n), 0);
  const ends = 2 * wall.height * depth;
  return {
    depth,
    niches,
    shelves,
    mantel: mantel ? { cx: wall.x0 + wall.width / 2, w: mantelW, h: 1.15, fireW, fireH } : null,
    bodyM2: front + returns + ends,
    shelfCount: shelves.length,
    surroundM2: mantel ? mantelW * 1.15 - fireW * fireH + 1.75 * 0.24 + 1.65 * 0.5 : 0,
    ledM: params.led === 'inside' ? niches.length * Math.min(0.6, w * 0.6) : 0,
  };
}

// ---------------------------------------------------------------------------
// Fields: slab, panel, cladding, mural, tile
// ---------------------------------------------------------------------------

export interface FieldFit {
  thickness: number;
  standoff: number;
  /** Where the seams or joints fall, balanced across the field (none where the texture draws its own). */
  seamsX: number[];
  seamsY: number[];
  /** Panel channels or flutes: each one's centre and width. */
  modules: Array<{ x: number; w: number }>;
  /** A tile field's border band along its top. */
  border: { y0: number; y1: number } | null;
  faceM2: number;
  /** The edge trim round the field's sides and top. */
  trimM: number;
  borderM: number;
  ledM: number;
}

/** Seams at the material's real size, balanced so no sliver is left at one end. */
function balanced(from: number, to: number, module: number): number[] {
  const length = to - from;
  if (module <= 0 || length <= module) return [];
  const n = Math.ceil(length / module);
  const step = length / n;
  return Array.from({ length: n - 1 }, (_, i) => from + step * (i + 1));
}

export function fitField(family: DecorPiece['family'], params: DecorParams, wall: DecorWall): FieldFit {
  const thickness = mm(params.thicknessMm, family === 'mural' ? 2 : 15);
  const standoff = family === 'slab' ? mm(params.standoffMm, 40) : 0;
  const moduleW = mm(params.moduleWidthMm, family === 'slab' ? 1600 : 600);
  const moduleH = mm(params.moduleHeightMm, family === 'slab' ? 3200 : 1200);
  // Slabs and flat panels show their seams; brick, tile and wallpaper draw their own joints in the texture.
  const seamed = family === 'slab' || (family === 'panel' && params.style === 'flat') || (family === 'cladding' && moduleW >= 0.4);
  const seamsX = seamed ? balanced(wall.x0, wall.x1, moduleW) : [];
  const seamsY = seamed ? balanced(wall.y0, wall.y1, moduleH) : [];
  const modules: FieldFit['modules'] = [];
  if (family === 'panel' && params.style !== 'flat') {
    const target = mm(params.moduleWidthMm, params.style === 'fluted' ? 60 : 300);
    const n = Math.max(2, Math.round(wall.width / target));
    const w = wall.width / n;
    for (let i = 0; i < n; i++) modules.push({ x: wall.x0 + w * (i + 0.5), w });
  }
  const border = family === 'tile' && params.border ? { y0: wall.y1 - 0.08, y1: wall.y1 } : null;
  const faceM2 = wall.width * (wall.height - (border ? border.y1 - border.y0 : 0));
  return {
    thickness,
    standoff,
    seamsX,
    seamsY,
    modules,
    border,
    faceM2,
    trimM: 2 * wall.height + wall.width,
    borderM: border ? wall.width : 0,
    ledM: params.led === 'halo' ? 2 * (wall.width + wall.height) * 0.92 : params.led === 'bottom' || params.led === 'top' ? wall.width : 0,
  };
}

// ---------------------------------------------------------------------------
// Light lines
// ---------------------------------------------------------------------------

export interface LightFit {
  /** World-space runs of the line, each from `a` to `b` at height `y`, with the way its light goes (into the room's walls for a cove). */
  runs: Array<{ a: { x: number; z: number }; b: { x: number; z: number }; y: number; outward: { x: number; z: number } }>;
  /** A cove's lowered ceiling panel: its outline inset from the walls and its height. */
  panel: { minX: number; maxX: number; minZ: number; maxZ: number; y: number; drop: number } | null;
  ledM: number;
  /** Plasterboard of the lowered panel (its face and edges). */
  panelM2: number;
}

/** A cove: a lowered ceiling panel inset from every wall with the light round its top edge; a line: along its wall at its height. */
export function fitLight(piece: Pick<DecorPiece, 'params' | 'wallIndex' | 'span' | 'height'>, room: Pick<PlanRoom, 'polygon' | 'heightM'>, params: DecorParams): LightFit {
  if (params.path !== 'line' || piece.wallIndex == null) {
    // A rectangle only: a lowered panel cannot follow an L-shaped room's outline yet.
    if (room.polygon.length !== 4) return { runs: [], panel: null, ledM: 0, panelM2: 0 };
    const xs = room.polygon.map((p) => p.x);
    const zs = room.polygon.map((p) => p.z);
    // The design rules' cove: the panel's edge 15 cm off the walls (10–20) and 12 cm under the
    // ceiling (10–15), the strip on it 5 cm back from the edge so it stays hidden and the light
    // spreads up the gap. `room.heightM` is the ceiling one sees (`underCeiling`).
    const inset = COVE_GAP_M;
    const drop = COVE_DROP_M;
    const minX = Math.min(...xs) + inset;
    const maxX = Math.max(...xs) - inset;
    const minZ = Math.min(...zs) + inset;
    const maxZ = Math.max(...zs) - inset;
    if (maxX - minX < 0.8 || maxZ - minZ < 0.8) return { runs: [], panel: null, ledM: 0, panelM2: 0 };
    const y = room.heightM - drop;
    const back = COVE_STRIP_BACK_M;
    const runs = [
      { a: { x: minX + back, z: minZ + back }, b: { x: maxX - back, z: minZ + back }, y, outward: { x: 0, z: -1 } },
      { a: { x: maxX - back, z: minZ + back }, b: { x: maxX - back, z: maxZ - back }, y, outward: { x: 1, z: 0 } },
      { a: { x: maxX - back, z: maxZ - back }, b: { x: minX + back, z: maxZ - back }, y, outward: { x: 0, z: 1 } },
      { a: { x: minX + back, z: maxZ - back }, b: { x: minX + back, z: minZ + back }, y, outward: { x: -1, z: 0 } },
    ];
    const ledM = 2 * (maxX - minX + maxZ - minZ - 4 * back);
    return { runs, panel: { minX, maxX, minZ, maxZ, y, drop }, ledM, panelM2: (maxX - minX) * (maxZ - minZ) + ledM * drop };
  }
  const wall = decorWall(piece, room);
  if (!wall) return { runs: [], panel: null, ledM: 0, panelM2: 0 };
  const { edge } = wall;
  const at = (s: number) => ({ x: edge.a.x + edge.dir.x * s, z: edge.a.z + edge.dir.z * s });
  return { runs: [{ a: at(wall.x0), b: at(wall.x1), y: wall.y0, outward: { x: -edge.inward.x, z: -edge.inward.z } }], panel: null, ledM: wall.width, panelM2: 0 };
}

/**
 * How far a decor piece stands out from its wall, metres — what furniture in front of it has to
 * stand clear of (`clearOfDecor`): slats with their backing and stand-off, a niche wall's build-out,
 * a slab on its stand-off, a panel or cladding its thickness, a moulding its profile. A cove or a
 * light line takes no floor.
 */
export function decorDepth(piece: Pick<DecorPiece, 'family' | 'params'>): number {
  const params = paramsOf(piece);
  switch (piece.family) {
    case 'slats':
      return (params.standoffMm && params.standoffMm > 0 ? params.standoffMm / 1000 : 0) + (params.backing === false ? 0 : 0.012) + mm(params.depthMm, 22);
    case 'niche':
      return Math.min(0.45, Math.max(0.12, mm(params.depthMm, 300)));
    case 'box':
      return Math.min(0.4, Math.max(0.1, mm(params.depthMm, 200)));
    case 'slab':
      return mm(params.standoffMm, 40) + mm(params.thicknessMm, 20);
    case 'panel':
      return params.style === 'fluted' ? 0.03 : Math.max(0.03, mm(params.thicknessMm, 50));
    case 'cladding':
    case 'tile':
    case 'mural':
      return mm(params.thicknessMm, piece.family === 'mural' ? 2 : piece.family === 'tile' ? 10 : 15);
    case 'moulding':
      return 0.03;
    default:
      return 0;
  }
}
