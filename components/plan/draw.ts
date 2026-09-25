/**
 * Drawing routines for the 2D editor. Plain canvas code, no React: the editor calls these
 * with its transform, and everything measured in metres is converted here.
 */

import { pointInPolygon, pointOnEdge, polygonBounds, polygonCentroid, roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import { ELECTRICAL_KINDS } from '@/lib/design/electrical';
import { leafOnOtherSide } from '@/lib/design/openings';
import { isBaseFinish } from '@/lib/design/zones';
import { dividerSegments, studioParts } from '@/lib/design/studio';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import type { Beam, Column, ElectricalPoint, FinishZone, FloorPlan, Opening, PlacedItem, PlanRoom, SurfaceFinish, TechnicalPoint, Vec2, Wall } from '@/lib/design/types';
import type { SnapGuide } from '@/lib/design/drawing';
import { EDITOR, ELECTRICAL_COLOR, ORIGIN_COLOR, ROOM_TINT, ROOM_TINT_STRONG, TECHNICAL_COLOR } from './palette';

export interface Transform {
  /** CSS pixels per metre. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const toScreen = (t: Transform, p: Vec2) => ({ x: p.x * t.scale + t.offsetX, y: p.z * t.scale + t.offsetY });
export const toWorld = (t: Transform, x: number, y: number): Vec2 => ({ x: (x - t.offsetX) / t.scale, z: (y - t.offsetY) / t.scale });

export function drawGrid(ctx: CanvasRenderingContext2D, t: Transform, width: number, height: number): void {
  ctx.fillStyle = EDITOR.paper;
  ctx.fillRect(0, 0, width, height);
  const minor = t.scale >= 18 ? 0.5 : t.scale >= 6 ? 1 : 5;
  const major = minor * (minor === 5 ? 2 : minor === 1 ? 5 : 2);
  const from = toWorld(t, 0, 0);
  const to = toWorld(t, width, height);
  ctx.lineWidth = 1;
  for (const [step, color] of [
    [minor, EDITOR.gridMinor],
    [major, EDITOR.gridMajor],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = Math.floor(from.x / step) * step; x <= to.x; x += step) {
      const sx = Math.round(x * t.scale + t.offsetX) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let z = Math.floor(from.z / step) * step; z <= to.z; z += step) {
      const sy = Math.round(z * t.scale + t.offsetY) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();
  }
}

export interface RoomDrawOptions {
  selected?: boolean;
  hovered?: boolean;
  labels: boolean;
  unitM2: string;
  /** Draw the room's edge lengths (inner faces). */
  dimensions: boolean;
  wetLabel?: string;
  /** Print scale: the labels' type and offsets are multiplied by it (the PDF draws at 200 dpi). */
  ui?: number;
  /** A studio's part picked out on the board: drawn in its type's stronger tint. */
  activePart?: 0 | 1 | null;
  /** What a room type is called, in the reader's language — a studio's parts are labelled by type. */
  typeLabel?: (type: RoomType) => string;
}

/** What `drawRoomLabel` needs: the unit, the print scale, and whether to stand the label on a white plate. */
export interface RoomLabelOptions {
  unitM2: string;
  ui?: number;
  /** A translucent white plate under the two lines, so the label reads over whatever stands in the room. */
  halo?: boolean;
  typeLabel?: (type: RoomType) => string;
}

export function drawRoom(ctx: CanvasRenderingContext2D, t: Transform, room: PlanRoom, options: RoomDrawOptions): void {
  ctx.beginPath();
  room.polygon.forEach((p, i) => {
    const s = toScreen(t, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  const parts = studioParts(room);
  if (parts) {
    // A studio: each part in its own type's tint, the one picked out stronger, then the line.
    for (const part of parts) {
      const strong = options.activePart === part.index || (options.selected && options.activePart == null);
      tracePolygon(ctx, t, part.polygon);
      ctx.fillStyle = strong ? ROOM_TINT_STRONG[part.type] : options.hovered ? blend(ROOM_TINT[part.type], ROOM_TINT_STRONG[part.type]) : ROOM_TINT[part.type];
      ctx.fill();
    }
    drawDivider(ctx, t, room, options.ui ?? 1);
    // The outline again, for the selection's dashes below.
    tracePolygon(ctx, t, room.polygon);
  } else {
    ctx.fillStyle = options.selected ? ROOM_TINT_STRONG[room.type] : options.hovered ? blend(ROOM_TINT[room.type], ROOM_TINT_STRONG[room.type]) : ROOM_TINT[room.type];
    ctx.fill();
  }
  if (options.selected) {
    ctx.strokeStyle = EDITOR.selected;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (options.labels) drawRoomLabel(ctx, t, room, { unitM2: options.unitM2, ui: options.ui, typeLabel: options.typeLabel });
  if (options.dimensions && t.scale >= 22) {
    for (const edge of roomEdges(room.polygon)) {
      if (edge.length < 0.6) continue;
      drawDimension(ctx, t, edge, room);
    }
  }
}

/**
 * The room's name and area at its centre. Separate from `drawRoom` so a sheet can write the
 * labels *after* the furniture — a name drawn first disappears under the sofa that stands
 * on it — and larger, at print scale.
 */
export function drawRoomLabel(ctx: CanvasRenderingContext2D, t: Transform, room: PlanRoom, options: RoomLabelOptions): void {
  // A studio is labelled part by part: what each part is and how big.
  const parts = studioParts(room);
  if (parts) {
    const label = options.typeLabel ?? ((type: RoomType) => ROOM_TYPES[type]?.labelKa ?? type);
    for (const part of parts) writeLabel(ctx, t, part.polygon, label(part.type), part.areaM2, options);
    return;
  }
  writeLabel(ctx, t, room.polygon, room.name, room.areaM2, options);
}

function writeLabel(ctx: CanvasRenderingContext2D, t: Transform, polygon: Vec2[], title: string, areaM2: number, options: RoomLabelOptions): void {
  const ui = options.ui ?? 1;
  const centre = toScreen(t, polygonCentroid(polygon));
  const bounds = polygonBounds(polygon);
  const fits = bounds.width * t.scale > 70 * ui && bounds.depth * t.scale > 40 * ui;
  if (!fits) return;
  const namePx = Math.round(Math.max(11, Math.min(14, (t.scale / ui) * 0.32)) * ui);
  const areaPx = Math.round(Math.max(10, Math.min(12, (t.scale / ui) * 0.28)) * ui);
  const name = truncate(title, 22);
  const area = `${areaM2.toFixed(1)} ${options.unitM2}`;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${namePx}px system-ui, sans-serif`;
  if (options.halo) {
    const nameW = ctx.measureText(name).width;
    ctx.font = `${areaPx}px system-ui, sans-serif`;
    const areaW = ctx.measureText(area).width;
    const w = Math.max(nameW, areaW) + 12 * ui;
    const h = 20 * ui + namePx + areaPx;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(centre.x - w / 2, centre.y - h / 2, w, h);
    ctx.font = `600 ${namePx}px system-ui, sans-serif`;
  }
  ctx.fillStyle = EDITOR.label;
  ctx.fillText(name, centre.x, centre.y - 8 * ui);
  ctx.fillStyle = EDITOR.labelMuted;
  ctx.font = `${areaPx}px system-ui, sans-serif`;
  ctx.fillText(area, centre.x, centre.y + 8 * ui);
  ctx.restore();
}

function tracePolygon(ctx: CanvasRenderingContext2D, t: Transform, polygon: Vec2[]): void {
  ctx.beginPath();
  polygon.forEach((p, i) => {
    const s = toScreen(t, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

/** A studio's dividing line: dashed, so it reads as a line on the floor and not as a wall. */
export function drawDivider(ctx: CanvasRenderingContext2D, t: Transform, room: PlanRoom, ui = 1): void {
  ctx.save();
  ctx.strokeStyle = EDITOR.label;
  ctx.lineWidth = 1.5 * ui;
  ctx.setLineDash([7 * ui, 5 * ui]);
  ctx.beginPath();
  for (const [a, b] of dividerSegments(room)) {
    const sa = toScreen(t, a);
    const sb = toScreen(t, b);
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The length of a room's edge, written just inside the room along the wall. */
function drawDimension(ctx: CanvasRenderingContext2D, t: Transform, edge: PlanEdge, _room: PlanRoom): void {
  const mid = pointOnEdge(edge, 0.5);
  const inset = 0.18;
  const p = toScreen(t, { x: mid.x + edge.inward.x * inset, z: mid.z + edge.inward.z * inset });
  const angle = Math.atan2(edge.dir.z, edge.dir.x);
  ctx.save();
  ctx.translate(p.x, p.y);
  // Keep the text upright.
  const upright = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle;
  ctx.rotate(upright);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 10px system-ui, sans-serif`;
  ctx.fillStyle = EDITOR.dimension;
  const text = `${edge.length.toFixed(2)} m`;
  const w = ctx.measureText(text).width + 6;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(-w / 2, -7, w, 14);
  ctx.fillStyle = EDITOR.dimension;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export interface WallDrawOptions {
  selected?: boolean;
  hovered?: boolean;
  locked?: boolean;
  /** Colour by origin instead of the plain wall colour. */
  byOrigin?: boolean;
  /** How far past each end the body is drawn, metres, so it meets the wall it turns into (`wallEndExtensions`). */
  extendA?: number;
  extendB?: number;
}

/**
 * How far each wall's body is drawn past its ends, so that corners close. A wall is a
 * stroked centreline with butt ends, and two such strokes meeting at an L-corner each stop
 * at the node — leaving a square of half a thickness a side empty at the outer corner, and
 * a hairline of paper where the inner faces should meet. At every end another wall meets
 * at an angle, the body runs on by half of that wall's thickness: exactly to its far face at
 * a corner, harmlessly inside it at a T. A wall that only continues in line is butted, and
 * a free end stays where it is.
 */
export function wallEndExtensions(walls: Pick<Wall, 'id' | 'a' | 'b' | 'thicknessM'>[]): Map<string, { a: number; b: number }> {
  const tol = 0.03;
  const out = new Map<string, { a: number; b: number }>();
  const directionOf = (w: Pick<Wall, 'a' | 'b'>): Vec2 => {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  };
  const toSegment = (p: Vec2, a: Vec2, b: Vec2): number => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    return Math.hypot(p.x - (a.x + dx * u), p.z - (a.z + dz * u));
  };
  for (const wall of walls) {
    const dir = directionOf(wall);
    const extension = (end: Vec2): number => {
      let best = 0;
      for (const other of walls) {
        if (other.id === wall.id) continue;
        const meets = Math.hypot(other.a.x - end.x, other.a.z - end.z) <= tol || Math.hypot(other.b.x - end.x, other.b.z - end.z) <= tol || toSegment(end, other.a, other.b) <= tol;
        if (!meets) continue;
        const od = directionOf(other);
        // In line with it: the two butt against each other and need no overlap.
        if (Math.abs(dir.x * od.z - dir.z * od.x) < 0.2) continue;
        best = Math.max(best, other.thicknessM / 2);
      }
      return best;
    };
    out.set(wall.id, { a: extension(wall.a), b: extension(wall.b) });
  }
  return out;
}

export function drawWall(ctx: CanvasRenderingContext2D, t: Transform, wall: Wall, options: WallDrawOptions = {}): void {
  // The body runs past the ends by whatever closes the corner (see `wallEndExtensions`).
  const dx = wall.b.x - wall.a.x;
  const dz = wall.b.z - wall.a.z;
  const l = Math.hypot(dx, dz) || 1;
  const ex = { x: dx / l, z: dz / l };
  const a = toScreen(t, { x: wall.a.x - ex.x * (options.extendA ?? 0), z: wall.a.z - ex.z * (options.extendA ?? 0) });
  const b = toScreen(t, { x: wall.b.x + ex.x * (options.extendB ?? 0), z: wall.b.z + ex.z * (options.extendB ?? 0) });
  const thickness = Math.max(2, wall.thicknessM * t.scale);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  if (options.selected || options.hovered) {
    ctx.strokeStyle = options.selected ? EDITOR.selected : EDITOR.hover;
    ctx.lineWidth = thickness + 6;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = options.byOrigin ? ORIGIN_COLOR[wall.origin] : options.locked ? EDITOR.wallLocked : EDITOR.wall;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // A hatch line down the middle so a wall reads as a wall, not a fat stroke.
  if (thickness >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/** The wall's junctions, as small squares — the handles the select tool drags. */
export function drawNodeHandles(ctx: CanvasRenderingContext2D, t: Transform, wall: Wall): void {
  for (const p of [wall.a, wall.b]) {
    const s = toScreen(t, p);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = EDITOR.selected;
    ctx.lineWidth = 2;
    ctx.fillRect(s.x - 5, s.y - 5, 10, 10);
    ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
  }
}

export function drawOpening(ctx: CanvasRenderingContext2D, t: Transform, room: PlanRoom, opening: Opening, thicknessM: number, state: { selected?: boolean; hovered?: boolean; alpha?: number; dashed?: boolean } = {}): void {
  const edge = roomEdges(room.polygon).find((e) => e.index === opening.wallIndex);
  if (!edge) return;
  const halfT = opening.widthM / 2 / edge.length;
  const a = pointOnEdge(edge, Math.max(0, opening.t - halfT));
  const b = pointOnEdge(edge, Math.min(1, opening.t + halfT));
  const outward = { x: -edge.inward.x, z: -edge.inward.z };
  // The opening spans the wall's thickness: draw it as a clear gap with a thin frame.
  const ao = { x: a.x + outward.x * thicknessM, z: a.z + outward.z * thicknessM };
  const bo = { x: b.x + outward.x * thicknessM, z: b.z + outward.z * thicknessM };
  const [sa, sb, sao, sbo] = [a, b, ao, bo].map((p) => toScreen(t, p));
  ctx.save();
  ctx.globalAlpha = state.alpha ?? 1;
  if (state.dashed) ctx.setLineDash([5, 4]);
  ctx.fillStyle = EDITOR.paper;
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.lineTo(sbo.x, sbo.y);
  ctx.lineTo(sao.x, sao.y);
  ctx.closePath();
  ctx.fill();
  const color = opening.kind === 'window' ? EDITOR.window : EDITOR.door;
  ctx.strokeStyle = state.selected ? EDITOR.selected : state.hovered ? EDITOR.hover : color;
  ctx.lineWidth = state.selected ? 3 : 2;
  if (opening.kind === 'window') {
    // Three lines across the wall: the classic window symbol.
    const lines = [0, 0.5, 1];
    for (const f of lines) {
      const p = toScreen(t, { x: a.x + outward.x * thicknessM * f, z: a.z + outward.z * thicknessM * f });
      const q = toScreen(t, { x: b.x + outward.x * thicknessM * f, z: b.z + outward.z * thicknessM * f });
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
  } else if (opening.kind === 'archway') {
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (!leafOnOtherSide(opening)) {
    // Door leaf and swing arc, from the hinge side into the room (or out of it). An interior
    // door is two openings; the half that swings into its own room draws the leaf.
    const hingeAtA = (opening.hinge ?? 'left') === 'left';
    const hinge = hingeAtA ? a : b;
    const dirAlong = hingeAtA ? edge.dir : { x: -edge.dir.x, z: -edge.dir.z };
    const swing = opening.swing === 'out' ? outward : edge.inward;
    const w = opening.widthM;
    const leafEnd = { x: hinge.x + swing.x * w, z: hinge.z + swing.z * w };
    const sh = toScreen(t, hinge);
    const sl = toScreen(t, leafEnd);
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(sl.x, sl.y);
    ctx.stroke();
    // Arc from the leaf end to the far jamb.
    const start = Math.atan2(swing.z, swing.x);
    const end = Math.atan2(dirAlong.z, dirAlong.x);
    ctx.beginPath();
    ctx.lineWidth = 1;
    const cross = dirAlong.x * swing.z - dirAlong.z * swing.x;
    ctx.arc(sh.x, sh.y, w * t.scale, start, end, cross > 0);
    ctx.stroke();
  }
  // The opening's own line on the wall face, so it is easy to grab.
  ctx.lineWidth = state.selected ? 4 : 3;
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.stroke();
  ctx.restore();
}

export function drawColumn(ctx: CanvasRenderingContext2D, t: Transform, column: Column, state: { selected?: boolean; hovered?: boolean } = {}): void {
  const s = toScreen(t, column.position);
  const w = column.widthM * t.scale;
  const d = column.depthM * t.scale;
  ctx.fillStyle = state.selected ? EDITOR.selected : state.hovered ? EDITOR.hover : EDITOR.column;
  ctx.fillRect(s.x - w / 2, s.y - d / 2, w, d);
  // A diagonal cross, the way structural columns are marked.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s.x - w / 2, s.y - d / 2);
  ctx.lineTo(s.x + w / 2, s.y + d / 2);
  ctx.moveTo(s.x + w / 2, s.y - d / 2);
  ctx.lineTo(s.x - w / 2, s.y + d / 2);
  ctx.stroke();
}

export function drawBeam(ctx: CanvasRenderingContext2D, t: Transform, beam: Beam, state: { selected?: boolean; hovered?: boolean } = {}): void {
  const a = toScreen(t, beam.a);
  const b = toScreen(t, beam.b);
  ctx.strokeStyle = state.selected ? EDITOR.selected : state.hovered ? EDITOR.hover : EDITOR.beam;
  ctx.lineWidth = Math.max(2, beam.widthM * t.scale);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

const TECHNICAL_GLYPH: Record<TechnicalPoint['kind'], string> = {
  water_supply: 'W',
  sewer: 'S',
  floor_drain: 'D',
  electrical_panel: 'E',
  gas: 'G',
  radiator: 'R',
  ac_unit: 'AC',
  extractor: 'V',
  boiler: 'B',
  heating_pipe: 'H',
};

export function drawTechnical(ctx: CanvasRenderingContext2D, t: Transform, point: TechnicalPoint, state: { selected?: boolean; hovered?: boolean } = {}): void {
  const s = toScreen(t, point.position);
  const r = 11;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r + (state.selected ? 3 : 0), 0, Math.PI * 2);
  ctx.fillStyle = TECHNICAL_COLOR[point.kind];
  ctx.fill();
  ctx.lineWidth = state.selected ? 3 : 2;
  ctx.strokeStyle = state.selected ? EDITOR.selected : state.hovered ? EDITOR.hover : '#FFFFFF';
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(TECHNICAL_GLYPH[point.kind], s.x, s.y + 0.5);
}

export function drawElectrical(ctx: CanvasRenderingContext2D, t: Transform, point: ElectricalPoint, state: { selected?: boolean; hovered?: boolean } = {}): void {
  const s = toScreen(t, point.position);
  const info = ELECTRICAL_KINDS[point.kind];
  const ring = state.selected ? EDITOR.selected : state.hovered ? EDITOR.hover : null;
  if (info.light) {
    const on = point.on !== false;
    const r = point.kind === 'light_ceiling' ? 9 : 7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? ELECTRICAL_COLOR.lightOn : ELECTRICAL_COLOR.lightOff;
    ctx.fill();
    ctx.strokeStyle = ring ?? '#FFFFFF';
    ctx.lineWidth = ring ? 3 : 1.5;
    ctx.stroke();
    if (on) {
      ctx.strokeStyle = ELECTRICAL_COLOR.lightOn;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(angle) * (r + 2), s.y + Math.sin(angle) * (r + 2));
        ctx.lineTo(s.x + Math.cos(angle) * (r + 5), s.y + Math.sin(angle) * (r + 5));
        ctx.stroke();
      }
    }
    if (point.kind === 'light_strip' || point.kind === 'light_furniture') {
      const len = (point.lengthM ?? 1.5) * t.scale;
      ctx.strokeStyle = on ? ELECTRICAL_COLOR.lightOn : ELECTRICAL_COLOR.lightOff;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(s.x - len / 2, s.y);
      ctx.lineTo(s.x + len / 2, s.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }
  // Sockets and switches: a small plate with a glyph.
  const isData = point.kind === 'tv' || point.kind === 'internet';
  const color = point.kind === 'switch' ? ELECTRICAL_COLOR.switch : isData ? ELECTRICAL_COLOR.data : ELECTRICAL_COLOR.socket;
  ctx.fillStyle = color;
  ctx.strokeStyle = ring ?? '#FFFFFF';
  ctx.lineWidth = ring ? 3 : 1.5;
  const w = 14;
  const h = 10;
  ctx.beginPath();
  ctx.rect(s.x - w / 2, s.y - h / 2, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = point.kind === 'switch' ? '/' : point.kind === 'tv' ? 'TV' : point.kind === 'internet' ? 'NET' : point.count && point.count > 1 ? '••' : '•';
  ctx.fillText(glyph, s.x, s.y + 0.5);
}

export function drawZone(ctx: CanvasRenderingContext2D, t: Transform, zone: FinishZone, textureColor: string | null, state: { selected?: boolean; hovered?: boolean } = {}): void {
  ctx.beginPath();
  zone.polygon.forEach((p, i) => {
    const s = toScreen(t, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.fillStyle = textureColor ?? 'rgba(46,139,133,0.18)';
  ctx.globalAlpha = textureColor ? 0.65 : 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = state.selected ? EDITOR.selected : state.hovered ? EDITOR.hover : EDITOR.zone;
  ctx.lineWidth = state.selected ? 2.5 : 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** A painted floor tile (or the one the brush is over): a filled outline with a hairline round it. */
export function drawPaintedCell(ctx: CanvasRenderingContext2D, t: Transform, polygon: Vec2[], color: string | null, state: { preview?: boolean } = {}): void {
  if (polygon.length < 3) return;
  ctx.beginPath();
  polygon.forEach((p, i) => {
    const s = toScreen(t, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.fillStyle = state.preview ? EDITOR.selected : (color ?? 'rgba(46,139,133,0.3)');
  ctx.globalAlpha = state.preview ? 0.35 : 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = state.preview ? EDITOR.selected : 'rgba(30,30,30,0.18)';
  ctx.lineWidth = state.preview ? 2 : 1;
  ctx.stroke();
}

/**
 * A wall's own finish on the plan: a band along the inside of the room's edge from `from`
 * to `to` metres, in the finish's colour — how the 2D view shows which walls (and which
 * metre-wide strips of them) wear something other than the room's paper.
 */
export function drawWallBand(ctx: CanvasRenderingContext2D, t: Transform, edge: PlanEdge, from: number, to: number, color: string | null, state: { preview?: boolean } = {}): void {
  const band = Math.max(5, Math.min(12, 0.09 * t.scale));
  const at = (along: number, inM: number) => toScreen(t, { x: edge.a.x + edge.dir.x * along + edge.inward.x * inM, z: edge.a.z + edge.dir.z * along + edge.inward.z * inM });
  const inM = band / t.scale;
  const corners = [at(from, 0), at(to, 0), at(to, inM), at(from, inM)];
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.fillStyle = state.preview ? EDITOR.selected : (color ?? '#BDB6A8');
  ctx.globalAlpha = state.preview ? 0.55 : 0.95;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = state.preview ? EDITOR.selected : 'rgba(30,30,30,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawFurniture(ctx: CanvasRenderingContext2D, t: Transform, item: PlacedItem, label: string, state: { selected?: boolean; hovered?: boolean; invalid?: boolean; /** Riding on the pointer, not set down yet: dashed, green where it fits and red where it does not. */ carried?: boolean; /** Print scale: strokes and the label are multiplied by it (the PDF draws at 200 dpi). */ ui?: number } = {}): void {
  const ui = state.ui ?? 1;
  const s = toScreen(t, item.position);
  const w = item.size.width * t.scale;
  const d = item.size.depth * t.scale;
  ctx.save();
  ctx.translate(s.x, s.y);
  // Plan yaw: rotation 0 faces +z (down the screen), so the box turns by −rotation.
  ctx.rotate(-item.rotation);
  ctx.fillStyle = state.invalid ? 'rgba(239,68,68,0.18)' : state.carried ? 'rgba(34,197,94,0.16)' : EDITOR.furnitureFill;
  ctx.strokeStyle = state.invalid ? EDITOR.invalid : state.carried ? EDITOR.valid : state.selected ? EDITOR.selected : state.hovered ? EDITOR.hover : EDITOR.furniture;
  ctx.lineWidth = (state.selected || state.carried ? 2.5 : 1.5) * ui;
  if (state.carried) ctx.setLineDash([6 * ui, 4 * ui]);
  ctx.beginPath();
  ctx.rect(-w / 2, -d / 2, w, d);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  // A short line on the front face shows which way it faces.
  ctx.beginPath();
  ctx.moveTo(-w / 4, d / 2);
  ctx.lineTo(w / 4, d / 2);
  ctx.lineWidth = 3 * ui;
  ctx.stroke();
  if (w > 34 * ui && d > 18 * ui) {
    ctx.rotate(item.rotation);
    ctx.fillStyle = EDITOR.labelMuted;
    ctx.font = `500 ${Math.round(9 * ui)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // The label stays inside its piece: shortened until it fits the box, or left off a piece
    // too small for even a stump of it — a name spilling over the edge read as the neighbour's.
    // The text is upright on the screen, so what it has to fit is the piece's extent *on the
    // screen* — a turned wardrobe is wide where its box is deep — along the longer axis,
    // which the label runs along.
    const acrossX = Math.abs(w * Math.cos(item.rotation)) + Math.abs(d * Math.sin(item.rotation));
    const acrossY = Math.abs(w * Math.sin(item.rotation)) + Math.abs(d * Math.cos(item.rotation));
    const room = Math.max(acrossX, acrossY) - 6 * ui;
    let text = truncate(label, ui > 1 ? 24 : 14);
    while (text.length > 4 && ctx.measureText(text).width > room) text = truncate(label, text.length - 2);
    if (ctx.measureText(text).width <= room) {
      if (acrossY > acrossX) ctx.rotate(-Math.PI / 2);
      ctx.fillText(text, 0, 0);
    }
  }
  ctx.restore();
}

export function drawGuides(ctx: CanvasRenderingContext2D, t: Transform, guides: SnapGuide[], width: number, height: number): void {
  ctx.save();
  ctx.strokeStyle = EDITOR.guide;
  ctx.fillStyle = EDITOR.guide;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const g of guides) {
    if (g.kind === 'node') {
      const s = toScreen(t, g.a);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (!g.b) continue;
    if (g.kind === 'align') {
      // Extend the alignment line across the canvas, through both points.
      const a = toScreen(t, g.a);
      const b = toScreen(t, g.b);
      const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(a.x, 0);
        ctx.lineTo(a.x, height);
      } else {
        ctx.moveTo(0, a.y);
        ctx.lineTo(width, a.y);
      }
      ctx.stroke();
      continue;
    }
    const a = toScreen(t, g.a);
    const b = toScreen(t, g.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The rubber band the select tool drags across the sheet, desktop-style. */
export function drawMarquee(ctx: CanvasRenderingContext2D, t: Transform, rect: { x: number; z: number; width: number; depth: number }): void {
  const a = toScreen(t, { x: rect.x, z: rect.z });
  ctx.save();
  ctx.fillStyle = EDITOR.selected;
  ctx.globalAlpha = 0.1;
  ctx.fillRect(a.x, a.y, rect.width * t.scale, rect.depth * t.scale);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = EDITOR.selected;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(a.x, a.y, rect.width * t.scale, rect.depth * t.scale);
  ctx.setLineDash([]);
  ctx.restore();
}

/** Where a room being dragged would land: its outline, offset, over the sheet. */
export function drawRoomGhost(ctx: CanvasRenderingContext2D, t: Transform, polygon: Vec2[], delta: Vec2, color: string = EDITOR.selected): void {
  if (polygon.length < 3) return;
  ctx.save();
  ctx.beginPath();
  polygon.forEach((p, i) => {
    const s = toScreen(t, { x: p.x + delta.x, z: p.z + delta.z });
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.14;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** A wall travelling with a dragged room: its body, translucent, where it would land. */
export function drawWallGhost(ctx: CanvasRenderingContext2D, t: Transform, wall: Pick<Wall, 'a' | 'b' | 'thicknessM'>, delta: Vec2, color: string = EDITOR.selected): void {
  const a = toScreen(t, { x: wall.a.x + delta.x, z: wall.a.z + delta.z });
  const b = toScreen(t, { x: wall.b.x + delta.x, z: wall.b.z + delta.z });
  ctx.save();
  ctx.lineCap = 'square';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(2, wall.thicknessM * t.scale);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * A measurement on the sheet: a dark plate with the figure in it, at a screen point. The
 * ruler every gesture that changes a size shows — a wall being drawn, dragged sideways or
 * stretched by its end, a room being pulled out — so the number is under the pointer while
 * it is still changing, not only once it has been let go.
 */
export function drawMeasure(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string = EDITOR.label): void {
  ctx.save();
  ctx.font = '600 11px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - 9, w, 18);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** One wall's length, on a plate at its middle — the live ruler while it is being edited. */
export function drawWallLength(ctx: CanvasRenderingContext2D, t: Transform, wall: Pick<Wall, 'a' | 'b'>, unitM: string, extra?: string): void {
  const a = toScreen(t, wall.a);
  const b = toScreen(t, wall.b);
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
  if (length < 0.05) return;
  const text = extra ? `${length.toFixed(2)} ${unitM} · ${extra}` : `${length.toFixed(2)} ${unitM}`;
  drawMeasure(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, text, EDITOR.selected);
}

/** A wall being drawn: its stroke, its length, and a dot at the start. */
export function drawDraftWall(ctx: CanvasRenderingContext2D, t: Transform, a: Vec2, b: Vec2, thicknessM: number, unitM: string): void {
  const sa = toScreen(t, a);
  const sb = toScreen(t, b);
  ctx.save();
  ctx.strokeStyle = EDITOR.selected;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(2, thicknessM * t.scale);
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = EDITOR.selected;
  ctx.beginPath();
  ctx.arc(sa.x, sa.y, 4, 0, Math.PI * 2);
  ctx.fill();
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length > 0.05) {
    const mid = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
    const text = `${length.toFixed(2)} ${unitM}`;
    ctx.font = '600 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = EDITOR.label;
    ctx.fillRect(mid.x - w / 2, mid.y - 20, w, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, mid.x, mid.y - 11);
  }
  ctx.restore();
}

export function drawDraftRect(ctx: CanvasRenderingContext2D, t: Transform, rect: { x: number; z: number; width: number; depth: number }, unitM: string, unitM2: string, color = EDITOR.selected): void {
  const a = toScreen(t, { x: rect.x, z: rect.z });
  const w = rect.width * t.scale;
  const d = rect.depth * t.scale;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(a.x, a.y, w, d);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(a.x, a.y, w, d);
  ctx.setLineDash([]);
  const text = `${rect.width.toFixed(2)} × ${rect.depth.toFixed(2)} ${unitM} · ${(rect.width * rect.depth).toFixed(2)} ${unitM2}`;
  ctx.font = '600 11px system-ui, sans-serif';
  const tw = ctx.measureText(text).width + 10;
  ctx.fillStyle = EDITOR.label;
  ctx.fillRect(a.x + w / 2 - tw / 2, a.y + d / 2 - 9, tw, 18);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, a.x + w / 2, a.y + d / 2);
  ctx.restore();
}

/** A translucent marker where a point tool would land. */
export function drawGhostPoint(ctx: CanvasRenderingContext2D, t: Transform, p: Vec2, color: string): void {
  const s = toScreen(t, p);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawOriginLegendDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function blend(a: string, b: string): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const mix = (shift: number) => Math.round((((pa >> shift) & 255) + ((pb >> shift) & 255)) / 2);
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Finishes on the plan, dimensions outside it, the sizes of the openings
// ---------------------------------------------------------------------------

/** A muted palette for products that carry no colour of their own (or a white one), by product id. */
const SWATCH_PALETTE = ['#C97B4A', '#7A9E7E', '#6B8CBB', '#B58BC4', '#C9A84A', '#5FA8A2', '#B5655E', '#8C8C6E'];

/**
 * The colour a finish is shown in on the sheet: the product's own, unless it has none or is
 * (near) white, which would vanish on the paper — then a stand-in from a small palette, the
 * same one for that product wherever it appears, so the legend and the plan agree.
 */
export function finishSwatchColor(finish: Pick<SurfaceFinish, 'colorHex' | 'product'>): string {
  const own = finish.product?.colorHex ?? null;
  if (own && /^#[0-9a-f]{6}$/i.test(own)) {
    const n = parseInt(own.slice(1), 16);
    const luminance = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    if (luminance < 0.9) return own;
  }
  const id = finish.product?.productId;
  return id != null ? SWATCH_PALETTE[Math.abs(id) % SWATCH_PALETTE.length] : finish.colorHex;
}

/**
 * The finishes chosen for whole rooms, on the plan: a room's floor in its product's colour,
 * its walls as a band in theirs along every edge. Only finishes that carry a product are
 * drawn — a style's default is the room's ordinary paper. Strips, squares and zones are
 * drawn by the board on top of these.
 */
export function drawBaseFinishes(ctx: CanvasRenderingContext2D, t: Transform, plan: Pick<FloorPlan, 'rooms'>, finishes: SurfaceFinish[]): void {
  for (const finish of finishes) {
    if (!finish.product || !isBaseFinish(finish) || (finish.surface !== 'floor' && finish.surface !== 'wall')) continue;
    const room = plan.rooms.find((r) => r.id === finish.roomId);
    if (!room) continue;
    const color = finishSwatchColor(finish);
    if (finish.surface === 'floor') {
      ctx.save();
      ctx.beginPath();
      room.polygon.forEach((p, i) => {
        const s = toScreen(t, p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.restore();
    } else {
      for (const edge of roomEdges(room.polygon)) drawWallBand(ctx, t, edge, 0, edge.length, color);
    }
  }
}

/** A length for a dimension label: to the centimetre, with no trailing zeros ("3", "5.2", "8.35"). */
export function formatDimension(metres: number, unitM: string): string {
  const cm = Math.round(metres * 100) / 100;
  return `${String(cm).replace(/\.?0+$/, '')} ${unitM}`;
}

export interface DimensionChains {
  /** The x-coordinates the top and bottom chains are cut at; the z-coordinates for the sides. */
  top: number[];
  bottom: number[];
  left: number[];
  right: number[];
  /** The outer faces of the walls: what the overall sizes measure. */
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * Where the outside dimensions of a flat go, the way an architect chains them along each
 * side of the drawing: every exterior wall — one with a room on one side of it and nothing
 * on the other — contributes its ends to the chain on the side it faces, so a side reads
 * "3 m · 5 m" wall by wall, and the outer faces of the walls give the overall width and
 * depth. Null for a plan with no walls.
 */
export function outerDimensionChains(plan: Pick<FloorPlan, 'rooms' | 'walls'>): DimensionChains | null {
  const walls = plan.walls ?? [];
  if (walls.length === 0) return null;
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const chains = { top: [] as number[], bottom: [] as number[], left: [] as number[], right: [] as number[] };
  const inside = (p: Vec2) => plan.rooms.some((r) => pointInPolygon(p, r.polygon));
  for (const wall of walls) {
    const dx = wall.b.x - wall.a.x;
    const dz = wall.b.z - wall.a.z;
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) continue;
    const half = wall.thicknessM / 2;
    const horizontal = Math.abs(dx) >= Math.abs(dz);
    if (horizontal) {
      box.minX = Math.min(box.minX, wall.a.x, wall.b.x);
      box.maxX = Math.max(box.maxX, wall.a.x, wall.b.x);
      box.minZ = Math.min(box.minZ, wall.a.z - half, wall.b.z - half);
      box.maxZ = Math.max(box.maxZ, wall.a.z + half, wall.b.z + half);
    } else {
      box.minX = Math.min(box.minX, wall.a.x - half, wall.b.x - half);
      box.maxX = Math.max(box.maxX, wall.a.x + half, wall.b.x + half);
      box.minZ = Math.min(box.minZ, wall.a.z, wall.b.z);
      box.maxZ = Math.max(box.maxZ, wall.a.z, wall.b.z);
    }
    // Which side of the wall is a room, sampled a hand past the face at its middle.
    const n = { x: -dz / l, z: dx / l };
    const mid = { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
    const reach = half + 0.08;
    const plus = inside({ x: mid.x + n.x * reach, z: mid.z + n.z * reach });
    const minus = inside({ x: mid.x - n.x * reach, z: mid.z - n.z * reach });
    if (plus === minus) continue; // interior (rooms both sides) or free-standing (none)
    const facing = plus ? { x: -n.x, z: -n.z } : n;
    if (horizontal) (facing.z < 0 ? chains.top : chains.bottom).push(wall.a.x, wall.b.x);
    else (facing.x < 0 ? chains.left : chains.right).push(wall.a.z, wall.b.z);
  }
  if (!Number.isFinite(box.minX)) return null;
  const tidy = (marks: number[]): number[] => {
    const sorted = [...marks].sort((a, b) => a - b);
    const out: number[] = [];
    for (const m of sorted) if (out.length === 0 || m - out[out.length - 1] > 0.03) out.push(m);
    return out.length >= 2 ? out : [];
  };
  return { top: tidy(chains.top), bottom: tidy(chains.bottom), left: tidy(chains.left), right: tidy(chains.right), box };
}

export interface OuterDimensionOptions {
  /** Pixels between the walls and the first chain; the overall size sits at twice that. */
  gap?: number;
  /** Multiplies every pixel size (lines, arrows, type) — the PDF renders at print resolution. */
  ui?: number;
  color?: string;
}

/**
 * The chains from `outerDimensionChains`, drawn outside the plan: each stretch its own
 * dimension line with an arrowhead at both ends and its length on a plate, an extension
 * line at every mark reaching towards the wall, the overall width under the bottom chain and
 * the overall depth beside the right one.
 */
export function drawOuterDimensions(ctx: CanvasRenderingContext2D, t: Transform, chains: DimensionChains, unitM: string, options: OuterDimensionOptions = {}): void {
  const ui = options.ui ?? 1;
  const gap = (options.gap ?? 28) * ui;
  const color = options.color ?? EDITOR.dimension;
  const { box } = chains;
  const left = box.minX * t.scale + t.offsetX;
  const right = box.maxX * t.scale + t.offsetX;
  const top = box.minZ * t.scale + t.offsetY;
  const bottom = box.maxZ * t.scale + t.offsetY;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, ui);
  ctx.font = `500 ${Math.round(10 * ui)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arrow = 5 * ui;

  /** One dimension line between two screen points, arrowheads in, the label on a plate at its middle. */
  const line = (ax: number, ay: number, bx: number, by: number, label: string, vertical: boolean) => {
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy);
    if (l < 1e-3) return;
    const ux = dx / l;
    const uy = dy / l;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    if (l > arrow * 3) {
      for (const [px, py, sx, sy] of [
        [ax, ay, ux, uy],
        [bx, by, -ux, -uy],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + sx * arrow * 1.8 - sy * arrow * 0.7, py + sy * arrow * 1.8 + sx * arrow * 0.7);
        ctx.lineTo(px + sx * arrow * 1.8 + sy * arrow * 0.7, py + sy * arrow * 1.8 - sx * arrow * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    }
    const w = ctx.measureText(label).width + 6 * ui;
    const h = 13 * ui;
    // The label sits on the line, on a plate the paper's colour, so the line reads as broken for it.
    if (l < w + arrow * 4) return;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    ctx.save();
    ctx.translate(mx, my);
    if (vertical) ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = EDITOR.paper;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 0.5 * ui);
    ctx.restore();
  };
  /** A hairline from a mark towards the wall it measures, past the dimension line by a little. */
  const extension = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };
  const chain = (marks: number[], along: 'x' | 'z', at: number, side: 'top' | 'bottom' | 'left' | 'right') => {
    if (marks.length < 2) return;
    const screen = (m: number) => (along === 'x' ? m * t.scale + t.offsetX : m * t.scale + t.offsetY);
    const wallEdge = side === 'top' ? top : side === 'bottom' ? bottom : side === 'left' ? left : right;
    const over = 4 * ui;
    for (const m of marks) {
      const s = screen(m);
      if (along === 'x') extension(s, wallEdge, s, at + (side === 'top' ? -over : over));
      else extension(wallEdge, s, at + (side === 'left' ? -over : over), s);
    }
    for (let i = 0; i + 1 < marks.length; i++) {
      const a = screen(marks[i]);
      const b = screen(marks[i + 1]);
      const label = formatDimension(marks[i + 1] - marks[i], unitM);
      if (along === 'x') line(a, at, b, at, label, false);
      else line(at, a, at, b, label, true);
    }
  };
  chain(chains.top, 'x', top - gap, 'top');
  chain(chains.bottom, 'x', bottom + gap, 'bottom');
  chain(chains.left, 'z', left - gap, 'left');
  chain(chains.right, 'z', right + gap, 'right');
  // The overall sizes, outer face to outer face, a chain further out.
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;
  if (width > 0.05) {
    const y = bottom + gap * 2;
    extension(left, bottom, left, y + 4 * ui);
    extension(right, bottom, right, y + 4 * ui);
    line(left, y, right, y, formatDimension(width, unitM), false);
  }
  if (depth > 0.05) {
    const x = right + gap * 2;
    extension(right, top, x + 4 * ui, top);
    extension(right, bottom, x + 4 * ui, bottom);
    line(x, top, x, bottom, formatDimension(depth, unitM), true);
  }
  ctx.restore();
}

/**
 * The size of a door or window, written just outside the wall at the opening's middle:
 * width × height, so the sheet says what fits the hole without the inspector.
 */
export function drawOpeningSize(ctx: CanvasRenderingContext2D, t: Transform, room: PlanRoom, opening: Opening, thicknessM: number, unitM: string, options: { ui?: number } = {}): void {
  const edge = roomEdges(room.polygon).find((e) => e.index === opening.wallIndex);
  if (!edge) return;
  const ui = options.ui ?? 1;
  const mid = pointOnEdge(edge, opening.t);
  // Outside the wall, a little past its far face; an interior door's two halves each write on their own side.
  const out = thicknessM + 0.16;
  const p = toScreen(t, { x: mid.x - edge.inward.x * out, z: mid.z - edge.inward.z * out });
  const angle = Math.atan2(edge.dir.z, edge.dir.x);
  const upright = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle;
  const text = `${formatDimension(opening.widthM, '').trim()} × ${formatDimension(opening.heightM, unitM)}`;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(upright);
  ctx.font = `500 ${Math.round(9 * ui)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 6 * ui;
  const h = 12 * ui;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = opening.kind === 'window' ? EDITOR.window : EDITOR.door;
  ctx.fillText(text, 0, 0.5 * ui);
  ctx.restore();
}
