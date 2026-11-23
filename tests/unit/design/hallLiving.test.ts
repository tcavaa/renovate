import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { suggestTechnical } from '@/lib/design/autoTechnical';
import { sectionSpans } from '@/lib/design/decor/joinery';
import { fitHall, housedBoilerSpot, widthInFront } from '@/lib/design/hall';
import { generateScene } from '@/lib/design/generateScene';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import { radiatorBodies } from '@/lib/design/radiators';
import { seededRng } from '@/lib/design/random';
import { footprintQuad, quadsOverlap, SHALLOW_WARDROBE_DEPTH_M, WARDROBE_DEPTH_M } from '@/lib/design/rules';
import type { FloorPlan, Opening, PlacedItem, PlanRoom, TechnicalPoint } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const door = (wallIndex: number, t = 0.5, exterior = false): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.9, heightM: 2.05, sillM: 0, exterior });
const window = (wallIndex: number, t = 0.5): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true });
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });
const material = { id: 50, nameKa: 'MDF', nameEn: 'MDF', slug: 'mdf', categorySlug: 'kitchen-custom', unit: 'm2', pricePerUnit: 600, model3dKind: 'kitchen_run', model3dUrl: null, styleTags: ['modern'] } as unknown as CatalogProduct;

describe('the entrance hall', () => {
  // A hall 3.6 × 2.4 m, the front door in the middle of its short wall: a wardrobe along a long
  // wall stands clear of its way — the door's width and 10 cm either side, `doorClearFloor` (in a
  // hall 2.2 m wide it would stand 5 cm into it, and is not built).
  const hall = room('h', 'hallway', 3.6, 2.4, [door(3, 0.5, true), door(1, 0.5)]);

  it('builds one wardrobe to the ceiling by the front door — the coats, the shoes — in place of the coat rack and shoe cabinet', () => {
    const items = layoutRoom(hall, {}).map((i) => ({ ...i, product: null }));
    expect(items.some((i) => i.slot === 'coat_rack' || i.slot === 'shoe_cabinet')).toBe(true);
    const { items: out, decor } = fitHall({ rooms: [hall], items, catalog: [material], styleId: 'modern' });
    const wardrobe = decor.find((d) => d.family === 'cabinet');
    expect(wardrobe).toBeDefined();
    const kinds = sectionSpans(wardrobe!).map((s) => s.section.kind);
    // No boiler hangs here: no section for one.
    expect(kinds.sort()).toEqual(['coats', 'shoes']);
    expect(wardrobe!.height.to).toBeCloseTo(2.7, 3);
    expect(wardrobe!.materials.face?.product?.productId).toBe(50);
    expect(out.some((i) => i.slot === 'coat_rack' || i.slot === 'shoe_cabinet')).toBe(false);
    expect(housedBoilerSpot([hall], decor)).toBeNull();
  });

  it('takes the flat\'s boiler hanging on its stretch in, in a ventilated section where it hangs, and that boiler has no cabinet of its own (decision 5)', () => {
    const items = layoutRoom(hall, {}).map((i) => ({ ...i, product: null }));
    const plain = fitHall({ rooms: [hall], items, catalog: [material], styleId: 'modern' }).decor[0];
    const edge = roomEdges(hall.polygon).find((e) => e.index === plain.wallIndex)!;
    // 30 cm in from the wardrobe's end by the front door (x = 0), 20 cm off its wall.
    const end = Math.abs(edge.a.x + edge.dir.x * plain.span.from) < Math.abs(edge.a.x + edge.dir.x * plain.span.to) ? plain.span.from + 0.3 : plain.span.to - 0.3;
    const position = { x: edge.a.x + edge.dir.x * end + edge.inward.x * 0.2, z: edge.a.z + edge.dir.z * end + edge.inward.z * 0.2 };
    const boiler: TechnicalPoint = { id: 'b', kind: 'boiler', roomId: 'h', position, origin: 'generated' };
    const fit = (technical: TechnicalPoint[]) => fitHall({ rooms: [hall], items, catalog: [material], styleId: 'modern', technical });
    const sections = (technical: TechnicalPoint[]) => sectionSpans(fit(technical).decor[0]).map((s) => s.section.kind);
    const housed = fit([boiler]);
    expect(sectionSpans(housed.decor[0]).map((s) => s.section.kind)).toContain('boiler');
    expect(housed.housed).toBe('b');
    // The section is where the boiler hangs.
    expect(Math.hypot(housedBoilerSpot([hall], housed.decor)!.position.x - position.x, housedBoilerSpot([hall], housed.decor)!.position.z - position.z)).toBeLessThan(0.33);
    // A boiler with the cabinet the app gave it is taken in too — one enclosure, not a cupboard beside the wardrobe.
    const cabinet = { productId: 1, nameKa: 'c', slug: 'c', brand: null, pricePerUnit: 1, unit: 'm2', qty: 1, totalPrice: 1, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: null, store: null };
    expect(sections([{ ...boiler, cabinet }])).toContain('boiler');
    expect(fit([{ ...boiler, cabinet }]).housed).toBe('b');
    // One whose cabinet the person chose keeps it, and the wardrobe stands clear of that cupboard.
    const chosen = fit([{ ...boiler, cabinet, cabinetChosen: true }]);
    expect(chosen.housed).toBeNull();
    for (const piece of chosen.decor) {
      expect(sectionSpans(piece).map((s) => s.section.kind)).not.toContain('boiler');
      // Its cupboard: the boiler's 42 cm and 10 cm either side, about where it hangs.
      const [lo, hi] = [Math.min(piece.span.from, piece.span.to), Math.max(piece.span.from, piece.span.to)];
      if (piece.wallIndex === edge.index) expect(hi <= end - 0.31 + 1e-6 || lo >= end + 0.31 - 1e-6).toBe(true);
    }
    // One in another room, or none: no section.
    expect(sections([{ ...boiler, roomId: 'balcony', position: { x: 9, z: 9 } }])).not.toContain('boiler');
    expect(sections([])).not.toContain('boiler');
    expect(fit([]).housed).toBeNull();
    // A boiler the technical button hangs later goes where the boiler's spot is, with its own cupboard.
    let n = 0;
    const later = suggestTechnical(plan(hall), items, () => `t${n++}`, [plain]).points.find((p) => p.kind === 'boiler');
    expect(later?.cabinet).not.toBeNull();
  });

  describe('the boiler in it (decision 5)', () => {
    // A hall 5 × 2.2 m, the front door in its short west wall, a door in its east wall near the
    // north corner: the wardrobe goes along the south wall (z = 2.2), from the door's end.
    const long = room('l5', 'hallway', 5, 2.2, [door(3, 0.5, true), door(1, 0.25)]);
    const items = layoutRoom(long, {}).map((i) => ({ ...i, product: null }));
    const plain = fitHall({ rooms: [long], items, catalog: [material], styleId: 'modern' }).decor[0];
    const edge = roomEdges(long.polygon).find((e) => e.index === plain.wallIndex)!;
    /** A boiler hung `s` metres along the wardrobe's wall, 20 cm off it. */
    const boilerAt = (s: number, extra: Partial<TechnicalPoint> = {}): TechnicalPoint => ({ id: 'b', kind: 'boiler', roomId: long.id, position: { x: edge.a.x + edge.dir.x * s + edge.inward.x * 0.2, z: edge.a.z + edge.dir.z * s + edge.inward.z * 0.2 }, origin: 'generated', ...extra });
    const fit = (boiler: TechnicalPoint) => fitHall({ rooms: [long], items, catalog: [material], styleId: 'modern', technical: [boiler] });
    /** Along the wall from the front door's end. */
    const fromDoor = (s: number) => (Math.abs(edge.a.x + edge.dir.x * plain.span.from) < Math.abs(edge.a.x + edge.dir.x * plain.span.to) ? plain.span.from + s : plain.span.to - s);

    it('puts the section where the boiler really hangs — the coats by the door one side of it, the shoes the other', () => {
      const s = fromDoor(1.3);
      const out = fit(boilerAt(s));
      expect(out.housed).toBe('b');
      const spans = sectionSpans(out.decor[0]);
      const kinds = spans.map((x) => x.section.kind);
      expect(kinds).toContain('boiler');
      const section = spans.find((x) => x.section.kind === 'boiler')!;
      // The boiler's 42 cm inside its section, and the section no narrower than 65 cm.
      expect(section.x0).toBeLessThanOrEqual(s - 0.21 + 1e-6);
      expect(section.x1).toBeGreaterThanOrEqual(s + 0.21 - 1e-6);
      expect(section.x1 - section.x0).toBeGreaterThanOrEqual(0.65 - 1e-3);
      // Its own compartment: the coats and the shoes either side, the coats nearer the door.
      const i = kinds.indexOf('boiler');
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(kinds.length - 1);
      const doorSide = spans.filter((x) => Math.abs(fromDoor(0) - (x.x0 + x.x1) / 2) < Math.abs(fromDoor(0) - s));
      expect(doorSide.map((x) => x.section.kind)).toContain('coats');
      expect(kinds.filter((k) => k === 'coats')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'shoes')).toHaveLength(1);
      expect(spans.find((x) => x.section.kind === 'coats')!.x1 - spans.find((x) => x.section.kind === 'coats')!.x0).toBeGreaterThanOrEqual(0.8 - 1e-3);
      expect(spans.find((x) => x.section.kind === 'shoes')!.x1 - spans.find((x) => x.section.kind === 'shoes')!.x0).toBeGreaterThanOrEqual(0.6 - 1e-3);
    });

    it('in a generated flat: the boiler\'s own cabinet comes off where the section takes it in, and comes back when a later generation does not', () => {
      const cabinet = { productId: 1, nameKa: 'c', slug: 'c', brand: null, pricePerUnit: 600, unit: 'm2', qty: 1.5, totalPrice: 900, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: 'boiler-cabinet', store: null };
      const boilerMaterial = { id: 1, nameKa: 'c', nameEn: 'c', slug: 'c', categorySlug: 'boiler-cabinet', unit: 'm2', pricePerUnit: 600, model3dKind: null, model3dUrl: null, styleTags: ['modern'] } as unknown as CatalogProduct;
      const generate = (points: TechnicalPoint[]) => generateScene({ plan: { ...plan(long), technical: { points } }, styleId: 'modern', budgetGel: null, catalog: [material, boilerMaterial], proposal: null, finishes: [], electrical: [], seed: 1, at: '2026-11-23T00:00:00.000Z', aiCount: 0 });
      // The boiler hung in the middle of the wardrobe the flat is generated with.
      const base = generate([]).decor.find((d) => d.id.endsWith('-hall-wardrobe'))!;
      const wall = roomEdges(long.polygon).find((e) => e.index === base.wallIndex)!;
      const s = (base.span.from + base.span.to) / 2;
      const scene = generate([{ ...boilerAt(0, { cabinet }), position: { x: wall.a.x + wall.dir.x * s + wall.inward.x * 0.2, z: wall.a.z + wall.dir.z * s + wall.inward.z * 0.2 } }]);
      const point = scene.plan.technical!.points[0];
      expect(point.cabinet).toBeNull();
      expect(point.housed).toBe(true);
      const wardrobe = scene.decor.find((d) => d.id.endsWith('-hall-wardrobe'))!;
      expect(sectionSpans(wardrobe).map((x) => x.section.kind)).toContain('boiler');
      // The same boiler moved out of the hall: no section, and its cupboard back.
      const moved = generate([{ ...point, roomId: 'elsewhere', position: { x: 9, z: 9 } }]);
      expect(moved.decor.flatMap((d) => sectionSpans(d).map((x) => x.section.kind))).not.toContain('boiler');
      expect(moved.plan.technical!.points[0].cabinet?.productId).toBe(1);
      expect(moved.plan.technical!.points[0].housed).toBeUndefined();
    });

    it('runs the wardrobe on along its stretch to a boiler past its own length', () => {
      expect(Math.abs(plain.span.to - plain.span.from)).toBeLessThanOrEqual(2.8 + 1e-3);
      // 3.2 m from the door's end: past the wardrobe's own 2.8 m, short of the front door's clear floor
      // (90 cm in, the door and 10 cm either side — decision 12), which the wardrobe never runs into.
      const s = fromDoor(3.2);
      const out = fit(boilerAt(s));
      expect(out.housed).toBe('b');
      const [lo, hi] = [Math.min(out.decor[0].span.from, out.decor[0].span.to), Math.max(out.decor[0].span.from, out.decor[0].span.to)];
      expect(lo).toBeLessThanOrEqual(s - 0.21);
      expect(hi).toBeGreaterThanOrEqual(s + 0.21);
    });

    it('leaves the boiler a cupboard of its own where its section would cost the coats\' or the shoes\' room, and is not built over it', () => {
      // A hall 2.4 × 2 m: its one stretch, 2.4 m, takes coats, shoes and a section only with the boiler at an end.
      const small = room('s2', 'hallway', 2.4, 2, [door(3, 0.25, true), door(1, 0.75)]);
      const smallItems: PlacedItem[] = [];
      const bare = fitHall({ rooms: [small], items: smallItems, catalog: [material], styleId: 'modern' }).decor[0];
      expect(bare).toBeDefined();
      const wall = roomEdges(small.polygon).find((e) => e.index === bare.wallIndex)!;
      const at = (s: number): TechnicalPoint => ({ id: 'b', kind: 'boiler', roomId: small.id, position: { x: wall.a.x + wall.dir.x * s + wall.inward.x * 0.2, z: wall.a.z + wall.dir.z * s + wall.inward.z * 0.2 }, origin: 'generated' });
      // 45 cm of wall one side of its section, 1.3 m the other: neither the coats and the shoes together, nor one each side.
      const middle = fitHall({ rooms: [small], items: smallItems, catalog: [material], styleId: 'modern', technical: [at(0.45 + 0.325)] });
      expect(middle.housed).toBeNull();
      for (const piece of middle.decor.filter((d) => d.family === 'cabinet')) {
        expect(sectionSpans(piece).map((x) => x.section.kind)).not.toContain('boiler');
        const [lo, hi] = [Math.min(piece.span.from, piece.span.to), Math.max(piece.span.from, piece.span.to)];
        if (piece.wallIndex === wall.index) expect(hi <= 0.775 - 0.31 + 1e-6 || lo >= 0.775 + 0.31 - 1e-6).toBe(true);
      }
      // A generated flat: no cupboard for it, the wardrobe not over it.
      const cabinet = { productId: 1, nameKa: 'c', slug: 'c', brand: null, pricePerUnit: 1, unit: 'm2', qty: 1, totalPrice: 1, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: null, store: null };
      const kept = generateScene({ plan: { ...plan(small), technical: { points: [{ ...at(0.775), cabinet }] } }, styleId: 'modern', budgetGel: null, catalog: [material], proposal: null, finishes: [], electrical: [], seed: 1, at: '2026-11-23T00:00:00.000Z', aiCount: 0 });
      expect(kept.plan.technical!.points[0].cabinet).toEqual(cabinet);
      // At the end of the stretch it is taken in.
      expect(fitHall({ rooms: [small], items: smallItems, catalog: [material], styleId: 'modern', technical: [at(0.35)] }).housed).toBe('b');
    });
  });

  it('builds the wardrobe clear of a radiator', () => {
    const items = layoutRoom(hall, {}).map((i) => ({ ...i, product: null }));
    const plain = fitHall({ rooms: [hall], items, catalog: [material], styleId: 'modern' }).decor[0];
    const edge = roomEdges(hall.polygon).find((e) => e.index === plain.wallIndex)!;
    // A radiator of six sections (48 cm) in the middle of where the wardrobe stood.
    const mid = (plain.span.from + plain.span.to) / 2;
    const at = { x: edge.a.x + edge.dir.x * mid + edge.inward.x * 0.05, z: edge.a.z + edge.dir.z * mid + edge.inward.z * 0.05 };
    const radiators = radiatorBodies({ ...plan(hall), technical: { points: [{ id: 'rad', kind: 'radiator', roomId: 'h', position: at, sections: 6, origin: 'user' }] } });
    expect(radiators).toHaveLength(1);
    const built = fitHall({ rooms: [hall], items, catalog: [material], styleId: 'modern', radiators }).decor.filter((d) => d.family === 'cabinet');
    for (const piece of built) {
      if (piece.wallIndex !== edge.index) continue;
      const [lo, hi] = [Math.min(piece.span.from, piece.span.to), Math.max(piece.span.from, piece.span.to)];
      expect(hi <= radiators[0].from + 1e-6 || lo >= radiators[0].to - 1e-6).toBe(true);
    }
  });

  it('makes the wardrobe as deep as the hall is wide in front of it, not as its bounding box', () => {
    // An L-shaped hall: a corridor 1.3 m wide and 4 m long, opening at its far end into a part 3 m
    // wide — 3 × 5 m round it. The front door in the corridor's end.
    const l = refreshRoom({ id: 'l', type: 'hallway', name: 'l', polygon: [{ x: 0, z: 0 }, { x: 1.3, z: 0 }, { x: 1.3, z: 4 }, { x: 3, z: 4 }, { x: 3, z: 5 }, { x: 0, z: 5 }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [{ ...door(0, 0.5, true), id: 'l-o0', roomId: 'l' }] });
    expect(widthInFront(l, roomEdges(l.polygon)[1], 0, 4)).toBeCloseTo(1.3, 3);
    expect(widthInFront(l, roomEdges(l.polygon)[5], 0, 5)).toBeCloseTo(1.3, 3);
    const items = layoutRoom(l, {}).map((i) => ({ ...i, product: null }));
    const wardrobe = fitHall({ rooms: [l], items, catalog: [material], styleId: 'modern' }).decor.find((d) => d.family === 'cabinet');
    expect(wardrobe).toBeDefined();
    // 1.3 m wide: a shallow one, 80 cm and more left to pass (60 cm deep, it left 70).
    expect(sectionSpans(wardrobe!).every((s) => s.section.depthMm === SHALLOW_WARDROBE_DEPTH_M * 1000)).toBe(true);
    // The rectangular hall 2.4 m wide still takes one 60 cm deep.
    const rect = fitHall({ rooms: [hall], items: layoutRoom(hall, {}).map((i) => ({ ...i, product: null })), catalog: [material], styleId: 'modern' }).decor[0];
    expect(sectionSpans(rect).every((s) => s.section.depthMm === WARDROBE_DEPTH_M * 1000)).toBe(true);
  });

  it('keeps the coat rack in a hall too narrow for a wardrobe', () => {
    const narrow = room('n', 'hallway', 3.6, 1.1, [door(3, 0.5, true)]);
    const items = layoutRoom(narrow, {});
    const { decor, items: out } = fitHall({ rooms: [narrow], items, catalog: [material], styleId: 'modern' });
    expect(decor).toHaveLength(0);
    expect(out).toEqual(items);
  });

  it('lays a door mat inside the front door, and nowhere else', () => {
    const mat = layoutRoom(hall, {}).find((i) => i.slot === 'door_mat');
    expect(mat).toBeDefined();
    expect(mat!.position.x).toBeLessThan(0.5);
    expect(layoutRoom(room('x', 'hallway', 3, 1.6, [door(3, 0.5)]), {}).some((i) => i.slot === 'door_mat')).toBe(false);
  });
});

