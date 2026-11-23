import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { proposalDecor, TALL_HEADBOARD_M } from '@/lib/design/aiProposal';
import { buildReviewBrief, validateReview } from '@/lib/design/aiReview';
import { fitWardrobes } from '@/lib/design/bedroom';
import type { CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { DecorPiece, FloorPlan, Opening, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const door = (wallIndex: number, t = 0.5): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false });
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });
const material = { id: 50, nameKa: 'MDF', nameEn: 'MDF', slug: 'mdf', categorySlug: 'kitchen-custom', unit: 'm2', pricePerUnit: 600, model3dKind: 'kitchen_run', model3dUrl: null, styleTags: ['modern'] } as unknown as CatalogProduct;
const item = (id: string, roomId: string, slot: PlacedItem['slot'], x: number, z: number, rotation: number, w: number, d: number, h = 2): PlacedItem => ({ id, roomId, slot, kind: slot, position: { x, z }, rotation, elevationM: 0, size: { width: w, depth: d, height: h }, product: { productId: 1, nameKa: slot, slug: slot, brand: null, pricePerUnit: 100, unit: 'piece', qty: 1, totalPrice: 100, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/m.glb', categorySlug: null, store: null } });

describe('a bedroom\'s wall of wardrobe', () => {
  it('builds the wardrobe to the whole wall, to the ceiling, when its wall is otherwise empty — and drops the chest of drawers', () => {
    const bedroom = room('b', 'bedroom', 4, 3.6, [door(2, 0.85)]);
    // The wardrobe on the east wall (x = 4), facing west; the wall clear of doors.
    const wardrobe = item('w', 'b', 'wardrobe', 3.7, 1.8, -Math.PI / 2, 1.5, 0.6);
    const dresser = item('d', 'b', 'dresser', 2, 3.3, Math.PI, 1, 0.45, 0.8);
    const { items, decor } = fitWardrobes({ rooms: [bedroom], items: [wardrobe, dresser], catalog: [material], styleId: 'modern' });
    const wall = decor.find((d) => d.family === 'cabinet')!;
    expect(wall).toBeDefined();
    expect(wall.span.to - wall.span.from).toBeCloseTo(3.6, 2);
    expect(wall.height.to).toBeCloseTo(2.7, 3);
    expect((wall.params.sections ?? []).length).toBe(3);
    expect(items).toHaveLength(0);
  });

  it('leaves a wardrobe on a wall it shares with a door or a window', () => {
    const bedroom = room('c', 'bedroom', 4, 3.6, [door(1, 0.3)]);
    const wardrobe = item('w', 'c', 'wardrobe', 3.7, 2.4, -Math.PI / 2, 1.5, 0.6);
    const { items, decor } = fitWardrobes({ rooms: [bedroom], items: [wardrobe], catalog: [material], styleId: 'modern' });
    expect(decor).toHaveLength(0);
    expect(items).toEqual([wardrobe]);
  });

  describe('the floor before its doors (decision 4)', () => {
    // A bedroom 4 × 3.6 m, the wardrobe on the east wall (x = 4) facing west: a wall of wardrobe
    // 60 cm deep has its doors at x = 3.4.
    const bedroom = room('f', 'bedroom', 4, 3.6, [door(2, 0.85)]);
    const wardrobe = item('w', 'f', 'wardrobe', 3.7, 0.9, -Math.PI / 2, 1.5, 0.6);
    const fit = (...others: PlacedItem[]) => fitWardrobes({ rooms: [bedroom], items: [wardrobe, ...others], catalog: [material], styleId: 'modern' });
    /** A desk along the whole wall, `gap` in front of a 60 cm deep wall of wardrobe's doors. */
    const deskAt = (gap: number) => item('k', 'f', 'desk', 3.4 - gap - 0.25, 1.8, Math.PI / 2, 3.4, 0.5, 0.75);

    it('builds it the whole wall long with hinged doors where 75 cm before it is clear — a rug in nobody\'s way', () => {
      const away = item('n', 'f', 'nightstand', 4 - 0.6 - 0.8 - 0.2, 2.9, Math.PI / 2, 0.45, 0.4, 0.5);
      const rug = { ...item('r', 'f', 'rug', 2.8, 1.8, 0, 2, 1.6, 0.01), slot: 'rug' as const };
      const built = fit(away, rug);
      expect(built.decor).toHaveLength(1);
      expect(built.decor[0].span.to - built.decor[0].span.from).toBeCloseTo(3.6, 2);
      expect(built.decor[0].params.sliding).toBeUndefined();
    });

    it('builds it with sliding doors where only 60–75 cm before it is clear', () => {
      const built = fit(deskAt(0.65));
      expect(built.decor).toHaveLength(1);
      expect(built.decor[0].params.sliding).toBe(true);
      expect(built.decor[0].span.to - built.decor[0].span.from).toBeCloseTo(3.6, 2);
      expect(built.decor[0].params.depthMm).toBe(600);
    });

    it('builds it shorter, on the run of the wall whose front is clear, before giving up — and keeps the chest of drawers beside a shorter one', () => {
      // A nightstand 50 cm in front of where the doors would be, near the wall's south end.
      const nightstand = item('n', 'f', 'nightstand', 4 - 0.6 - 0.5 - 0.2, 2.9, Math.PI / 2, 0.45, 0.4, 0.5);
      const dresser = item('d', 'f', 'dresser', 2, 3.3, Math.PI, 1, 0.45, 0.8);
      const built = fit(nightstand, dresser);
      expect(built.decor).toHaveLength(1);
      const span = built.decor[0].span;
      // From the north corner to the nightstand's side, hinged.
      expect(span.from).toBeCloseTo(0, 3);
      expect(span.to).toBeLessThanOrEqual(2.9 - 0.225 + 1e-6);
      expect(span.to - span.from).toBeGreaterThanOrEqual(1.5 - 1e-6);
      expect(built.decor[0].params.sliding).toBeUndefined();
      expect(built.items.map((i) => i.id).sort()).toEqual(['d', 'n']);
    });

    it('builds a shallow one where a 60 cm deep one does not fit, else keeps the shop\'s wardrobe', () => {
      // 50 cm before a 60 cm deep one's doors along the whole wall: 72 cm before a shallow one's.
      const shallow = fit(deskAt(0.5));
      expect(shallow.decor).toHaveLength(1);
      expect(shallow.decor[0].params.depthMm).toBe(380);
      expect(shallow.decor[0].params.sliding).toBe(true);
      // 30 cm: 52 cm before a shallow one — too little for sliding doors. The shop's wardrobe stays.
      const desk = deskAt(0.3);
      const kept = fit(desk);
      expect(kept.decor).toHaveLength(0);
      expect(kept.items).toEqual([wardrobe, desk]);
    });

    it('never takes the floor beside the bed or its nightstand: the bed and the wardrobe are judged together', () => {
      const kinds = new Set<string>();
      for (const gap of [0.85, 0.95, 1.0, 1.1, 1.2, 1.3, 1.45]) {
        // The bed's head on the north wall, its long side `gap` off the east wall, a nightstand at its head.
        const bed = item('b', 'f', 'bed', 4 - gap - 0.8, 1.025, 0, 1.6, 2.05, 1);
        const nightstand = item('n', 'f', 'nightstand', 4 - gap + 0.25, 0.2, 0, 0.4, 0.4, 0.5);
        const shop = item('w', 'f', 'wardrobe', 3.7, 2.85, -Math.PI / 2, 1.2, 0.6);
        const built = fitWardrobes({ rooms: [bedroom], items: [shop, bed, nightstand], catalog: [material], styleId: 'modern' }).decor[0];
        if (!built) continue;
        const depth = (built.params.depthMm ?? 600) / 1000;
        kinds.add(`${depth}${built.params.sliding ? ' sliding' : ''}${Math.abs(built.span.to - built.span.from) < 3.5 ? ' shorter' : ''}`);
        const [lo, hi] = [Math.min(built.span.from, built.span.to), Math.max(built.span.from, built.span.to)];
        // Along the bed's length (z 0–2.05) or the nightstand's, its doors 60 cm at least off the bed's side.
        const besideBed = lo < 2.05 && hi > 0;
        if (besideBed) expect(gap - depth, `gap ${gap}`).toBeGreaterThanOrEqual(0.6 - 1e-6);
        // Never over the nightstand.
        if (lo < 0.4 && hi > 0) expect(4 - depth, `gap ${gap}`).toBeGreaterThanOrEqual(4 - gap + 0.45 - 1e-6);
      }
      // The ladder ran: some of the rooms got a shorter, a sliding or a shallow one.
      expect([...kinds].length, [...kinds].join(', ')).toBeGreaterThanOrEqual(2);
    });
  });

  it('lays a stool out in a bedroom with room for one', () => {
    expect(layoutRoom(room('s', 'bedroom', 4.5, 4, [door(2, 0.8)]), {}).some((i) => i.slot === 'stool')).toBe(true);
  });
});

describe('the bed\'s headboard', () => {
  it('takes no panel behind a bed with a tall headboard of its own', () => {
    const bedroom = room('h', 'bedroom', 4, 3.6, [door(2, 0.85)]);
    const proposal = { model: 'm', rooms: [{ roomId: 'h', note: null, picks: {}, floor: 0, wall: 0, decor: [{ family: 'panel', anchor: 'bed', wallIndex: -1, widthM: 0, heightFromM: -1, heightToM: -1, params: {}, materials: [], referenceId: null, concept: null, note: null }] }] } as never;
    const low = item('bed', 'h', 'bed', 2, 1.05, 0, 1.6, 2.05, 1.0);
    const tall = { ...low, size: { ...low.size, height: TALL_HEADBOARD_M + 0.1 } };
    expect(proposalDecor(plan(bedroom), proposal, [tall], [])).toHaveLength(0);
    void proposalDecor(plan(bedroom), proposal, [low], []);
  });
});

describe('the AI check and the engine\'s joinery', () => {
  it('lists the joinery as fixed, and drops a move of a basin on its vanity or of the washer in its column', () => {
    const bath = room('x', 'bathroom', 3, 2.4, [door(3, 0.7)]);
    const sink = { ...item('s', 'x', 'sink', 1, 0.25, 0, 0.6, 0.4, 0.14), elevationM: 0.76 };
    const washer = item('m', 'x', 'washer', 2.2, 0.3, 0, 0.6, 0.55, 0.85);
    const vanity: DecorPiece = { id: 'decor-x-joinery-s', roomId: 'x', family: 'cabinet', wallIndex: 0, span: { from: 0.5, to: 2.6 }, height: { from: 0, to: 1.8 }, params: { sections: [{ kind: 'basin', widthMm: 1400, heightMm: 760, depthMm: 500 }, { kind: 'washer', widthMm: 700, heightMm: 1800, depthMm: 650 }] }, materials: {}, anchor: 'joinery' };
    const brief = buildReviewBrief({ plan: plan(bath), items: [sink, washer], decor: [vanity], styleId: 'modern', locale: 'en', catalog: [] });
    expect(brief.text).toContain('fixed — not to be moved or removed');
    expect(brief.offer.decorIds?.has(vanity.id)).toBe(false);
    const review = validateReview({ rooms: [{ room: 'x', note: '', fixes: [{ target: vanity.id, action: 'remove_decor', reason: '' }, { target: 's', action: 'move_to_wall', wall: 1, reason: '' }, { target: 'm', action: 'remove', reason: '' }] }] } as never, plan(bath), brief.offer, 'm');
    expect(review.fixes).toHaveLength(0);
  });
});
