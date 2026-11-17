/**
 * A finished flat checked as a whole (docs/design-studio/generation-audit.md): what no rule allows —
 * a piece arranged off one the room does not have, a TV unit on a room separator's line, a vanity
 * built into the shower's tray, a basin hanging in the air, a socket inside a radiator — and what
 * the flat ends without. Each stage of the generator tests what it places with a test of its own;
 * this reads the result, with the app's own geometry, so a change to generation can be measured
 * (`pnpm audit:generation`) and kept from sliding back (tests/unit/design/generationInvariants.test.ts).
 * Pure: it reads a scene and returns what it found.
 */

import { arrangedOff } from './arrangedOff';
import { getArchetype } from './catalog';
import { decorFootprint } from './decor/joinery';
import { isLampOutlet } from './electrical';
import { blocksWindow, footprintInRoom, footprintOf, inDoorway, pieceWall, tucksUnder, type Footprint } from './manipulate';
import { isOpenEdge, roomEdges } from './planGeometry';
import { DEFAULT_SECTION_WIDTH_M, radiatorPoints, radiatorSections, radiatorWallSpot } from './radiators';
import { RADIATOR_HEIGHT_M, radiatorKeepouts, ruleViolations, type RuleCode } from './ruleChecks';
import { footprintQuad, quadsOverlap, RADIATOR_FLOOR_GAP_M, rayToPolygon, TOWEL_RAIL_BOTTOM_M, TOWEL_RAIL_HEIGHT_M, TOWEL_RAIL_WIDTH_M } from './rules';
import { showerArea } from './shower';
import type { DecorPiece, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, SlotKind, Vec2 } from './types';
import { columnFootprints } from './walls';
import { decorPieceSchema, electricalPointSchema, floorPlanSchema, placedItemSchema } from '../validations/design.schema';

export type SceneIssueCode =
  /** A piece arranged off a piece the room does not have: a coffee table with no sofa, nightstands with no bed. */
  | 'orphan'
  /** A TV unit with its back on a room separator's line — open floor, not a wall. */
  | 'on_open_line'
  /** A TV unit standing free of every wall. */
  | 'tv_unit_off_wall'
  /** A floor piece standing in a shower's tray. */
  | 'in_shower_tray'
  /** Joinery or a box built into a shower's tray. */
  | 'joinery_in_tray'
  /** A floor piece standing in joinery or a box that was not built for it. */
  | 'in_joinery'
  /** A basin lifted to washing height with nothing built under it. */
  | 'basin_in_air'
  /** A floor piece within 90 cm in front of a door or an archway (`inDoorway`). */
  | 'door_zone'
  /** Joinery or a box within 90 cm in front of a door or an archway. */
  | 'joinery_in_door_zone'
  /** Two floor pieces in each other. */
  | 'floor_overlap'
  /** A floor piece through a wall. */
  | 'out_of_room'
  /** A piece taller than the sill standing across a window. */
  | 'across_window'
  /** A floor piece on the strip in front of a radiator, or in a column. */
  | 'on_keep_clear'
  /** Two hung pieces in each other. */
  | 'hung_clash'
  /** A hung piece into what stands below it: a mirror into the console, a pendant into a canopy bed. */
  | 'hung_into_floor'
  /** A socket inside a radiator's body. */
  | 'socket_in_radiator'
  /** A hanging lamp and a ceiling point that is a light of its own (not the lamp's outlet) at one spot: two main lights. */
  | 'two_main_lights'
  /** Something within 30 cm in front of a built wall of wardrobe: its doors cannot open. */
  | 'wardrobe_blocked'
  /** Joinery that leaves under 70 cm to the wall across. */
  | 'joinery_tight'
  /** What the room ends without. A measure, not a defect in itself: which rooms must have what is the owner's to say. */
  | 'missing'
  /** One of the app's own rule checks (`ruleViolations`) the generated flat fails. */
  | 'rule'
  /** A piece the save route refuses (`lib/validations/design.schema`): a flat holding it cannot be saved at all. */
  | 'unsaveable';

export interface SceneIssue {
  code: SceneIssueCode;
  /** What splits the code in the tally: the missing piece, the orphan, the rule's code. Absent: counted under the code alone. */
  key?: string;
  roomId: string | null;
  roomType: PlanRoom['type'] | null;
  /** The piece (or the decor) it is about. */
  itemId?: string;
  /** For the report: which kinds, and by how much. */
  what: string;
}