describe('the hall\'s mirror', () => {
  const furniture = (id: number, kind: string, w: number, d: number, h: number): CatalogProduct =>
    ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 500, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm: w, depthCm: d, heightCm: h, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as CatalogProduct;
  const consoleTable = furniture(60, 'console_table', 100, 35, 80);
  /** As tall as a person, flat on the wall: the hall's full-height mirror (E-8). */
  const fullHeight = furniture(61, 'mirror', 70, 10, 180);
  const wallMirror = furniture(62, 'mirror', 60, 3, 80);
  const plainHall = room('p', 'hallway', 4, 1.8);
  // As the engine lays them: the console against the north wall, the mirror's slot over it.
  const consoleSlot: PlacedItem = { id: 'console', roomId: 'p', kind: 'console_table', slot: 'console', position: { x: 2, z: 0.175 }, rotation: 0, elevationM: 0, size: { width: 1, depth: 0.35, height: 0.8 }, product: null };
  const mirrorSlot: PlacedItem = { id: 'mirror', roomId: 'p', kind: 'mirror', slot: 'mirror', position: { x: 2, z: 0.035 }, rotation: 0, elevationM: 1, size: { width: 0.7, depth: 0.05, height: 1.1 }, product: null };
  const intoWhatStandsBelow = (mirror: PlacedItem, items: PlacedItem[]) =>
    items.some((p) => p.id !== mirror.id && p.roomId === mirror.roomId && p.elevationM < 0.05 && p.size.height > mirror.elevationM + 0.005 && quadsOverlap(footprintQuad({ ...mirror, size: { ...mirror.size, depth: Math.max(mirror.size.depth, 0.05) } }), footprintQuad(p)));

  it('over the console is one that hangs clear of it, under the ceiling — not the full-height one behind it', () => {
    for (const seed of [undefined, 1, 2, 3]) {
      const matched = matchProducts([consoleSlot, mirrorSlot], [consoleTable, fullHeight, wallMirror], { styleId: 'modern', rooms: [plainHall], ...(seed == null ? {} : { rng: seededRng(seed) }) });
      const mirror = matched.find((i) => i.slot === 'mirror')!;
      expect(mirror.product?.productId).toBe(62);
      expect(mirror.elevationM).toBeGreaterThanOrEqual(0.8 + 0.12 - 1e-9);
      expect(mirror.elevationM + mirror.size.height).toBeLessThanOrEqual(2.7);
      expect(intoWhatStandsBelow(mirror, matched)).toBe(false);
    }
  });

  it('on a wall free from the floor up is the full-height one', () => {
    const [mirror] = matchProducts([mirrorSlot], [consoleTable, fullHeight, wallMirror], { styleId: 'modern', rooms: [plainHall] });
    expect(mirror.product?.productId).toBe(61);
    expect(mirror.elevationM).toBeCloseTo(0.3);
  });

  // Kept, though the full-height mirror hung 30 cm off the floor then runs into the console under
  // it: the hall keeps its mirror rather than lose it — which gives way is the owner's (O4).
  it('is kept where the catalogue has none that fits over the console', () => {
    const matched = matchProducts([consoleSlot, mirrorSlot], [consoleTable, fullHeight], { styleId: 'modern', rooms: [plainHall] });
    expect(matched.find((i) => i.slot === 'mirror')!.product?.productId).toBe(61);
  });

  it('across from the built wardrobe is the full-height one, on a stretch of wall free from the floor up', () => {
    // A hall 5 × 1.8 m, the front door in its west wall; the console and the mirror over it at
    // the far end of the south wall, which leaves the wardrobe a long wall and the mirror a
    // stretch of the wall across from it.
    const hall = room('h', 'hallway', 5, 1.8, [door(3, 0.5, true), door(1, 0.5)]);
    const catalog = [material, consoleTable, fullHeight, wallMirror];
    const south = { roomId: 'h', rotation: Math.PI };
    const laid = [{ ...consoleSlot, ...south, position: { x: 4, z: 1.8 - 0.175 } }, { ...mirrorSlot, ...south, position: { x: 4, z: 1.8 - 0.035 } }];
    const matched = matchProducts(laid, catalog, { styleId: 'modern', rooms: [hall] });
    const before = matched.find((i) => i.slot === 'mirror')!;
    // Laid over the console, it is the one that fits over it.
    expect(before.product?.productId).toBe(62);
    const { items, decor } = fitHall({ rooms: [hall], items: matched, catalog, styleId: 'modern' });
    expect(decor.some((d) => d.id === 'decor-h-hall-wardrobe')).toBe(true);
    const mirror = items.find((i) => i.slot === 'mirror')!;
    // Moved across from the wardrobe: the full-height mirror, its top at door height, nothing under it.
    expect(mirror.position).not.toEqual(before.position);
    expect(mirror.product?.productId).toBe(61);
    expect(mirror.size).toEqual({ width: 0.7, depth: 0.1, height: 1.8 });
    expect(mirror.elevationM + mirror.size.height).toBeCloseTo(2.0);
    expect(intoWhatStandsBelow(mirror, items)).toBe(false);
    // With no full-height mirror to hang there, the one it has, at eye level.
    const plain = fitHall({ rooms: [hall], items: matched, catalog: [material, consoleTable, wallMirror], styleId: 'modern' }).items.find((i) => i.slot === 'mirror')!;
    expect(plain.product?.productId).toBe(62);
    expect(plain.elevationM + plain.size.height / 2).toBeCloseTo(1.5);
  });
});

