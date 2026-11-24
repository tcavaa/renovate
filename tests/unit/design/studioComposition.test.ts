import { describe, expect, it } from 'vitest';
import { diningZones, layoutRoom, programPiece } from '@/lib/design/autoLayout';
import { ROOM_PROGRAMS } from '@/lib/design/catalog';
import { diningCluster, livingScore, screenOnWall, sofaFacesScreen, zonesReached } from '@/lib/design/composition';
import { refreshRoom } from '@/lib/design/planGeometry';
import { defaultSplit, lineIsTheApps, personsSplit, studioParts, swapped, turned } from '@/lib/design/studio';
import { bestComposition, composeStudios, splitCandidates, studioContext } from '@/lib/design/studioLayout';
import type { FloorPlan, Opening, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const opening = (id: string, kind: Opening['kind'], wallIndex: number, t: number, widthM: number, extra: Partial<Opening> = {}): Opening => ({
  id,
  kind,
  wallIndex,
  t,
  widthM,
  heightM: kind === 'window' ? 1.4 : 2.05,
  sillM: kind === 'window' ? 0.9 : 0,
  roomId: 's',
  exterior: kind === 'window',
  ...extra,
});
const room = (polygon: Vec2[], extra: Partial<PlanRoom> = {}): PlanRoom =>
  refreshRoom({ id: 's', type: 'studio', name: 'სტუდიო 1', polygon, heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [], ...extra });
const piece = (slot: string, x: number, z: number, width: number, depth: number, rotation = 0, extra: Partial<PlacedItem> = {}): PlacedItem => ({
  id: `s-${slot}`,
  roomId: 's',
  slot: slot as PlacedItem['slot'],
  kind: slot,
  position: { x, z },
  rotation,
  elevationM: 0,
  size: { width, depth, height: 0.8 },
  product: null,
  ...extra,
});

// A 4.7 × 7.6 m studio (edges: 0 the top z=0, 1 the right x=4.7, 2 the bottom z=7.6, 3 the left x=0):
// the front door at the top, windows down the right wall and at the bottom. The app's first line puts
// the kitchen in the top 35 % — on the front door, as #386's was.
const studio = room([P(0, 0), P(4.7, 0), P(4.7, 7.6), P(0, 7.6)], {
  openings: [opening('d', 'door', 0, 0.3, 0.95, { exterior: true }), opening('w1', 'window', 1, 0.3, 1.4), opening('w2', 'window', 1, 0.75, 1.4), opening('w3', 'window', 2, 0.5, 1.5)],
});
const plan = (rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null }) as unknown as FloorPlan;
const has = (items: PlacedItem[], ...slots: string[]) => items.some((i) => slots.includes(i.slot));

describe('the line generation may place (lineIsTheApps, personsSplit)', () => {
  it("is the app's where there is none, where the app first drew it, or where a generation placed it", () => {
    expect(lineIsTheApps(studio)).toBe(true);
    expect(lineIsTheApps({ ...studio, split: defaultSplit(studio) })).toBe(true);
    expect(lineIsTheApps({ ...studio, split: { axis: 'z', t: 0.6, parts: ['living_room', 'kitchen'], chosen: true } })).toBe(true);
  });

  it('is the person’s once moved, turned or swapped — and those edits drop the mark', () => {
    expect(lineIsTheApps({ ...studio, split: { axis: 'z', t: 0.5, parts: ['kitchen', 'living_room'] } })).toBe(false);
    const chosen = { ...studio, split: { axis: 'z' as const, t: 0.6, parts: ['living_room', 'kitchen'] as PlanRoom['type'][] as ['living_room', 'kitchen'], chosen: true } };
    expect(turned(chosen).chosen).toBeUndefined();
    expect(swapped(chosen).chosen).toBeUndefined();
    expect(personsSplit(chosen.split)).toEqual({ axis: 'z', t: 0.6, parts: ['living_room', 'kitchen'] });
  });
});

describe('the lines a studio is tried with (splitCandidates)', () => {
  it('tries the kitchen at either end of either axis, the living part keeping 2.8 m, and the first line', () => {
    const lines = splitCandidates(studio);
    expect(lines[0]).toMatchObject({ axis: defaultSplit(studio).axis, t: defaultSplit(studio).t, chosen: true });
    // Across z (7.6 m) all five depths at both ends; across x (4.7 m) only 2.0 and 2 metres short of it.
    expect(lines.filter((l) => l.axis === 'z' && l.parts[0] === 'kitchen').length).toBeGreaterThanOrEqual(5);
    expect(lines.some((l) => l.axis === 'z' && l.parts[1] === 'kitchen')).toBe(true);
    expect(lines.filter((l) => l.axis === 'x').every((l) => Math.min(l.t, 1 - l.t) * 4.7 <= 1.95)).toBe(true);
  });
});