export interface AuditedScene {
  plan: FloorPlan;
  items: PlacedItem[];
  decor?: readonly DecorPiece[];
  electrical?: readonly ElectricalPoint[];
}

/** What is counted as overlap: anything under 3 cm is how pieces are stood side by side. */
const TOUCH_M = 0.03;
/** Joinery is measured to the millimetre (`cabinetPiece` rounds its span to it). */
const JOINERY_MM = 0.001;
/** Lying on the floor or hanging at a window: in nobody's way. */
const FLAT_SLOTS: ReadonlySet<SlotKind> = new Set<SlotKind>(['rug', 'door_mat', 'curtain']);

/**
 * What a room is furnished for, by its type — any one slot of a group will do. Not a rule of the
 * generator's: the measure the audit was taken with, so the same thing is counted after each fix.
 */
export const ESSENTIALS: Partial<Record<PlanRoom['type'], SlotKind[][]>> = {
  bedroom: [['bed'], ['nightstand'], ['wardrobe']],
  living_room: [['sofa'], ['tv_unit'], ['tv']],
  kitchen: [['kitchen_run'], ['fridge']],
  bathroom: [['toilet'], ['sink'], ['shower', 'bathtub'], ['mirror']],
  toilet: [['toilet'], ['sink'], ['mirror']],
  studio: [['kitchen_run'], ['fridge'], ['sofa'], ['tv_unit'], ['tv']],
  office: [['desk'], ['office_chair']],
};

/**
 * What a piece is left without, besides the piece it was arranged off (`arrangedOff`, the
 * archetypes' own rules: a coffee table with no sofa, a TV with no unit): a TV unit laid for a TV
 * the room then does not get. Not arranged off the TV — the TV hangs over the unit — so nothing the
 * generator drops; counted so that the layout's unit without a TV shows.
 */
const LAID_FOR: ReadonlyArray<{ needs: SlotKind; orphans: SlotKind[] }> = [{ needs: 'tv', orphans: ['tv_unit'] }];

/** Rule checks that read the building as it was drawn — a narrow door, a boiler on an inside wall: not generation's doing. */
const PLAN_RULES: ReadonlySet<RuleCode> = new Set<RuleCode>(['door_too_narrow', 'door_swing_clash', 'boiler_not_exterior', 'boiler_by_bath', 'radiator_under_sill']);

const box = (item: Pick<PlacedItem, 'position' | 'size' | 'rotation'>): Footprint => footprintOf(item.position, item.size, item.rotation);
/** How far two boxes are in each other, metres (negative: apart). */
const depthIn = (a: Footprint, b: Footprint) => Math.min(Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX), Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
const boxOf = (corners: readonly Vec2[]): Footprint => ({ minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)), minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)) });
const shrunk = (item: Pick<PlacedItem, 'position' | 'size' | 'rotation'>, by: number) =>
  footprintQuad({ position: item.position, rotation: item.rotation, size: { width: Math.max(0.01, item.size.width - 2 * by), depth: Math.max(0.01, item.size.depth - 2 * by), height: item.size.height } });
const cm = (m: number) => `${Math.round(m * 100)} cm`;
const onFloor = (item: PlacedItem) => item.elevationM < 0.05 && !FLAT_SLOTS.has(item.slot);

/** The pieces a piece of joinery or a box was built for: they stand in it by design. */
function builtFor(piece: DecorPiece): Set<string> {
  const ids = [piece.itemId, ...(piece.params.sections ?? []).map((s) => s.itemId)];
  return new Set(ids.filter((id): id is string => !!id));
}

