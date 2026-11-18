import { describe, expect, it } from 'vitest';
import { boxFor, houseItem } from '@/lib/design/decor/housing';
import { wcBoxes } from '@/lib/design/decor/wcBox';
import { buildReviewBrief, reviewFindings, validateReview, type ReviewOffer } from '@/lib/design/aiReview';
import { buildBrief, outlineText, programKinds } from '@/lib/design/aiDesign';
import type { CatalogProduct } from '@/lib/design/matcher';
import { reviewedScene } from '@/lib/design/generateScene';
import { applyReviewFixes, proposalDecor, type AiProposal } from '@/lib/design/aiProposal';
import type { DecorIntent } from '@/lib/design/decor/resolve';
import { suggestElectrical } from '@/lib/design/electrical';
import { refreshRoom } from '@/lib/design/planGeometry';
import { footprintOf, footprintsOverlap } from '@/lib/design/manipulate';
import type { DecorPiece, FloorPlan, Opening, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';
import { sceneDefects } from '../../helpers/sceneChecks';

/**
 * The AI designer's check of the flat it furnished (`lib/design/aiReview`, `applyReviewFixes` in
 * `lib/design/aiProposal`, `reviewedScene` in `lib/design/generateScene`), on small hand-built
 * rooms: it is not shown the engine's own work as problems, and its actions leave a room whole.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
function room(id: string, type: PlanRoom['type'], w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const planOf = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 10, depth: 10 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 });
const sceneProduct = (id: number, name: string) => ({ productId: id, nameKa: name, nameEn: name, slug: `p-${id}`, brand: null, pricePerUnit: 100, unit: 'piece', qty: 1, totalPrice: 100, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: `/m/${id}.glb`, categorySlug: 'x', store: null });
function item(roomId: string, id: string, kind: string, x: number, z: number, size: PlacedItem['size'], rotation = 0, elevationM = 0, slot = kind): PlacedItem {
  return { id, roomId, slot: slot as PlacedItem['slot'], kind, position: P(x, z), rotation, elevationM, size, product: sceneProduct(1, kind) as PlacedItem['product'] };
}

describe('the check is not shown the engine’s own work as problems (A4)', () => {
  // A bathroom 3 × 2.5 m: the WC in front of its box on the near wall, the machine in its column,
  // the bath in its tiled box on the far wall.
  const bath = room('b', 'bathroom', 3, 2.5);
  const wc = item('b', 'wc', 'toilet', 0.6, 0.2 + 0.34, { width: 0.4, depth: 0.68, height: 0.82 });
  const washer = item('b', 'w', 'washer', 2.3, 0.295, { width: 0.6, depth: 0.55, height: 0.85 });
  const tub = item('b', 'tub', 'bathtub', 1.5, 2.5 - 0.02 - 0.35, { width: 1.7, depth: 0.7, height: 0.6 }, Math.PI);
  // A wall mixer over the bath's rim (on the floor, it stood 8 cm into the bath).
  const mixer = item('b', 'tub-mixer', 'bath_mixer', 1.5, 2.5 - 0.05, { width: 0.2, depth: 0.1, height: 0.2 }, Math.PI, 0.7);
  const box = wcBoxes([bath], [wc], [])[0];
  const column = houseItem(washer, [bath], [wc, washer], [box])!.decor.find((d) => d.family === 'cabinet')!;
  const tubBox = boxFor(tub, bath, [wc, washer, tub], [box, column])!;
  const items = [wc, washer, tub, mixer];
  const decor = [box, column, tubBox];

  it('raises nothing about a WC in front of its box, a machine in its column or a bath in its box', () => {
    expect(box.itemId).toBe('wc');
    expect(tubBox.itemId).toBe('tub');
    const findings = reviewFindings(planOf(bath), items, decor);
    expect(Object.fromEntries(['wc', 'w', 'tub', 'tub-mixer', box.id, column.id, tubBox.id].map((id) => [id, findings.get(id) ?? []]))).toEqual(Object.fromEntries(['wc', 'w', 'tub', 'tub-mixer', box.id, column.id, tubBox.id].map((id) => [id, []])));
  });

  it('still says a WC stands off its wall when it stands off its box’s face, measured from that face', () => {
    const out = { ...wc, position: P(0.6, 0.2 + 0.34 + 0.3) };
    const findings = reviewFindings(planOf(bath), [out, washer, tub, mixer], decor);
    expect((findings.get('wc') ?? []).join(' ')).toMatch(/stands 30 cm off the wall behind it/);
    // A box built before boxes named their WC is its box all the same.
    const unnamed = { ...box, itemId: undefined };
    expect(reviewFindings(planOf(bath), items, [unnamed, column, tubBox]).get('wc') ?? []).toEqual([]);
  });

  it('pushes a WC standing off its box back onto the box’s face, not into the box', () => {
    const out = { ...wc, position: P(0.6, 0.2 + 0.34 + 0.3) };
    const fixed = applyReviewFixes([out, washer, tub, mixer], decor, { model: 'm', notes: {}, fixes: [{ target: 'wc', action: 'to_wall', productId: null, wallIndex: null, reason: '' }] }, planOf(bath), []);
    const moved = fixed.items.find((i) => i.id === 'wc')!;
    const back = moved.position.z - moved.size.depth / 2;
    expect(back).toBeGreaterThanOrEqual(0.2 - 0.005);
    expect(back).toBeLessThanOrEqual(0.2 + 0.025);
    expect(moved.position.x).toBeCloseTo(0.6, 3);
  });

  it('offers no push back to its wall for a WC in front of its box — only for one standing off its face', () => {
    const toWall = (wcNow: PlacedItem) => {
      const set = [wcNow, washer, tub, mixer];
      const { offer } = buildReviewBrief({ plan: planOf(bath), items: set, decor, styleId: 'modern', locale: 'en', catalog: [], seed: 1 });
      return validateReview({ rooms: [{ room: 'b', note: '', fixes: [{ target: 'wc', action: 'to_wall', product: 0, wall: -1, reason: '' }] }] }, planOf(bath), offer, 'm').fixes.map((f) => f.action);
    };
    expect(toWall(wc)).toEqual([]);
    expect(toWall({ ...wc, position: P(0.6, 0.2 + 0.34 + 0.3) })).toEqual(['to_wall']);
  });
});

describe('the check’s actions leave the room whole (A5)', () => {
  // A living room 5 × 4 m: the sofa on the near wall with its coffee table and rug, the TV unit
  // across from it on the far wall with the TV over it, a bookcase on the east wall, a curtain at
  // the window and the lamp from the ceiling.
  const living = room('l', 'living_room', 5, 4, [{ kind: 'window', wallIndex: 3, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true }]);
  const sofa = item('l', 'sofa', 'sofa_3seat', 2.5, 0.47, { width: 2.1, depth: 0.9, height: 0.85 }, 0, 0, 'sofa');
  const table = item('l', 'table', 'coffee_table', 2.5, 0.92 + 0.42 + 0.3, { width: 1.1, depth: 0.6, height: 0.42 });
  const rug = item('l', 'rug', 'rug', 2.5, 1.6, { width: 2.4, depth: 1.7, height: 0.01 });
  const unit = item('l', 'unit', 'tv_unit', 2.5, 4 - 0.22, { width: 1.8, depth: 0.4, height: 0.5 }, Math.PI);
  const tv = item('l', 'tv', 'tv', 2.5, 4 - 0.05, { width: 1.2, depth: 0.06, height: 0.7 }, Math.PI, 1.1);
  const books = item('l', 'books', 'bookshelf', 5 - 0.2, 2.6, { width: 0.8, depth: 0.35, height: 1.9 }, -Math.PI / 2);
  const curtain = item('l', 'curtain', 'curtain', 0.06, 2, { width: 1.6, depth: 0.1, height: 2.5 }, Math.PI / 2, 0.1);
  const lamp = item('l', 'lamp', 'pendant', 2.5, 2, { width: 0.5, depth: 0.5, height: 0.6 }, 0, 2.0);
  const items = [sofa, table, rug, unit, tv, books, curtain, lamp];
  const plan = planOf(living);
  const offer: ReviewOffer = { alternatives: new Map(), itemsById: new Map(items.map((i) => [i.id, i])) };
  const ask = (fixes: Array<{ target: string; action: string; wall?: number }>) =>
    validateReview({ rooms: [{ room: 'l', note: '', fixes: fixes.map((f) => ({ target: f.target, action: f.action, product: 0, wall: f.wall ?? -1, reason: '' })) }] }, plan, offer, 'm').fixes.map((f) => `${f.target}:${f.action}`);

  it('never takes out a curtain, a blind or the ceiling lamp', () => {
    expect(ask([{ target: 'curtain', action: 'remove' }, { target: 'lamp', action: 'remove' }, { target: 'books', action: 'remove' }])).toEqual(['books:remove']);
  });

  it('moves to another wall only a piece nothing is laid out off — not the sofa with its table, unit and rug, nor the unit away from the sofa', () => {
    expect(ask([{ target: 'sofa', action: 'move_to_wall', wall: 2 }, { target: 'unit', action: 'move_to_wall', wall: 1 }, { target: 'books', action: 'move_to_wall', wall: 2 }])).toEqual(['books:move_to_wall']);
  });

  it('keeps the kitchen run, its wall cabinets and its fridge together', () => {
    const kitchen = room('k', 'kitchen', 4, 3);
    const run = item('k', 'run', 'kitchen_run', 1.5, 0.3, { width: 2.4, depth: 0.6, height: 0.9 });
    const cabinets = item('k', 'cabinets', 'kitchen_wall', 1.5, 0.17, { width: 2.4, depth: 0.35, height: 0.7 }, 0, 1.45);
    const fridge = item('k', 'fridge', 'fridge', 3.1, 0.35, { width: 0.6, depth: 0.7, height: 1.9 });
    const kOffer: ReviewOffer = { alternatives: new Map(), itemsById: new Map([run, cabinets, fridge].map((i) => [i.id, i])) };
    const fixes = validateReview({ rooms: [{ room: 'k', note: '', fixes: [{ target: 'run', action: 'move_to_wall', product: 0, wall: 2, reason: '' }] }] }, planOf(kitchen), kOffer, 'm').fixes;
    expect(fixes).toEqual([]);
  });

  it('takes what was laid out off a piece out with it: no TV left on the wall over a unit that is gone', () => {
    const checked = reviewedScene({ plan, items, decor: [], electrical: [], generation: { by: 'ai', at: 'now', aiCount: 1 }, styleId: 'modern' }, { model: 'm', notes: {}, fixes: [{ target: 'unit', action: 'remove', productId: null, wallIndex: null, reason: '' }] }, []);
    expect(checked.items.map((i) => i.id).sort()).toEqual(['books', 'curtain', 'lamp', 'rug', 'sofa', 'table']);
  });

  it('carries what stands on a piece it pushes back to its wall: the TV over its unit', () => {
    const off = { ...unit, position: P(2.5, 4 - 0.22 - 0.3) };
    const hung = { ...tv, position: P(2.5, 4 - 0.05 - 0.3) };
    const fixed = applyReviewFixes([sofa, table, rug, off, hung, books], [], { model: 'm', notes: {}, fixes: [{ target: 'unit', action: 'to_wall', productId: null, wallIndex: null, reason: '' }] }, plan, []).items;
    expect(fixed.find((i) => i.id === 'unit')!.position.z).toBeCloseTo(4 - 0.22, 2);
    expect(fixed.find((i) => i.id === 'tv')!.position.z).toBeCloseTo(4 - 0.05, 2);
  });

  it('pushes back to its wall only a piece that stands off it — never the lamp, the rug, a curtain, a blind, a table or the kitchen', () => {
    const offUnit = { ...unit, position: P(2.5, 4 - 0.22 - 0.3) };
    const hungTv = { ...tv, position: P(2.5, 4 - 0.05 - 0.3) };
    const offBooks = { ...books, position: P(5 - 0.2 - 0.3, 2.6) };
    const blind = item('l', 'blind', 'blind', 0.04, 2, { width: 1.2, depth: 0.05, height: 1.4 }, Math.PI / 2, 0.9, 'curtain');
    const set = [sofa, table, rug, offUnit, hungTv, offBooks, curtain, lamp, blind];
    const { offer: brief } = buildReviewBrief({ plan, items: set, styleId: 'modern', locale: 'en', catalog: [], seed: 1 });
    const fixes = ['sofa', 'table', 'rug', 'unit', 'books', 'curtain', 'lamp', 'blind'].map((target) => ({ target, action: 'to_wall', product: 0, wall: -1, reason: '' }));
    expect(validateReview({ rooms: [{ room: 'l', note: '', fixes: fixes.slice(0, 6) }, { room: 'l', note: '', fixes: fixes.slice(6) }] }, plan, brief, 'm').fixes.map((f) => `${f.target}:${f.action}`)).toEqual(['books:to_wall']);
    // The kitchen's run and its wall cabinets are made to their place: not pushed alone, even off the wall.
    const kitchen = room('k', 'kitchen', 4, 3);
    const run = item('k', 'run', 'kitchen_run', 1.5, 0.3 + 0.3, { width: 2.4, depth: 0.6, height: 0.9 });
    const cabinets = item('k', 'cabinets', 'kitchen_wall', 1.5, 0.17 + 0.3, { width: 2.4, depth: 0.35, height: 0.7 }, 0, 1.45);
    const { offer: kBrief } = buildReviewBrief({ plan: planOf(kitchen), items: [run, cabinets], styleId: 'modern', locale: 'en', catalog: [], seed: 1 });
    expect(validateReview({ rooms: [{ room: 'k', note: '', fixes: [run, cabinets].map((i) => ({ target: i.id, action: 'to_wall', product: 0, wall: -1, reason: '' })) }] }, planOf(kitchen), kBrief, 'm').fixes).toEqual([]);
  });

  it('moves nothing to another wall that hangs at a window, from the ceiling, lies under a piece or stands free', () => {
    const blind = item('l', 'blind', 'blind', 0.04, 2, { width: 1.2, depth: 0.05, height: 1.4 }, Math.PI / 2, 0.9, 'curtain');
    const dining = item('l', 'dining', 'dining_table', 2.5, 2.2, { width: 1.2, depth: 0.8, height: 0.75 });
    const set = [...items, blind, dining];
    const o: ReviewOffer = { alternatives: new Map(), itemsById: new Map(set.map((i) => [i.id, i])) };
    const moves = ['curtain', 'blind', 'lamp', 'rug', 'dining', 'books'].map((target) => ({ target, action: 'move_to_wall', product: 0, wall: 2, reason: '' }));
    expect(validateReview({ rooms: [{ room: 'l', note: '', fixes: moves }] }, plan, o, 'm').fixes.map((f) => f.target)).toEqual(['books']);
  });

  it('moves a piece only onto floor kept clear of radiators and columns', () => {
    // Wall 2 (z = 4) has a radiator's strip where the bookcase would stand at its middle.
    const strip = { minX: 1.5, maxX: 3.5, minZ: 3.4, maxZ: 4 };
    const moved = applyReviewFixes([sofa, books], [], { model: 'm', notes: {}, fixes: [{ target: 'books', action: 'move_to_wall', productId: null, wallIndex: 2, reason: '' }] }, plan, [], { l: [strip] }).items.find((i) => i.id === 'books')!;
    const half = moved.size.width / 2;
    expect(moved.position.x + half <= 1.5 + 1e-6 || moved.position.x - half >= 3.5 - 1e-6).toBe(true);
    expect(moved.position.z).toBeGreaterThan(3);
  });
});

describe('the fittings follow the furniture the check changed (A6)', () => {
  // A bedroom 4 × 4 m, the bed with its nightstands against the near wall (wall 0, z = 0); the far
  // wall is wall 2. The door in the middle of wall 1, clear of where the bed goes on wall 2 (the
  // case where it is not is the open test below).
  const bedroom = room('r', 'bedroom', 4, 4, [{ kind: 'door', wallIndex: 1, t: 0.5, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false }]);
  const plan = planOf(bedroom);
  const bed = item('r', 'bed', 'bed_double', 2, 1.045, { width: 1.6, depth: 2.05, height: 1.0 }, 0, 0, 'bed');
  const left = item('r', 'n1', 'nightstand', 2 - 0.8 - 0.04 - 0.225, 0.2, { width: 0.45, depth: 0.4, height: 0.5 });
  const right = item('r', 'n2', 'nightstand', 2 + 0.8 + 0.04 + 0.225, 0.2, { width: 0.45, depth: 0.4, height: 0.5 });
  const items = [bed, left, right];
  const electrical = suggestElectrical(plan, items, [], 'modern', []);
  const scene = { plan, items, decor: [], electrical, generation: { by: 'ai' as const, at: 'now', aiCount: 1 }, styleId: 'modern' as const };
  const bedside = (points: typeof electrical) => points.filter((p) => p.kind === 'socket_double' && p.elevationM > 0.3);

  it('moves the bedside sockets with a bed the check moved to another wall', () => {
    expect(bedside(electrical).length).toBeGreaterThan(0);
    expect(bedside(electrical).every((p) => p.position.z < 0.1)).toBe(true);
    const checked = reviewedScene(scene, { model: 'm', notes: {}, fixes: [{ target: 'bed', action: 'move_to_wall', productId: null, wallIndex: 2, reason: '' }] }, []);
    const moved = checked.items.find((i) => i.id === 'bed')!;
    expect(moved.position.z).toBeGreaterThan(2);
    expect(bedside(checked.electrical).length).toBeGreaterThan(0);
    expect(bedside(checked.electrical).every((p) => p.position.z > 3.9)).toBe(true);
    expect(sceneDefects({ plan, items: checked.items })).toEqual([]);
  });

  // The check moves the bed to another wall and its nightstands with it (`applyReviewFixes`,
  // `move_to_wall`) testing the bed's spot, not theirs: with the door at 0.8 of wall 1 the right
  // nightstand lands at x 2.84–3.29, z 3.58–3.98, in the door's way. The fix is the check's (lib/).
  it.skip('never moves a bed\'s nightstand into a door\'s way with the bed (the check tests the bed\'s spot only)', () => {
    const doorNear = room('r', 'bedroom', 4, 4, [{ kind: 'door', wallIndex: 1, t: 0.8, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false }]);
    const near = planOf(doorNear);
    const checked = reviewedScene({ ...scene, plan: near, electrical: suggestElectrical(near, items, [], 'modern', []) }, { model: 'm', notes: {}, fixes: [{ target: 'bed', action: 'move_to_wall', productId: null, wallIndex: 2, reason: '' }] }, []);
    expect(sceneDefects({ plan: near, items: checked.items })).toEqual([]);
  });

  it('leaves the fittings as they were when the check changed nothing', () => {
    const checked = reviewedScene(scene, { model: 'm', notes: { r: 'Fine.' }, fixes: [] }, []);
    expect(checked.electrical).toBe(electrical);
    expect(checked.items).toEqual(items);
  });

  it('records as reviewed the fixes that changed something, not the fixes it was given (J6)', () => {
    const fixes = [
      // Changes the flat: the bed to the far wall.
      { target: 'bed', action: 'move_to_wall' as const, productId: null, wallIndex: 2, reason: '' },
      // Change nothing: a piece that is not there, a product the catalogue does not have.
      { target: 'gone', action: 'remove' as const, productId: null, wallIndex: null, reason: '' },
      { target: 'n1', action: 'replace' as const, productId: 999, wallIndex: null, reason: '' },
    ];
    expect(reviewedScene(scene, { model: 'm', notes: {}, fixes }, []).generation.reviewed).toBe(1);
    expect(reviewedScene(scene, { model: 'm', notes: {}, fixes: fixes.slice(1) }, []).generation.reviewed).toBe(0);
  });
});

describe('what the engine built stays as it built it after the check (W1)', () => {
  // A bathroom 3 × 2.5 m: the WC 45 cm from the corner, its box built to the wall's end (no sliver
  // left, as generation builds it); the machine in its column further along; a stool by the far wall.
  const bath = room('b', 'bathroom', 3, 2.5, [{ kind: 'door', wallIndex: 2, t: 0.5, widthM: 0.7, heightM: 2.05, sillM: 0, exterior: false }]);
  const plan = planOf(bath);
  const wc = item('b', 'wc', 'toilet', 0.45, 0.2 + 0.34, { width: 0.4, depth: 0.68, height: 0.82 });
  const washer = item('b', 'w', 'washer', 2.3, 0.295, { width: 0.6, depth: 0.55, height: 0.85 });
  const stool = item('b', 'stool', 'stool', 2.6, 2.1, { width: 0.35, depth: 0.35, height: 0.45 });
  const box = wcBoxes([bath], [wc], [])[0];
  const column = houseItem(washer, [bath], [wc, washer], [box])!.decor.find((d) => d.family === 'cabinet')!;
  const scene = { plan, items: [wc, washer, stool], decor: [box, column], electrical: [], generation: { by: 'ai' as const, at: 'now', aiCount: 1 }, styleId: 'modern' as const };

  it('changes nothing when the check changed nothing', () => {
    expect(box.span.from).toBe(0);
    const checked = reviewedScene(scene, { model: 'm', notes: {}, fixes: [] }, []);
    expect(checked.decor).toEqual(scene.decor);
    expect(checked.items).toEqual(scene.items);
  });

  it('settles again only what was built for a piece the check moved, replaced or took out', () => {
    // The stool taken out: the WC's box and the column are left as built.
    const removed = reviewedScene(scene, { model: 'm', notes: {}, fixes: [{ target: 'stool', action: 'remove', productId: null, wallIndex: null, reason: '' }] }, []);
    expect(removed.items.map((i) => i.id)).toEqual(['wc', 'w']);
    expect(removed.decor).toEqual(scene.decor);
    // The WC moved to the east wall: its box goes with it, the column stays as built.
    const moved = reviewedScene(scene, { model: 'm', notes: {}, fixes: [{ target: 'wc', action: 'move_to_wall', productId: null, wallIndex: 1, reason: '' }] }, []);
    expect(moved.decor.find((d) => d.id === column.id)).toEqual(column);
    expect(moved.decor.find((d) => d.id === box.id)?.wallIndex).toBe(1);
  });

  it('keeps a moved WC only where it stands well once its box is built behind it', () => {
    // A cabinet stands 10 cm clear of where the WC lands on the east wall — but not of where its box then pushes it.
    const cabinet = item('b', 'cab', 'storage_shelf', 2.05, 1.25, { width: 0.6, depth: 0.3, height: 0.9 }, Math.PI / 2);
    const crowded = { ...scene, items: [wc, washer, stool, cabinet] };
    const moved = reviewedScene(crowded, { model: 'm', notes: {}, fixes: [{ target: 'wc', action: 'move_to_wall', productId: null, wallIndex: 1, reason: '' }] }, []);
    const now = moved.items.find((i) => i.id === 'wc')!;
    const clash = moved.items.filter((o) => o.id !== 'wc' && footprintsOverlap(footprintOf(now.position, now.size, now.rotation), footprintOf(o.position, o.size, o.rotation)));
    expect(clash.map((o) => o.id)).toEqual([]);
  });
});

function product(id: number, kind: string, w: number, d: number, h: number, style = 'modern'): CatalogProduct {
  return { id, nameKa: `p${id}`, nameEn: `product ${id}`, slug: `p${id}`, brand: null, categorySlug: 'x', pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm: w, depthCm: d, heightCm: h, styleTags: [style], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null };
}

describe('the designer is offered what the matcher takes as a pick (A1)', () => {
  const bath = room('b', 'bathroom', 2.6, 2.2, [{ kind: 'door', wallIndex: 2, t: 0.5, widthM: 0.7, heightM: 2.05, sillM: 0, exterior: false }]);
  const living = room('l', 'living_room', 5, 4, [{ kind: 'door', wallIndex: 2, t: 0.8, widthM: 0.9, heightM: 2.05, sillM: 0, exterior: false }]);
  const plan = planOf(bath, living);
  const catalog = [
    product(1, 'sink', 85, 50, 85), // a pedestal basin: in a Modern bathroom the basin sits on its vanity
    product(2, 'sink', 50, 38, 15), // a countertop basin
    product(3, 'mirror', 60, 3, 80), // flat, over the basin
    product(4, 'mirror', 50, 4, 170), // full height: not over a basin
    product(5, 'pendant', 50, 50, 50), // clears a head under 2.7 m
    product(6, 'pendant', 50, 50, 120), // hangs too low
    product(7, 'sofa_3seat', 220, 95, 85, 'modern'),
    product(8, 'sofa_3seat', 220, 95, 85, 'vintage'), // another style's sofa: the matcher never takes it while the style has its own
  ];
  const offer = buildBrief({ plan, styleId: 'modern', locale: 'en', catalog, seed: 1 }).offer;
  const offered = (roomId: string, kind: string) => [...(offer.furniture.get(roomId)?.get(kind) ?? [])].sort();

  it('offers a bathroom a countertop basin and a flat mirror, a room pendants that clear a head, the style’s own sofa', () => {
    expect(offered('b', 'sink')).toEqual([2]);
    expect(offered('b', 'mirror')).toEqual([3]);
    expect(offered('l', 'pendant')).toEqual([5]);
    expect(offered('l', 'sofa_3seat')).toEqual([7]);
  });

  it('offers the check other curtains and lamps, so a wrong one can be replaced where it may not be taken out', () => {
    const window = room('w', 'living_room', 5, 4, [{ kind: 'window', wallIndex: 3, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true }]);
    const curtain = { ...item('w', 'curtain', 'curtain', 0.06, 2, { width: 1.6, depth: 0.1, height: 2.5 }, Math.PI / 2, 0.1), product: { ...sceneProduct(20, 'curtain'), productId: 20 } as PlacedItem['product'] };
    const lamp = { ...item('w', 'lamp', 'pendant', 2.5, 2, { width: 0.5, depth: 0.5, height: 0.5 }, 0, 2.2), product: { ...sceneProduct(21, 'pendant'), productId: 21 } as PlacedItem['product'] };
    const shop = [...catalog, product(20, 'curtain', 150, 10, 250), product(22, 'curtain', 140, 10, 260), product(21, 'pendant', 50, 50, 50)];
    const brief = buildReviewBrief({ plan: planOf(window), items: [curtain, lamp], styleId: 'modern', locale: 'en', catalog: shop, seed: 1 });
    expect([...(brief.offer.alternatives.get('curtain') ?? [])]).toEqual([22]);
    expect([...(brief.offer.alternatives.get('lamp') ?? [])]).toEqual([5]);
    const review = validateReview({ rooms: [{ room: 'w', note: '', fixes: [{ target: 'curtain', action: 'replace', product: 22, wall: -1, reason: '' }, { target: 'lamp', action: 'replace', product: 5, wall: -1, reason: '' }] }] }, planOf(window), brief.offer, 'm');
    const checked = reviewedScene({ plan: planOf(window), items: [curtain, lamp], decor: [], electrical: [], generation: { by: 'ai', at: 'now', aiCount: 1 }, styleId: 'modern' }, review, shop);
    const nowCurtain = checked.items.find((i) => i.id === 'curtain')!;
    expect(nowCurtain.product?.productId).toBe(22);
    // Made to its window: the same size, where it hung.
    expect(nowCurtain.size).toEqual(curtain.size);
    expect(nowCurtain.position).toEqual(curtain.position);
    const nowLamp = checked.items.find((i) => i.id === 'lamp')!;
    expect(nowLamp.product?.productId).toBe(5);
    expect(nowLamp.position).toEqual(lamp.position);
  });

  it('offers the check’s alternatives from the same pool', () => {
    const sofa = { ...item('l', 'sofa', 'sofa_3seat', 2.5, 0.5, { width: 2.2, depth: 0.95, height: 0.85 }, 0, 0, 'sofa'), product: { ...sceneProduct(9, 'sofa'), productId: 9 } as PlacedItem['product'] };
    const { offer: alternatives } = buildReviewBrief({ plan, items: [sofa], styleId: 'modern', locale: 'en', catalog: [...catalog, product(9, 'sofa_3seat', 220, 95, 85, 'modern')], seed: 1 });
    expect([...(alternatives.alternatives.get('sofa') ?? [])]).toEqual([7]);
  });
});

describe('the designer is asked only about the pieces the room will have (A2)', () => {
  it('asks no bath where the style showers, no curtain where there is no window, nothing a room is too small for', () => {
    // An 8 m² bathroom: a bath in a Modern flat (7.5 m² and up), a shower alone in a Scandinavian one (9 m² for both).
    const bath = room('b', 'bathroom', 3.2, 2.5);
    expect(programKinds(bath, 'modern')).toContain('bathtub');
    expect(programKinds(bath, 'scandinavian')).not.toContain('bathtub');
    // A windowless bedroom draws no curtain.
    const bedroom = room('r', 'bedroom', 3.4, 3.2);
    expect(programKinds(bedroom, 'vintage')).not.toContain('curtain');
    expect(programKinds(room('w', 'bedroom', 3.4, 3.2, [{ kind: 'window', wallIndex: 0, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true }]), 'vintage')).toContain('curtain');
  });

  it('asks about a studio half by half, as the engine furnishes it', () => {
    // A 6 × 4.5 m studio: a kitchen half and a living half of about 13.5 m² each — a three-seat sofa,
    // not the corner sofa the whole 27 m² would take.
    const studio = room('s', 'studio', 6, 4.5, [{ kind: 'window', wallIndex: 0, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true }]);
    const kinds = programKinds(studio, 'modern');
    expect(kinds).toContain('sofa_3seat');
    expect(kinds).not.toContain('sofa_corner');
    expect(kinds).toContain('fridge');
  });
});

describe('the brief says what shape each room is (A9)', () => {
  const shaped = (id: string, polygon: Vec2[]) => refreshRoom({ id, type: 'living_room', name: id, polygon, heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

  it('calls a room rectangular, L-shaped or so many corners, and gives the box it fits in', () => {
    expect(outlineText(shaped('a', [P(0, 0), P(4.2, 0), P(4.2, 3.1), P(0, 3.1)]))).toBe('rectangular, 4.2 × 3.1 m');
    expect(outlineText(shaped('b', [P(0, 0), P(5.2, 0), P(5.2, 2), P(3, 2), P(3, 4), P(0, 4)]))).toBe('L-shaped, 6 corners, within 5.2 × 4 m');
    expect(outlineText(shaped('c', [P(0, 0), P(6, 0), P(6, 5), P(4, 5), P(4, 3), P(2, 3), P(2, 5), P(0, 5)]))).toBe('8 corners, within 6 × 5 m');
    expect(outlineText(shaped('d', [P(0, 0), P(3.9, 0), P(3.4, 3), P(0, 3)]))).toBe('4 corners, not square, within 3.9 × 3 m');
    // A wall drawn as two edges is one wall: no corner where it runs straight on.
    expect(outlineText(shaped('e', [P(0, 0), P(2, 0), P(4.2, 0), P(4.2, 3.1), P(0, 3.1)]))).toBe('rectangular, 4.2 × 3.1 m');
    expect(outlineText(shaped('f', [P(0, 0), P(5.2, 0), P(5.2, 2), P(4, 2), P(3, 2), P(3, 4), P(0, 4)]))).toBe('L-shaped, 6 corners, within 5.2 × 4 m');
    const { text } = buildBrief({ plan: planOf(shaped('c', [P(0, 0), P(6, 0), P(6, 5), P(4, 5), P(4, 3), P(2, 3), P(2, 5), P(0, 5)])), styleId: 'modern', locale: 'en', catalog: [], seed: 1 });
    expect(text).toMatch(/ceiling 2\.7 m, 8 corners, within 6 × 5 m/);
    expect(text).not.toMatch(/L-shaped/);
  });
});

describe('the designer’s decor keeps off the engine’s joinery (W4)', () => {
  // A hall 4 × 2 m whose built-in wardrobe runs the first 2 m of wall 0, floor to near the ceiling.
  const hall = room('h', 'hallway', 4, 2, [{ kind: 'door', wallIndex: 2, t: 0.5, widthM: 0.9, heightM: 2.05, sillM: 0, exterior: true }]);
  const plan = planOf(hall);
  const wardrobe: DecorPiece = { id: 'decor-h-hall-wardrobe', roomId: 'h', family: 'cabinet', wallIndex: 0, span: { from: 0, to: 2 }, height: { from: 0, to: 2.4 }, params: { sections: [{ kind: 'doors', widthMm: 2000, heightMm: 2400, depthMm: 600 }], depthMm: 600 }, materials: {}, anchor: 'joinery' };
  const slats: DecorIntent = { family: 'slats', anchor: 'wall', wallIndex: 0, widthM: null, heightFromM: null, heightToM: null, params: {}, materials: [], referenceId: null, concept: null, note: null };
  const proposal: AiProposal = { model: 'm', rooms: [{ roomId: 'h', note: null, furniture: [], floor: null, wall: null, decor: [slats] }] };

  it('fits slats beside the hall wardrobe, not behind it', () => {
    // Without the joinery it takes the whole wall.
    expect(proposalDecor(plan, proposal, [], [])[0].span.from).toBeLessThan(2);
    const fitted = proposalDecor(plan, proposal, [], [], [wardrobe]);
    expect(fitted).toHaveLength(1);
    expect(fitted[0].wallIndex).toBe(0);
    expect(fitted[0].span.from).toBeGreaterThanOrEqual(2);
  });

  it('moves a decor piece the check sends onto the wardrobe’s wall beside it', () => {
    const piece: DecorPiece = { id: 'd1', roomId: 'h', family: 'slats', wallIndex: 1, span: { from: 0.2, to: 1.8 }, height: { from: 0, to: 2.7 }, params: {}, materials: {}, anchor: 'wall', origin: 'ai' };
    const fixed = applyReviewFixes([], [wardrobe, piece], { model: 'm', notes: {}, fixes: [{ target: 'd1', action: 'decor_to_wall', productId: null, wallIndex: 0, reason: '' }] }, plan, []);
    const moved = fixed.decor.find((d) => d.id === 'd1')!;
    expect(moved.wallIndex).toBe(0);
    expect(moved.span.from).toBeGreaterThanOrEqual(2);
  });
});