describe('the living room', () => {
  it('dresses every window, not one a room', () => {
    const living = room('l', 'living_room', 6, 4, [window(0, 0.25), window(0, 0.75), door(2, 0.5)]);
    for (const styleId of ['scandinavian', 'modern'] as const) {
      const dressed = layoutRoom(living, { styleId }).filter((i) => i.slot === 'curtain');
      expect(dressed, styleId).toHaveLength(2);
    }
  });

  it('keeps the floor between the sofa and the TV off the way between the doors', () => {
    // Doors on both long walls, near the same end: the way through runs across that end.
    const living = room('p', 'living_room', 6, 4.6, [door(0, 0.2), door(2, 0.8)]);
    const items = layoutRoom(living, {});
    const found = { sofa: items.find((i) => i.slot === 'sofa'), tv: items.find((i) => i.slot === 'tv_unit') };
    expect(found.sofa).toBeDefined();
    expect(found.tv).toBeDefined();
    const sofa = found.sofa!;
    const tv = found.tv!;
    const edges = roomEdges(living.polygon);
    const doors = living.openings.map((o) => {
      const e = edges.find((x) => x.index === o.wallIndex)!;
      return { x: e.a.x + (e.b.x - e.a.x) * o.t, z: e.a.z + (e.b.z - e.a.z) * o.t };
    });
    const path = footprintQuad({ position: { x: (doors[0].x + doors[1].x) / 2, z: (doors[0].z + doors[1].z) / 2 }, rotation: Math.atan2(doors[1].x - doors[0].x, doors[1].z - doors[0].z), size: { width: 0.4, depth: Math.hypot(doors[1].x - doors[0].x, doors[1].z - doors[0].z), height: 1 } });
    const between = footprintQuad({ position: { x: (sofa.position.x + tv.position.x) / 2, z: (sofa.position.z + tv.position.z) / 2 }, rotation: sofa.rotation, size: { width: sofa.size.width * 0.6, depth: Math.max(0.1, Math.hypot(tv.position.x - sofa.position.x, tv.position.z - sofa.position.z) - 1.2), height: 1 } });
    expect(quadsOverlap(path, between)).toBe(false);
    void (null as unknown as PlacedItem);
  });
});