/** Everything wrong with a finished flat, and what each room ends without. */
export function auditScene(scene: AuditedScene): SceneIssue[] {
  const { plan, items } = scene;
  const decor = scene.decor ?? [];
  const electrical = scene.electrical ?? [];
  const issues: SceneIssue[] = [];
  const strips = radiatorKeepouts(plan);

  for (const room of plan.rooms) {
    const say = (code: SceneIssueCode, what: string, itemId?: string, key?: string) => issues.push({ code, key, roomId: room.id, roomType: room.type, itemId, what });
    const inRoom = items.filter((i) => i.roomId === room.id);
    const roomDecor = decor.filter((d) => d.roomId === room.id);
    const floor = inRoom.filter(onFloor);
    const slots = new Set(inRoom.map((i) => i.slot));
    const built = (suffix: string) => roomDecor.some((d) => d.id === `decor-${room.id}-${suffix}`);

    // --- what the room ends without
    for (const group of ESSENTIALS[room.type] ?? []) {
      const has = group.some((slot) => slots.has(slot)) || (group.includes('wardrobe') && built('wardrobe-wall'));
      if (!has) say('missing', group.join('/'), undefined, `${room.type}:${group.join('/')}`);
    }

    // --- pieces arranged off a piece that is not there: by the rule the engine lays them by, such
    // a piece stands nowhere in a room without the other (`only`), so there it is left over from one
    // that is gone. What the engine lays on its own all the same — a rug under the room's main
    // piece, a fridge on a wall of a kitchen with no run — is a missing piece, not an orphan.
    const orphaned = new Set<SlotKind>();
    for (const item of inRoom) {
      const off = arrangedOff(item.kind, room.type);
      if (!off?.only || orphaned.has(item.slot) || off.slots.some((slot) => slots.has(slot))) continue;
      orphaned.add(item.slot);
      say('orphan', `${item.slot} with no ${off.slots[0]}`, item.id, `${item.slot}:no_${off.slots[0]}`);
    }
    for (const rule of LAID_FOR) {
      if (slots.has(rule.needs)) continue;
      for (const slot of rule.orphans) {
        if (!slots.has(slot)) continue;
        say('orphan', `${slot} with no ${rule.needs}`, inRoom.find((i) => i.slot === slot)?.id, `${slot}:no_${rule.needs}`);
      }
    }

    // --- the TV unit: on a wall, never on a separator's open line
    for (const unit of inRoom.filter((i) => i.slot === 'tv_unit')) {
      const wall = pieceWall(unit, room, 0.12);
      if (!wall) say('tv_unit_off_wall', unit.kind, unit.id);
      else if (isOpenEdge(room, wall.edge.index)) say('on_open_line', unit.kind, unit.id);
    }

    // --- two floor pieces in each other
    for (let a = 0; a < floor.length; a++) {
      for (let b = a + 1; b < floor.length; b++) {
        const A = floor[a];
        const B = floor[b];
        if (tucksUnder(A, B) || !quadsOverlap(shrunk(A, TOUCH_M), shrunk(B, TOUCH_M))) continue;
        say('floor_overlap', `${[A.kind, B.kind].sort().join(' × ')} by ${cm(depthIn(box(A), box(B)))}`, A.id);
      }
    }

    // --- the shower's tray: its floor is the shower's, whatever the column at its back measures
    for (const shower of inRoom) {
      const area = showerArea(shower);
      if (!area) continue;
      const tray = { position: area.centre, rotation: area.rotation, size: { width: area.width, depth: area.depth, height: 2 } };
      const trayBox = box(tray);
      for (const other of floor) {
        if (other.id === shower.id || !quadsOverlap(shrunk(tray, TOUCH_M), shrunk(other, TOUCH_M))) continue;
        say('in_shower_tray', `${other.kind} by ${cm(depthIn(trayBox, box(other)))}`, other.id);
      }
      for (const piece of roomDecor) {
        const corners = decorFootprint(piece, room);
        if (!corners) continue;
        const by = depthIn(trayBox, boxOf(corners));
        if (by > TOUCH_M * 2) say('joinery_in_tray', `${piece.family}${piece.anchor ? `:${piece.anchor}` : ''} by ${cm(by)}`, piece.id);
      }
      if (inDoorway({ ...tray, elevationM: 0 }, room)) say('door_zone', 'shower tray', shower.id);
    }

    // --- joinery and boxes: what stands in them, where they stand
    for (const piece of roomDecor) {
      const corners = decorFootprint(piece, room);
      if (!corners) continue;
      const solid = boxOf(corners);
      const own = builtFor(piece);
      for (const item of floor) {
        if (own.has(item.id)) continue;
        if (piece.anchor === 'wc' && item.slot === 'toilet') continue;
        if (piece.anchor === 'bath' && (item.slot === 'bathtub' || item.slot === 'bath_mixer')) continue;
        const by = depthIn(solid, box(item));
        if (by > TOUCH_M * 2) say('in_joinery', `${item.kind} in ${piece.family}${piece.anchor ? `:${piece.anchor}` : ''} by ${cm(by)}`, item.id);
      }
      const middle = { x: (solid.minX + solid.maxX) / 2, z: (solid.minZ + solid.maxZ) / 2 };
      // Joinery built up to a door's way touches it — within the millimetre joinery is measured to
      // (a span's sum a hair past the edge) — and is not in it; any more of it is.
      const size = { width: Math.max(JOINERY_MM, solid.maxX - solid.minX - 2 * JOINERY_MM), depth: Math.max(JOINERY_MM, solid.maxZ - solid.minZ - 2 * JOINERY_MM), height: 2 };
      if (inDoorway({ position: middle, rotation: 0, size, elevationM: 0 }, room)) say('joinery_in_door_zone', `${piece.family}${piece.anchor ? `:${piece.anchor}` : ''}`, piece.id);
      const edge = roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
      if (!edge || piece.family !== 'cabinet') continue;
      const lo = Math.min(piece.span.from, piece.span.to);
      const hi = Math.max(piece.span.from, piece.span.to);
      const depth = Math.max(...corners.map((c) => (c.x - edge.a.x) * edge.inward.x + (c.z - edge.a.z) * edge.inward.z));
      const start = { x: edge.a.x + edge.dir.x * ((lo + hi) / 2) + edge.inward.x * (depth + 0.02), z: edge.a.z + edge.dir.z * ((lo + hi) / 2) + edge.inward.z * (depth + 0.02) };
      const clear = rayToPolygon(start, edge.inward, room.polygon);
      if (clear != null && clear < 0.7) say('joinery_tight', `${cm(clear)} left`, piece.id);
      // A wall of wardrobe opens into the room: what stands within 30 cm of its doors is in their way.
      if (!piece.id.endsWith('wardrobe-wall')) continue;
      let nearest = Infinity;
      let who = '';
      for (const item of floor) {
        const b = box(item);
        const points = [{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.minZ }, { x: b.maxX, z: b.maxZ }, { x: b.minX, z: b.maxZ }];
        const along = points.map((p) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z);
        if (Math.max(...along) <= lo + 0.05 || Math.min(...along) >= hi - 0.05) continue;
        const gap = Math.min(...points.map((p) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z)) - depth;
        if (gap < nearest) {
          nearest = gap;
          who = item.kind;
        }
      }
      if (nearest < 0.3) say('wardrobe_blocked', `${who} ${cm(Math.max(0, nearest))} in front`, piece.id);
    }

    // --- a basin at washing height stands on something
    if (room.type === 'bathroom' || room.type === 'toilet') {
      for (const sink of inRoom.filter((i) => i.slot === 'sink' && i.elevationM > 0.3)) {
        if (!roomDecor.some((d) => builtFor(d).has(sink.id))) say('basin_in_air', `${sink.kind} at ${cm(sink.elevationM)}`, sink.id);
      }
    }

    // --- in a door's way, through a wall, across a window, on a radiator's strip or a column
    const keepClear = [...(strips[room.id] ?? []), ...columnFootprints(plan, room.id)];
    for (const item of floor) {
      if (inDoorway(item, room)) say('door_zone', item.kind, item.id);
      if (!getArchetype(item.kind)?.ghost && !footprintInRoom(box(item), room.polygon)) say('out_of_room', item.kind, item.id);
      if (blocksWindow(item, room)) say('across_window', item.kind, item.id);
      if (keepClear.some((k) => depthIn(k, box(item)) > TOUCH_M * 2)) say('on_keep_clear', item.kind, item.id);
    }

    // --- hung pieces: into each other, into what stands under them
    const hung = inRoom.filter((i) => i.elevationM >= 0.05 && i.slot !== 'curtain');
    for (let a = 0; a < hung.length; a++) {
      const A = hung[a];
      for (let b = a + 1; b < hung.length; b++) {
        const B = hung[b];
        const pair = [A.slot, B.slot].sort().join(' × ');
        if (pair === 'sink × tap' || pair === 'dryer × washer') continue;
        if (A.elevationM + A.size.height <= B.elevationM + 0.02 || B.elevationM + B.size.height <= A.elevationM + 0.02) continue;
        if (quadsOverlap(shrunk(A, 0.01), shrunk(B, 0.01))) say('hung_clash', [A.kind, B.kind].sort().join(' × '), A.id);
      }
      for (const below of floor) {
        if (below.size.height <= A.elevationM + 0.03) continue;
        const pair = `${A.slot} into ${below.slot}`;
        if (pair === 'tv into tv_unit' || pair === 'dryer into washer' || pair === 'tap into sink' || pair === 'kitchen_wall into kitchen_run') continue;
        if (quadsOverlap(shrunk(A, 0.01), shrunk(below, 0.02))) say('hung_into_floor', `${A.kind} into ${below.kind}`, A.id);
      }
    }

    // --- one main light: the hanging lamp, or the wiring's ceiling light
    for (const pendant of inRoom.filter((i) => i.slot === 'pendant')) {
      // A ceiling point there that is a light of its own, bought yet or not — not the hanging lamp's
      // outlet (`isLampOutlet`), which is that lamp: what the lighting plan lists as a second main light.
      const twin = electrical.find((p) => p.roomId === room.id && (p.kind === 'light_ceiling' || p.kind === 'light_spot') && !isLampOutlet(p, inRoom) && Math.hypot(p.position.x - pendant.position.x, p.position.z - pendant.position.z) < 0.35);
      if (twin) say('two_main_lights', `${pendant.kind} and ${twin.kind}`, pendant.id);
    }
  }

  // --- a socket inside a radiator
  for (const point of radiatorPoints(plan)) {
    const spot = radiatorWallSpot(plan, point);
    if (!spot) continue;
    const length = point.towelRail ? TOWEL_RAIL_WIDTH_M : radiatorSections(plan, point) * (point.radiator?.sectionWidthM ?? DEFAULT_SECTION_WIDTH_M);
    const bottom = point.elevationM ?? (point.towelRail ? TOWEL_RAIL_BOTTOM_M : RADIATOR_FLOOR_GAP_M);
    const top = bottom + (point.towelRail ? TOWEL_RAIL_HEIGHT_M : point.radiator?.heightM ?? RADIATOR_HEIGHT_M);
    for (const socket of electrical) {
      if (socket.roomId !== spot.room.id || socket.wallIndex !== spot.edge.index || socket.t == null || !socket.kind.startsWith('socket')) continue;
      if (socket.elevationM < bottom - 0.04 || socket.elevationM > top + 0.04) continue;
      if (Math.abs(socket.t * spot.edge.length - spot.s) < length / 2 + 0.04) issues.push({ code: 'socket_in_radiator', roomId: spot.room.id, roomType: spot.room.type, itemId: socket.id, what: socket.kind });
    }
  }

  // --- a washing machine somewhere in a flat that has a bathroom
  if (plan.rooms.some((r) => r.type === 'bathroom') && !items.some((i) => i.slot === 'washer')) {
    issues.push({ code: 'missing', key: 'flat:washer', roomId: null, roomType: null, what: 'washer' });
  }

  // --- what the save route would refuse: one such piece and the whole flat is not saved
  const refused = (key: string, what: string, itemId?: string) => issues.push({ code: 'unsaveable', key, roomId: null, roomType: null, itemId, what });
  const planCheck = floorPlanSchema.safeParse(plan);
  if (!planCheck.success) refused('plan', planCheck.error.issues.map((i) => i.path.join('.')).join(', '));
  for (const item of items) {
    const check = placedItemSchema.safeParse(item);
    if (!check.success) refused('items', `${item.kind}: ${check.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`, item.id);
  }
  for (const piece of decor) {
    const check = decorPieceSchema.safeParse(piece);
    if (!check.success) refused('decor', `${piece.family}: ${check.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`, piece.id);
  }
  for (const point of electrical) {
    const check = electricalPointSchema.safeParse(point);
    if (!check.success) refused('electrical', `${point.kind}: ${check.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`, point.id);
  }

  // --- the app's own rule checks, on the flat the app made
  for (const violation of ruleViolations(plan, items, [...electrical])) {
    if (PLAN_RULES.has(violation.code)) continue;
    const room = plan.rooms.find((r) => r.id === violation.roomId) ?? null;
    issues.push({ code: 'rule', key: violation.code, roomId: room?.id ?? null, roomType: room?.type ?? null, itemId: violation.itemId ?? undefined, what: violation.code });
  }
  return issues;
}

/** The name an issue is counted under: its code, split by its key where it has one (`missing:bathroom:shower/bathtub`). */
export function issueMetric(issue: Pick<SceneIssue, 'code' | 'key'>): string {
  return issue.key ? `${issue.code}:${issue.key}` : issue.code;
}

/** How many of each. */
export function tallyIssues(issues: readonly SceneIssue[], into: Record<string, number> = {}): Record<string, number> {
  for (const issue of issues) {
    const metric = issueMetric(issue);
    into[metric] = (into[metric] ?? 0) + 1;
  }
  return into;
}
