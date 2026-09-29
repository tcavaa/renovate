import { describe, expect, it } from 'vitest';
import { calculationCost, calculatorSheet, furnitureTicks, placedQuantity, boardWithPicks, type CalculationInput } from '@/lib/summary/calculatorSheet';
import { calculatorRoomsFromPlan, deriveOpenings } from '@/lib/design/planGeometry';
import { rebuildRooms } from '@/lib/design/walls';
import { suggestTechnical } from '@/lib/design/autoTechnical';
import { suggestRadiators } from '@/lib/design/radiators';
import { standardElectrical } from '@/lib/design/electrical';
import { priceScene } from '@/lib/design/pricing';
import { applyBoardPicks, applyFinishPicks, picksFromCalculator } from '@/lib/design/fromCalculator';
import { catalogProductFromPick } from '@/lib/calculator/roomFinishes';
import { CONTINGENCY_PCT } from '@/lib/calculator/constants';
import { tickFor } from '@/lib/design/ticks';
import type { SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan, SceneStore, Vec2, Wall } from '@/lib/design/types';

/**
 * The calculator's sheet is priced by the design's own function (`priceScene`): a calculation
 * and a design of the same flat, with the same products, come to the same sheet.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ id, a, b, thicknessM: 0.12, origin: 'existing' });
const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.7, walls: [] };

/** A living room and a bathroom side by side (5 × 4 and 3 × 4), their doors and windows as the parser would infer them. */
function drawnFlat(): FloorPlan {
  const drawn = rebuildRooms(base, [wall('top', P(0, 0), P(8, 0)), wall('right', P(8, 0), P(8, 4)), wall('bottom', P(8, 4), P(0, 4)), wall('left', P(0, 4), P(0, 0)), wall('mid', P(5, 0), P(5, 4))]);
  const rooms = drawn.rooms.map((r) => {
    const living = r.polygon.some((p) => p.x < 1);
    return { ...r, id: living ? 'liv' : 'bath', type: living ? ('living_room' as const) : ('bathroom' as const), name: living ? 'მისაღები' : 'აბაზანა', heightM: 2.7 };
  });
  deriveOpenings(rooms, 0.12);
  return { ...drawn, rooms };
}

/** The flat with its technical part placed by the standards, as "place automatically" does. */
function standardFlat(): { plan: FloorPlan; electrical: ReturnType<typeof standardElectrical> } {
  let n = 0;
  const nextId = () => `t${n++}`;
  const drawn = drawnFlat();
  const points = suggestTechnical(drawn, [], nextId).points;
  let plan: FloorPlan = { ...drawn, technical: { points } };
  plan = { ...plan, technical: { points: [...points, ...suggestRadiators(plan, nextId)] } };
  return { plan, electrical: standardElectrical(plan) };
}

const store: SceneStore = { id: 5, nameKa: 'Domus', logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: 40 };
const pick = (productId: number, price: number, extra: Partial<SelectedProduct> = {}): SelectedProduct => ({ productId, nameKa: `p${productId}`, pricePerUnit: price, unit: 'piece', qty: 1, totalPrice: price, imageUrl: null, ...extra });

const finish = (surfaces: string[]) => ({ textureUrl: '/textures/t.jpg', specs: { surfaces } });
const laminate = pick(1, 40, { unit: 'm2', categorySlug: 'laminate', roomId: 'liv', surface: 'floor', ...finish(['floor']) });
const paint = pick(2, 60, { unit: 'liter', categorySlug: 'paint', coveragePerUnit: 10, roomId: 'liv', surface: 'wall', ...finish(['wall']) });
const floorTile = pick(3, 55, { unit: 'm2', categorySlug: 'floor-tiles', roomId: 'bath', surface: 'floor', ...finish(['floor']) });
const wallTile = pick(4, 45, { unit: 'm2', categorySlug: 'wall-tiles', roomId: 'bath', surface: 'wall', ...finish(['wall']) });
const door = pick(10, 480, { categorySlug: 'doors', model3dKind: 'door' });
const entrance = pick(11, 1350, { categorySlug: 'doors', model3dKind: 'entrance_door' });
const window_ = pick(12, 430, { categorySlug: 'windows', model3dKind: 'window' });
const socket = pick(13, 18, { categorySlug: 'sockets-switches', model3dKind: 'socket' });
const radiator = pick(14, 32, { categorySlug: 'radiators', model3dKind: 'radiator', specs: { wattsPerSection: 150 } });
const skirting = pick(15, 9, { unit: 'linear_m', categorySlug: 'skirting' });
const basin = pick(16, 540, { categorySlug: 'sanitary', model3dKind: 'sink' });

const finishes = { 'laminate_room:liv': laminate, 'paint_room:liv': paint, 'floor-tiles_room:bath': floorTile, 'wall-tiles_room:bath': wallTile };
const wholeFlat = { doors_global: door, 'entrance-doors_global': entrance, windows_global: window_, 'sockets-switches_global': socket, radiators_global: radiator, skirting_global: skirting };