describe('a studio laid out as one space (composeStudios)', () => {
  it('places the kitchen by the water, off the front door, with its run, fridge and table', () => {
    // The sewer and the water on the bottom wall: the kitchen goes to that end, not the front door's.
    const anchors = { s: [{ kind: 'sewer' as const, point: P(1.2, 7.55) }, { kind: 'water_supply' as const, point: P(1.4, 7.55) }] };
    const best = bestComposition(studio, { anchors }, studioContext(plan([studio]), studio, anchors))!;
    const laid = { ...studio, split: best.split };
    const kitchen = studioParts(laid)!.find((p) => p.type === 'kitchen')!;
    expect(Math.max(...kitchen.polygon.map((p) => p.z))).toBeCloseTo(7.6, 1);
    const items = layoutRoom(laid, { anchors, sofaFree: best.sofaFree ? { s: true } : undefined });
    for (const slot of ['kitchen_run', 'fridge', 'dining_table', 'sofa', 'tv']) expect(has(items, slot), slot).toBe(true);
    expect(best.score.essentials).toBe(5);
    expect(screenOnWall(laid, items)).toBe(true);
  });

  it('writes the line it chose onto the plan, and keeps a line the person set', () => {
    const composed = composeStudios(plan([studio]), {});
    expect(composed.plan.rooms[0].split?.chosen).toBe(true);
    const own = { ...studio, split: { axis: 'z' as const, t: 0.3, parts: ['kitchen', 'living_room'] as ['kitchen', 'living_room'] } };
    const kept = composeStudios(plan([own]), {});
    expect(kept.plan.rooms[0].split).toEqual(own.split);
  });

  it('is the same studio whatever the seed: no draw', () => {
    expect(composeStudios(plan([studio]), {}).plan.rooms[0].split).toEqual(composeStudios(plan([studio]), {}).plan.rooms[0].split);
  });
});

describe('a studio’s sofa (decision 3.4)', () => {
  it('is never a corner sofa, however square the half', () => {
    const square = room([P(0, 0), P(6, 0), P(6, 8), P(0, 8)]);
    const [, living] = studioParts({ ...square, split: { axis: 'z', t: 0.3, parts: ['kitchen', 'living_room'] } })!;
    const half = { ...square, type: 'living_room' as const, polygon: living.polygon, areaM2: living.areaM2, studioPart: 1 as const };
    const sofa = ROOM_PROGRAMS.living_room[0];
    expect(programPiece(sofa, { ...half, studioPart: undefined })?.kind).toBe('sofa_corner');
    expect(programPiece(sofa, half)?.kind).toBe('sofa_3seat');
  });
});

describe('the dining table apart from the sitting group (diningCluster)', () => {
  const lounge = room([P(0, 0), P(7, 0), P(7, 4), P(0, 4)], { type: 'living_room' });
  const sofa = piece('sofa', 1, 3.5, 2.2, 0.9, Math.PI);
  const coffee = piece('coffee_table', 1, 2.5, 1.1, 0.6);
  it('counts a table beside the sofa, or nearer the sitting group than 40 % of the room (3 m at most)', () => {
    expect(diningCluster(lounge, [sofa, coffee, piece('dining_table', 3.1, 3, 1.6, 0.9)])?.clustered).toBe(true);
    expect(diningCluster(lounge, [sofa, coffee, piece('dining_table', 5.6, 1.5, 1.6, 0.9)])?.clustered).toBe(false);
    expect(diningCluster(lounge, [sofa, coffee])).toBeNull();
  });

  it('keeps a living room’s dining zone at either end of its long side', () => {
    expect(diningZones(lounge).length).toBeGreaterThan(0);
    expect(diningZones(room([P(0, 0), P(4, 0), P(4, 4), P(0, 4)]))).toEqual([]);
  });
});

describe('the sofa facing its screen (sofaFacesScreen)', () => {
  // A 6 × 4 m living room: the sofa against the top wall looking down (+z).
  const lounge = room([P(0, 0), P(6, 0), P(6, 4), P(0, 4)], { id: 's', type: 'living_room' });
  const sofa = piece('sofa', 3, 0.5, 2.2, 0.95, 0);
  const across = piece('tv_unit', 3, 3.8, 1.6, 0.4, Math.PI);
  // In the 2.5–3.5 m range too, but on the left wall, turned to look across the room.
  const aside = piece('tv_unit', 0.2, 2.5, 1.6, 0.4, Math.PI / 2);

  it('is a screen across from the sofa, looking back at it — not one at the same distance on a side wall', () => {
    expect(sofaFacesScreen(sofa, across)).toBe(true);
    expect(sofaFacesScreen(sofa, aside)).toBe(false);
    // Ahead of the sofa but turned away from it.
    expect(sofaFacesScreen(sofa, { ...across, rotation: 0 })).toBe(false);
  });

  it('scores a living room with its TV across from the sofa above one with it on a side wall', () => {
    const tv = (unit: PlacedItem) => piece('tv', unit.position.x, unit.position.z, 1.2, 0.08, unit.rotation, { elevationM: 0.5, id: 's-tv' });
    const facing = livingScore(lounge, [sofa, across, tv(across)]);
    const sideways = livingScore(lounge, [sofa, aside, tv(aside)]);
    expect(facing - sideways).toBeGreaterThanOrEqual(40);
  });
});

describe('a way from the door to each zone (zonesReached)', () => {
  const box = room([P(0, 0), P(4, 0), P(4, 4), P(0, 4)], { type: 'living_room', openings: [opening('d', 'door', 0, 0.5, 0.9, { exterior: true })] });
  it('reaches a sofa across open floor, and not one walled off by a bookcase across the room', () => {
    const sofa = piece('sofa', 2, 3.5, 2, 0.9, Math.PI);
    expect(zonesReached(box, [sofa], ['sofa']).unreached).toEqual([]);
    const wall = piece('bookshelf', 2, 2, 4, 0.4);
    expect(zonesReached(box, [sofa, wall], ['sofa']).unreached).toEqual(['sofa']);
  });

  it('judges nothing in a room drawn with no doorway', () => {
    expect(zonesReached({ ...box, openings: [] }, [piece('sofa', 2, 3.5, 2, 0.9)], ['sofa']).unreached).toEqual([]);
  });
});
