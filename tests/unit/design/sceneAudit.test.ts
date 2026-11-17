import { describe, expect, it } from 'vitest';
import { refreshRoom } from '@/lib/design/planGeometry';
import { auditScene, issueMetric, tallyIssues } from '@/lib/design/sceneAudit';
import type { DecorPiece, ElectricalPoint, FloorPlan, Opening, PlacedItem, PlanRoom, SlotKind, TechnicalPoint } from '@/lib/design/types';

/** A room `w` × `d` with its corner at the origin: wall 0 runs along z = 0 and faces +z. */
const rect = (id: string, type: PlanRoom['type'], w: number, d: number, patch: Partial<PlanRoom> = {}): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [], ...patch });
const flat = (rooms: PlanRoom[], points: TechnicalPoint[] = []): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 10, depth: 10 }, source: 'manual', wallThicknessM: 0.2, technical: { points } });
/** A piece `w` × `d` × `h` with its back on wall 0, its middle `x` along it — or anywhere, with `z`. */
const piece = (id: string, slot: SlotKind, roomId: string, x: number, size: [number, number, number], patch: Partial<PlacedItem> = {}): PlacedItem => ({
  id,
  roomId,
  slot,
  kind: slot,
  position: { x, z: size[1] / 2 },
  elevationM: 0,
  rotation: 0,
  size: { width: size[0], depth: size[1], height: size[2] },
  product: null,
  ...patch,
});
const door = (roomId: string, t: number): Opening => ({ id: `door-${roomId}`, kind: 'door', wallIndex: 0, t, widthM: 0.9, heightM: 2.1, sillM: 0, roomId, exterior: false });
const cabinet = (id: string, roomId: string, from: number, widthMm: number, itemId?: string): DecorPiece => ({
  id,
  roomId,
  family: 'cabinet',
  wallIndex: 0,
  span: { from, to: from + widthMm / 1000 },
  height: { from: 0, to: 0.85 },
  params: { sections: [{ kind: 'basin', widthMm, heightMm: 850, depthMm: 500, itemId }] },
  materials: {},
  itemId: itemId ?? null,
});
const metrics = (scene: Parameters<typeof auditScene>[0]) => Object.keys(tallyIssues(auditScene(scene))).sort();

