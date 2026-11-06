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