function input(extra: Partial<CalculationInput> = {}): CalculationInput {
  const { plan, electrical } = standardFlat();
  return {
    rooms: calculatorRoomsFromPlan(plan),
    homeState: 'white_frame',
    picks: { selectedProducts: { ...finishes, ...wholeFlat, sanitary_global: basin }, selectedFurniture: { liv: [pick(7, 2450), pick(7, 2450), pick(8, 300)] } },
    board: plan,
    electrical,
    storeOf: (id) => (id === 7 || id === 10 ? store : null),
    ...extra,
  };
}

describe('a calculation is priced as a design', () => {
  it('comes to the same sheet as a design of the same flat with the same products — furniture aside', () => {
    const calculation = input({ picks: { selectedProducts: { ...finishes, ...wholeFlat }, selectedFurniture: {} } });
    const cost = calculationCost(calculation);
    // The design the calculator hands over: its board dressed in the picks — with no shops, which
    // a calculator pick does not record (`handOffToDesign`) — then, as the flat is laid out, the
    // picks put on it again as the catalogue's products (`applyBoardPicks`), and each room's floor
    // and walls laid by the design's own `applyFinishPicks` from the picks as they travel.
    const handed = boardWithPicks(calculation.board!, calculation.electrical!, calculation.picks.selectedProducts);
    expect(handed.plan.rooms.flatMap((r) => r.openings).find((o) => o.product?.productId === 10)?.product?.store).toBeNull();
    const catalog = Object.values(calculation.picks.selectedProducts).map((p) => ({ ...catalogProductFromPick(p), store: calculation.storeOf!(p.productId) ?? null }));
    const picks = picksFromCalculator(calculation.picks.selectedProducts, {});
    const dressed = applyBoardPicks(handed.plan, handed.electrical, picks, catalog);
    // The door is the shop's again, so it is ordered from that shop and counted in its basket.
    const doors = dressed.plan.rooms.flatMap((r) => r.openings).filter((o) => o.kind === 'door' && !o.exterior);
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((o) => o.product?.productId === 10 && o.product.store?.id === 5)).toBe(true);
    const designFinishes = applyFinishPicks([], dressed.plan, picks, catalog);
    const scene: DesignScene = { styleId: 'modern', mode: 'full', budgetGel: null, items: [], finishes: designFinishes, electrical: dressed.electrical };
    const design = priceScene(dressed.plan, scene, { homeState: 'white_frame' });
    expect(design.lines.some((l) => l.section === 'delivery')).toBe(true);
    expect(cost.grandTotal).toBe(design.grandTotal);
    expect(cost.contingencyTotal).toBe(design.contingencyTotal);
    const shape = (lines: typeof cost.lines) => lines.map((l) => `${l.section}|${l.key}|${l.qty}|${l.unitPrice}|${l.total}`).sort();
    expect(shape(cost.lines)).toEqual(shape(design.lines));
  });

  it('puts a product picked for the whole flat on every one of its kind on the board', () => {
    const { plan, electrical } = standardFlat();
    const dressed = boardWithPicks(plan, electrical, wholeFlat);
    const openings = dressed.plan.rooms.flatMap((r) => r.openings);
    expect(openings.filter((o) => o.kind === 'door' && !o.exterior).every((o) => o.product?.productId === 10)).toBe(true);
    expect(openings.filter((o) => o.kind === 'door' && o.exterior).every((o) => o.product?.productId === 11)).toBe(true);
    expect(openings.filter((o) => o.kind === 'window').every((o) => o.product?.productId === 12)).toBe(true);
    // One interior door is two halves and one door.
    expect(dressed.placed.doors_global).toBe(1);
    const radiators = (dressed.plan.technical?.points ?? []).filter((p) => p.kind === 'radiator');
    expect(radiators.length).toBeGreaterThan(0);
    expect(radiators.every((p) => p.product?.productId === 14 && (p.product?.qty ?? 0) >= 4)).toBe(true);
    expect(dressed.electrical.filter((p) => p.kind === 'socket').every((p) => p.product?.productId === 13)).toBe(true);
    expect(dressed.trims).toHaveLength(plan.rooms.length);
    // Bought for what it goes on: a radiator by its sections, a moulding by the metre.
    expect(placedQuantity(plan, electrical, 'radiators_global', radiator)).toBe(radiators.reduce((s, p) => s + (p.product?.qty ?? 0), 0));
    expect(placedQuantity(plan, electrical, 'skirting_global', skirting)).toBeGreaterThan(10);
    expect(placedQuantity(plan, electrical, 'sanitary_global', basin)).toBeNull();
  });

  it('prices what the board has no place for as the calculator’s own lines, under the shop that sells it', () => {
    const sheet = calculatorSheet(input());
    const basinLine = sheet.lines.find((l) => l.tick === tickFor.pick('sanitary_global'))!;
    expect(basinLine).toMatchObject({ section: 'products', bucket: 'products', total: 540 });
    // A door on the board is the door's product line, not a pick line.
    expect(sheet.lines.find((l) => l.tick === tickFor.pick('doors_global'))).toBeUndefined();
    expect(sheet.lines.find((l) => l.tick === tickFor.opening(10))?.product?.store?.id).toBe(5);
    // The same bed picked twice for one room is two lines with two keys.
    expect(furnitureTicks(input().picks.selectedFurniture).map((f) => f.tick)).toEqual([tickFor.furniture('liv', 7, 0), tickFor.furniture('liv', 7, 1), tickFor.furniture('liv', 8, 0)]);
    expect(sheet.lines.filter((l) => l.bucket === 'furniture')).toHaveLength(3);
    // Every line keyed once, and the four subtotals come to the sheet's total.
    const ticks = sheet.lines.filter((l) => l.section !== 'delivery').map((l) => l.tick);
    expect(ticks.every(Boolean)).toBe(true);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(sheet.subtotalMaterials + sheet.subtotalProducts + sheet.subtotalFurniture + sheet.subtotalWorkers).toBeCloseTo(sheet.grandTotal, 1);
  });

  it('sets a renovation’s contingency at 15% of its materials and labour — never of what is bought', () => {
    const sheet = calculatorSheet(input());
    const works = sheet.lines.filter((l) => !l.excluded && (l.section === 'materials' || l.section === 'labour')).reduce((s, l) => s + l.total, 0);
    expect(sheet.contingency).toBeCloseTo((works * CONTINGENCY_PCT) / 100, 2);
    expect(sheet.grandTotalWithMargin).toBeCloseTo(sheet.grandTotal + sheet.contingency, 2);
    // More furniture, the same contingency.
    const more = calculatorSheet(input({ picks: { ...input().picks, selectedFurniture: { liv: [pick(7, 2450), pick(9, 9000)] } } }));
    expect(more.contingency).toBe(sheet.contingency);
  });

  it('counts what the board cannot say from the rooms: a door a room, the points by room type', () => {
    const bare = drawnFlat();
    const noDoorways: FloorPlan = { ...bare, rooms: bare.rooms.map((r) => ({ ...r, openings: [] })) };
    const cost = calculationCost({ ...input(), board: noDoorways, electrical: [], picks: { selectedProducts: {}, selectedFurniture: {} } });
    expect(cost.lines.find((l) => l.key === 'door_install')?.qty).toBe(2);
    // No point placed: the electrician's points are the room types' usual count.
    expect(cost.lines.find((l) => l.key === 'electric_point')?.qty).toBeGreaterThan(0);
    // With the standards placed, the doors and points are the board's.
    const placed = calculationCost({ ...input(), picks: { selectedProducts: {}, selectedFurniture: {} } });
    const { plan, electrical } = standardFlat();
    const doors = plan.rooms.reduce((n, r) => n + r.openings.filter((o) => o.kind === 'door' && (!o.connectsToRoomId || r.id < o.connectsToRoomId)).length, 0);
    expect(placed.lines.find((l) => l.key === 'door_install')?.qty).toBe(doors);
    expect(placed.lines.find((l) => l.key === 'electric_point')?.qty).toBeGreaterThanOrEqual(electrical.length);
  });

  it('takes any kind of line out — a material, a labour line, one of two beds — and keeps the original beside', () => {
    const plain = calculatorSheet(input());
    const material = plain.lines.find((l) => l.section === 'materials')!;
    const labour = plain.lines.find((l) => l.section === 'labour')!;
    const sheet = calculatorSheet(input({ edits: { excluded: [material.tick!, labour.tick!, tickFor.furniture('liv', 7, 1)] } }));
    expect(sheet.excludedCount).toBe(3);
    expect(sheet.original?.grandTotal).toBe(plain.grandTotal);
    expect(sheet.subtotalFurniture).toBeCloseTo(plain.subtotalFurniture - 2450, 2);
    expect(sheet.subtotalWorkers).toBeCloseTo(plain.subtotalWorkers - labour.total, 2);
    // Still on the sheet, where it stood.
    expect(sheet.lines.map((l) => l.tick)).toEqual(plain.lines.map((l) => l.tick));
  });

  it('counts a quantity the person set, shows the one that was worked out, and lets a tick outrank it', () => {
    const basinTick = tickFor.pick('sanitary_global');
    const sheet = calculatorSheet(input({ edits: { quantities: { [basinTick]: 2 } } }));
    const line = sheet.lines.find((l) => l.tick === basinTick)!;
    expect(line).toMatchObject({ qty: 2, originalQty: 1, total: 1080 });
    expect(sheet.changedCount).toBe(1);
    const both = calculatorSheet(input({ edits: { quantities: { [basinTick]: 2 }, excluded: [basinTick] } }));
    expect(both.lines.find((l) => l.tick === basinTick)?.excluded).toBe(true);
    expect(both.subtotalProducts).toBeCloseTo(sheet.subtotalProducts - 1080, 1);
  });

  it('reads a pick flagged by the first version of the summary as ticked off', () => {
    const base = input();
    const flagged = { ...base.picks, selectedProducts: { ...base.picks.selectedProducts, sanitary_global: { ...basin, excluded: true } } };
    expect(calculatorSheet({ ...base, picks: flagged }).lines.find((l) => l.tick === tickFor.pick('sanitary_global'))?.excluded).toBe(true);
  });
});