describe('the whole-flat check', () => {
  it('lists what a room ends without, and a flat with a bathroom and no washing machine', () => {
    const found = metrics({ plan: flat([rect('b', 'bathroom', 3, 2.5)]), items: [piece('wc', 'toilet', 'b', 1.5, [0.4, 0.7, 0.8])] });
    expect(found).toEqual(['missing:bathroom:mirror', 'missing:bathroom:shower/bathtub', 'missing:bathroom:sink', 'missing:flat:washer']);
  });

  it('counts a built wall of wardrobe as the bedroom’s wardrobe', () => {
    const bedroom = rect('r', 'bedroom', 4, 4);
    const items = [piece('bed', 'bed', 'r', 2, [1.6, 2, 0.9]), piece('n', 'nightstand', 'r', 0.5, [0.45, 0.4, 0.5])];
    expect(metrics({ plan: flat([bedroom]), items })).toEqual(['missing:bedroom:wardrobe']);
    const wall: DecorPiece = { ...cabinet('decor-r-wardrobe-wall', 'r', 0, 600), wallIndex: 2 };
    expect(metrics({ plan: flat([bedroom]), items, decor: [wall] })).toEqual([]);
  });

  it('finds what is arranged off a piece the room does not have', () => {
    const living = rect('l', 'living_room', 5, 5);
    const table = piece('t', 'coffee_table', 'l', 2.5, [1, 0.6, 0.4], { position: { x: 2.5, z: 2.5 } });
    const rug = piece('rug', 'rug', 'l', 2.5, [2, 3, 0.02], { position: { x: 2.5, z: 2.5 } });
    const orphans = (plan: FloorPlan, items: PlacedItem[]) => auditScene({ plan, items }).filter((i) => i.code === 'orphan').map(issueMetric);
    // The coffee table is left over from a sofa; the rug lies under the coffee table that is there.
    expect(orphans(flat([living]), [table, rug])).toEqual(['orphan:coffee_table:no_sofa']);
    const sofa = piece('s', 'sofa', 'l', 2.5, [2.2, 0.9, 0.8]);
    expect(orphans(flat([living]), [sofa, table, rug])).toEqual([]);
    // Once for the two nightstands of a bed that is gone; a TV with no unit; a unit with no TV.
    const bedroom = rect('r', 'bedroom', 4, 4);
    const nightstands = [piece('n1', 'nightstand', 'r', 0.5, [0.45, 0.4, 0.5]), piece('n2', 'nightstand', 'r', 3.5, [0.45, 0.4, 0.5])];
    expect(orphans(flat([bedroom]), nightstands)).toEqual(['orphan:nightstand:no_bed']);
    const unit = piece('u', 'tv_unit', 'l', 2.5, [1.8, 0.4, 0.5]);
    const tv = piece('tv', 'tv', 'l', 2.5, [1.4, 0.08, 0.8], { elevationM: 0.65 });
    expect(orphans(flat([living]), [sofa, tv])).toEqual(['orphan:tv:no_tv_unit']);
    expect(orphans(flat([living]), [sofa, unit])).toEqual(['orphan:tv_unit:no_tv']);
    // A bathroom's mirror hangs over its basin and nowhere else; a hall's takes any wall.
    const mirror = (roomId: string) => piece('m', 'mirror', roomId, 1.5, [0.6, 0.05, 0.8], { elevationM: 1.1 });
    expect(orphans(flat([rect('b', 'bathroom', 3, 2.5)]), [mirror('b')])).toEqual(['orphan:mirror:no_sink']);
    expect(orphans(flat([rect('h', 'hallway', 3, 2.5)]), [mirror('h')])).toEqual([]);
  });

  it('does not take for an orphan what the engine stands on its own when the other piece was never laid', () => {
    const orphans = (room: PlanRoom, items: PlacedItem[]) => auditScene({ plan: flat([room]), items }).filter((i) => i.code === 'orphan');
    // A fridge and wall cabinets in a kitchen with no run: a missing run.
    const kitchen = rect('k', 'kitchen', 4, 3);
    expect(orphans(kitchen, [piece('f', 'fridge', 'k', 0.4, [0.7, 0.7, 1.9]), piece('w', 'kitchen_wall', 'k', 2, [2, 0.35, 0.7], { elevationM: 1.45 })])).toEqual([]);
    // A print hangs on a wall of a living room with no sofa; an office's rug lies under its desk.
    const living = rect('l', 'living_room', 5, 5);
    const rug = piece('rug', 'rug', 'l', 2.5, [2, 3, 0.02], { position: { x: 2.5, z: 2.5 } });
    expect(orphans(living, [piece('a', 'artwork', 'l', 2.5, [0.9, 0.05, 0.7], { elevationM: 1.2 })])).toEqual([]);
    expect(orphans(rect('o', 'office', 4, 4), [{ ...rug, roomId: 'o' }, piece('d', 'desk', 'o', 2, [1.4, 0.7, 0.75])])).toEqual([]);
    // A rug in a living room with neither a coffee table nor a sofa lies under nothing it belongs to.
    expect(orphans(living, [rug, piece('b', 'bookshelf', 'l', 2.5, [1, 0.35, 2])]).map((i) => i.key)).toEqual(['rug:no_coffee_table']);
    // …and one under the coffee table's place of a room whose sofa stands is no orphan.
    expect(orphans(living, [rug, piece('s', 'sofa', 'l', 2.5, [2.2, 0.9, 0.8])])).toEqual([]);
  });

  it('tells a TV unit on a wall from one on a room separator’s line and one standing free', () => {
    const unit = piece('tv', 'tv_unit', 'l', 2.5, [1.8, 0.4, 0.5]);
    const codes = (room: PlanRoom, item: PlacedItem) => auditScene({ plan: flat([room]), items: [item] }).map((i) => i.code).filter((c) => c === 'on_open_line' || c === 'tv_unit_off_wall');
    expect(codes(rect('l', 'living_room', 5, 5), unit)).toEqual([]);
    expect(codes(rect('l', 'living_room', 5, 5, { open: [0] }), unit)).toEqual(['on_open_line']);
    expect(codes(rect('l', 'living_room', 5, 5), { ...unit, position: { x: 2.5, z: 2.5 } })).toEqual(['tv_unit_off_wall']);
  });

  it('reads a shower by its tray, not by the column at its back', () => {
    const bath = rect('b', 'bathroom', 3, 2.5);
    // The column is 50 × 20 cm in the corner; the tray is 90 × 90 cm in front of it.
    const shower = piece('sh', 'shower', 'b', 0.45, [0.5, 0.2, 2], { areaM: { width: 0.9, depth: 0.9 } });
    const washer = piece('w', 'washer', 'b', 0.6, [0.6, 0.6, 0.85], { position: { x: 0.6, z: 0.6 } });
    const beside = piece('w', 'washer', 'b', 1.25, [0.6, 0.6, 0.85]);
    const codes = (items: PlacedItem[], decor: DecorPiece[] = []) => auditScene({ plan: flat([bath]), items, decor }).map((i) => i.code).filter((c) => c === 'in_shower_tray' || c === 'joinery_in_tray');
    expect(codes([shower, washer])).toEqual(['in_shower_tray']);
    expect(codes([shower, beside])).toEqual([]);
    expect(codes([shower], [cabinet('decor-b-vanity', 'b', 0.5, 800)])).toEqual(['joinery_in_tray']);
    expect(codes([shower], [cabinet('decor-b-vanity', 'b', 0.95, 800)])).toEqual([]);
  });

  it('finds a basin lifted to washing height with nothing built under it', () => {
    const bath = rect('b', 'bathroom', 3, 2.5);
    const basin = piece('sink', 'sink', 'b', 1.5, [0.6, 0.45, 0.15], { elevationM: 0.7 });
    const inAir = (decor: DecorPiece[]) => auditScene({ plan: flat([bath]), items: [basin], decor }).filter((i) => i.code === 'basin_in_air').length;
    expect(inAir([])).toBe(1);
    expect(inAir([cabinet('decor-b-vanity', 'b', 1.1, 800, 'sink')])).toBe(0);
    // A basin that stands on the floor needs nothing under it.
    expect(auditScene({ plan: flat([bath]), items: [{ ...basin, elevationM: 0, size: { ...basin.size, height: 0.85 } }] }).filter((i) => i.code === 'basin_in_air')).toEqual([]);
  });

  it('finds a piece in a door’s way, and one standing in joinery that was not built for it', () => {
    const hall = rect('h', 'hallway', 3, 3, { openings: [door('h', 0.5)] });
    const console = piece('c', 'console', 'h', 1.5, [1, 0.35, 0.8], { position: { x: 1.5, z: 0.5 } });
    expect(auditScene({ plan: flat([hall]), items: [console] }).map((i) => i.code)).toContain('door_zone');
    expect(auditScene({ plan: flat([hall]), items: [{ ...console, position: { x: 1.5, z: 2.5 } }] }).map((i) => i.code)).not.toContain('door_zone');
    const bath = rect('b', 'bathroom', 3, 2.5);
    const washer = piece('w', 'washer', 'b', 1.5, [0.6, 0.6, 0.85]);
    const vanity = (itemId?: string) => cabinet('decor-b-vanity', 'b', 1.1, 800, itemId);
    expect(auditScene({ plan: flat([bath]), items: [washer], decor: [vanity()] }).map((i) => i.code)).toContain('in_joinery');
    expect(auditScene({ plan: flat([bath]), items: [washer], decor: [vanity('w')] }).map((i) => i.code)).not.toContain('in_joinery');
  });

  it('finds a mirror hung into the console under it, and two main lights at one spot', () => {
    const hall = rect('h', 'hallway', 3, 3);
    const console = piece('c', 'console', 'h', 1.5, [1, 0.35, 0.8]);
    const mirror = piece('m', 'mirror', 'h', 1.5, [0.6, 0.04, 1.6], { elevationM: 0.3 });
    expect(auditScene({ plan: flat([hall]), items: [console, mirror] }).filter((i) => i.code === 'hung_into_floor').map((i) => i.what)).toEqual(['mirror into console']);
    expect(auditScene({ plan: flat([hall]), items: [console, { ...mirror, elevationM: 0.95 }] }).filter((i) => i.code === 'hung_into_floor')).toEqual([]);
    const pendant = piece('p', 'pendant', 'h', 1.5, [0.4, 0.4, 0.5], { position: { x: 1.5, z: 1.5 }, elevationM: 2.2 });
    // A second lamp is a ceiling point that is bought: one with a product of its own at the hanging lamp's spot.
    const bought = { productId: 7, nameKa: 'lamp', slug: 'lamp', brand: null, pricePerUnit: 90, unit: 'piece', qty: 1, totalPrice: 90, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/models/fixtures/lamp.glb', categorySlug: 'lighting', store: null };
    const light: ElectricalPoint = { id: 'e1', roomId: 'h', kind: 'light_ceiling', position: { x: 1.5, z: 1.5 }, elevationM: 2.7, product: bought };
    expect(auditScene({ plan: flat([hall]), items: [pendant], electrical: [light] }).map((i) => i.code)).toContain('two_main_lights');
    expect(auditScene({ plan: flat([hall]), items: [pendant], electrical: [{ ...light, position: { x: 0.5, z: 0.5 } }] }).map((i) => i.code)).not.toContain('two_main_lights');
    // The lamp's own outlet — a point with no product, made the outlet of the lamp hanging at it — is the same light.
    const outlet: ElectricalPoint = { id: 'e2', roomId: 'h', kind: 'light_ceiling', position: { x: 1.5, z: 1.5 }, elevationM: 2.7, lampOutlet: true };
    expect(auditScene({ plan: flat([hall]), items: [pendant], electrical: [outlet] }).map((i) => i.code)).not.toContain('two_main_lights');
    // A ceiling point there that is not the lamp's outlet is a second light, bought yet or not: the lighting plan lists both.
    const { lampOutlet: _outlet, ...bare } = outlet;
    expect(auditScene({ plan: flat([hall]), items: [pendant], electrical: [bare] }).map((i) => i.code)).toContain('two_main_lights');
  });

  it('finds a socket inside a radiator’s body', () => {
    const room = rect('r', 'bedroom', 4, 4);
    const radiator: TechnicalPoint = { id: 'rad', kind: 'radiator', roomId: 'r', position: { x: 2, z: 0.05 }, sections: 10, origin: 'user' };
    const socket = (t: number, elevationM = 0.3): ElectricalPoint => ({ id: `s${t}`, roomId: 'r', kind: 'socket', position: { x: 4 * t, z: 0 }, elevationM, wallIndex: 0, t });
    const inRadiator = (points: ElectricalPoint[]) => auditScene({ plan: flat([room], [radiator]), items: [], electrical: points }).filter((i) => i.code === 'socket_in_radiator').map((i) => i.itemId);
    // Ten sections of 8 cm: the radiator runs 1.6–2.4 m along the wall.
    expect(inRadiator([socket(0.5), socket(0.58), socket(0.75)])).toEqual(['s0.5', 's0.58']);
    // A socket over it, at worktop height, is not in it.
    expect(inRadiator([socket(0.5, 1.1)])).toEqual([]);
  });
});
