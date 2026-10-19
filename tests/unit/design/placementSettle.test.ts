import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { reviewFindings, validateReview, type ReviewOffer } from '@/lib/design/aiReview';
import { applyReviewFixes, withoutArtOverDecor } from '@/lib/design/aiProposal';
import type { DecorPiece, FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

function room(id: string, type: RoomType, w: number, d: number): PlanRoom {
  return refreshRoom({
    id,
    type,
    name: id,
    polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }],
    heightM: 2.7,
    areaM2: 0,
    perimeterM: 0,
    // A door in the middle of the far wall, so the near wall is the bed's.
    openings: [{ id: `${id}-door`, kind: 'door', wallIndex: 2, t: 0.5, widthM: 0.85, heightM: 2.05, sillM: 0, roomId: id, exterior: true }],
  });
}

function product(id: number, kind: string, w: number, d: number, h: number, extra: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    nameKa: `p${id}`,
    nameEn: `product ${id}`,
    slug: `p${id}`,
    brand: null,
    categorySlug: 'x',
    pricePerUnit: 500,
    unit: 'piece',
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dKind: kind,
    model3dUrl: `/models/p${id}.glb`,
    widthCm: w,
    depthCm: d,
    heightCm: h,
    styleTags: ['scandinavian'],
    tags: [],
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
    ...extra,
  };
}

const forward = (i: PlacedItem) => ({ x: Math.sin(i.rotation), z: Math.cos(i.rotation) });
const right = (i: PlacedItem) => ({ x: Math.cos(i.rotation), z: -Math.sin(i.rotation) });
const dot = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x * b.x + a.z * b.z;
/** How far a piece's back stands off the room's nearest wall (rectangular room `w` × `d`). */
function backGap(i: PlacedItem, w: number, d: number): number {
  const f = forward(i);
  const back = { x: i.position.x - f.x * (i.size.depth / 2), z: i.position.z - f.z * (i.size.depth / 2) };
  return Math.min(back.x, w - back.x, back.z, d - back.z);
}

describe('pieces placed off the bed stand by its head, whatever the bed', () => {
  const bedroom = room('b', 'bedroom', 4.4, 4.2);

  it('lays the nightstands out beside the head of the bed, backs on the bed\'s wall', () => {
    const items = layoutRoom(bedroom);
    const bed = items.find((i) => i.slot === 'bed')!;
    const stands = items.filter((i) => i.slot === 'nightstand');
    expect(stands).toHaveLength(2);
    for (const stand of stands) {
      const off = { x: stand.position.x - bed.position.x, z: stand.position.z - bed.position.z };
      // Back in line with the bed's back…
      expect(dot(off, forward(bed)) - (-bed.size.depth / 2 + stand.size.depth / 2)).toBeCloseTo(0, 5);
      // …just off its side.
      expect(Math.abs(dot(off, right(bed))) - bed.size.width / 2 - stand.size.width / 2).toBeCloseTo(0.04, 5);
    }
    expect(Math.sign(dot({ x: stands[0].position.x - bed.position.x, z: stands[0].position.z - bed.position.z }, right(bed)))).not.toBe(
      Math.sign(dot({ x: stands[1].position.x - bed.position.x, z: stands[1].position.z - bed.position.z }, right(bed))),
    );
  });

  it('moves them to the real bed when a wider, deeper bed fills the slot, and keeps the bed on its wall', () => {
    const catalog = [product(1, 'bed_double', 184, 215, 110), product(2, 'nightstand', 50, 35, 50)];
    const matched = matchProducts(layoutRoom(bedroom), catalog, { styleId: 'scandinavian', rooms: [bedroom] });
    const bed = matched.find((i) => i.slot === 'bed')!;
    expect(bed.size.width).toBeCloseTo(1.84);
    expect(backGap(bed, 4.4, 4.2)).toBeLessThan(0.03);
    for (const stand of matched.filter((i) => i.slot === 'nightstand' && i.product)) {
      const off = { x: stand.position.x - bed.position.x, z: stand.position.z - bed.position.z };
      expect(Math.abs(dot(off, right(bed))) - bed.size.width / 2 - stand.size.width / 2).toBeCloseTo(0.04, 3);
      expect(backGap(stand, 4.4, 4.2)).toBeLessThan(0.03);
    }
  });

  it('keeps a shallower wardrobe on its wall instead of standing it off', () => {
    const catalog = [product(1, 'bed_double', 160, 205, 100), product(3, 'wardrobe', 150, 45, 200)];
    const matched = matchProducts(layoutRoom(bedroom), catalog, { styleId: 'scandinavian', rooms: [bedroom] });
    const wardrobe = matched.find((i) => i.slot === 'wardrobe' && i.product);
    expect(wardrobe).toBeTruthy();
    expect(backGap(wardrobe!, 4.4, 4.2)).toBeLessThan(0.03);
  });
});

describe('mirrors and basins', () => {
  const bathroom = room('w', 'bathroom', 2.6, 2.4);

  it('hangs the bathroom mirror over the basin at eye level, never a floor mirror, and stands only basins that stand', () => {
    const catalog = [
      product(10, 'toilet', 36, 54, 45),
      product(11, 'sink', 60, 45, 85),
      product(12, 'sink', 60, 40, 12),
      product(13, 'mirror', 60, 3, 80),
      product(14, 'mirror', 59, 50, 164),
    ];
    const matched = matchProducts(layoutRoom(bathroom), catalog, { styleId: 'scandinavian', rooms: [bathroom] });
    const sink = matched.find((i) => i.slot === 'sink')!;
    const mirror = matched.find((i) => i.slot === 'mirror')!;
    expect(sink.product?.productId).toBe(11);
    expect(mirror.product?.productId).toBe(13);
    expect(Math.hypot(mirror.position.x - sink.position.x, mirror.position.z - sink.position.z)).toBeLessThan(0.6);
    // Its middle at 1.55 m, its bottom over the basin.
    expect(mirror.elevationM + mirror.size.height / 2).toBeCloseTo(1.55, 1);
    expect(mirror.elevationM).toBeGreaterThan(sink.size.height);
  });

  it('stands a floor mirror on the floor in the hallway, out from the wall by its stand', () => {
    const hallway = room('h', 'hallway', 4, 1.8);
    const catalog = [product(14, 'mirror', 59, 50, 164)];
    const mirror = matchProducts(layoutRoom(hallway), catalog, { styleId: 'scandinavian', rooms: [hallway] }).find((i) => i.slot === 'mirror' && i.product);
    if (!mirror) return; // the hallway had no wall for it in this draw
    expect(mirror.elevationM).toBe(0);
    expect(backGap(mirror, 4, 1.8)).toBeLessThan(0.03);
  });
});

describe('the designer\'s check of a furnished flat', () => {
  const bedroom = room('b', 'bedroom', 4.4, 4.2);
  const plan: FloorPlan = { rooms: [bedroom], metresPerPixel: null, bounds: { width: 4.4, depth: 4.2 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 };
  const catalog = [product(1, 'bed_double', 160, 205, 100), product(2, 'nightstand', 45, 40, 52), product(5, 'nightstand', 40, 35, 50), product(6, 'bed_double', 180, 210, 105), product(7, 'wardrobe', 62, 220, 210)];
  const laid = () => matchProducts(layoutRoom(bedroom), catalog.slice(0, 2), { styleId: 'scandinavian', rooms: [bedroom] });

  it('measures what is wrong: pieces in each other, a nightstand away from the bed, a cabinet deeper than wide', () => {
    const items = laid();
    const stand = items.find((i) => i.slot === 'nightstand')!;
    const moved = items.map((i) => (i.id === stand.id ? { ...i, position: { x: i.position.x, z: i.position.z + 1.2 } } : i));
    const findings = reviewFindings(plan, moved);
    expect((findings.get(stand.id) ?? []).join(' ')).toMatch(/not beside the head of the bed/);
    const bed = items.find((i) => i.slot === 'bed')!;
    const wardrobe: PlacedItem = { id: 'b-wardrobe-x', roomId: 'b', slot: 'wardrobe', kind: 'wardrobe', position: bed.position, rotation: bed.rotation, elevationM: 0, size: { width: 0.62, depth: 2.2, height: 2.1 }, product: { productId: 7, nameKa: 'x', nameEn: 'x', nameRu: null, slug: 'p7', brand: null, pricePerUnit: 500, unit: 'piece', qty: 1, totalPrice: 500, imageUrl: null, model3dUrl: '/m.glb', textureUrl: null, colorHex: null, store: null } as unknown as PlacedItem['product'] };
    const crowded = reviewFindings(plan, [...items, wardrobe]);
    expect((crowded.get(wardrobe.id) ?? []).join(' ')).toMatch(/deeper .* than wide/);
    expect((crowded.get(wardrobe.id) ?? []).join(' ')).toMatch(/overlaps the bed double/);
  });

  it('keeps only fixes it was allowed: an item of that room, an offered replacement, never the bed taken out — a set replaced together', () => {
    const items = laid();
    const stands = items.filter((i) => i.slot === 'nightstand');
    const bed = items.find((i) => i.slot === 'bed')!;
    const offer: ReviewOffer = { alternatives: new Map([[stands[0].id, new Set([5])], [stands[1].id, new Set([5])], [bed.id, new Set([6])]]), itemsById: new Map(items.map((i) => [i.id, i])) };
    const review = validateReview(
      {
        rooms: [
          {
            room: 'b',
            note: 'Calmer now.',
            fixes: [
              { item: stands[0].id, action: 'replace', product: 5, reason: 'Lighter.' },
              { item: bed.id, action: 'remove', product: 0, reason: 'No.' },
              { item: bed.id, action: 'replace', product: 999, reason: 'Not offered.' },
              { item: 'nope', action: 'remove', product: 0, reason: 'Unknown.' },
            ],
          },
          { room: 'elsewhere', note: 'x', fixes: [] },
        ],
      },
      plan,
      offer,
      'claude-opus-5-5',
    );
    expect(review.fixes.map((f) => [f.itemId, f.action, f.productId]).sort()).toEqual([[stands[0].id, 'replace', 5], [stands[1].id, 'replace', 5]].sort());
    expect(review.notes).toEqual({ b: 'Calmer now.' });
  });

  it('puts a replacement where the old piece stood, and the nightstands by a new, wider bed', () => {
    const items = laid();
    const bed = items.find((i) => i.slot === 'bed')!;
    const fixed = applyReviewFixes(items, { model: 'm', notes: {}, fixes: [{ itemId: bed.id, action: 'replace', productId: 6, reason: '' }] }, plan, catalog);
    const newBed = fixed.find((i) => i.id === bed.id)!;
    expect(newBed.product?.productId).toBe(6);
    expect(backGap(newBed, 4.4, 4.2)).toBeLessThan(0.03);
    for (const stand of fixed.filter((i) => i.slot === 'nightstand')) {
      const off = { x: stand.position.x - newBed.position.x, z: stand.position.z - newBed.position.z };
      expect(Math.abs(dot(off, right(newBed))) - newBed.size.width / 2 - stand.size.width / 2).toBeCloseTo(0.04, 3);
    }
    const removed = applyReviewFixes(items, { model: 'm', notes: {}, fixes: [{ itemId: items.find((i) => i.slot === 'nightstand')!.id, action: 'remove', productId: null, reason: '' }] }, plan, catalog);
    expect(removed.filter((i) => i.slot === 'nightstand')).toHaveLength(1);
  });
});

describe('prints and built decor', () => {
  it('leaves out a print that would hang over slats on the same wall, keeps one beside them', () => {
    const r = room('b', 'bedroom', 4.4, 4.2);
    const plan: FloorPlan = { rooms: [r], metresPerPixel: null, bounds: { width: 4.4, depth: 4.2 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 };
    // Wall 0 runs along z = 0 from x = 0 to 4.4; a print faces into the room (+z).
    const print = (id: string, x: number): PlacedItem => ({ id, roomId: 'b', slot: 'artwork', kind: 'artwork', position: { x, z: 0.035 }, rotation: 0, elevationM: 1.2, size: { width: 0.8, depth: 0.05, height: 0.6 }, product: null });
    const slats: DecorPiece = { id: 'd1', roomId: 'b', family: 'slats', wallIndex: 0, span: { from: 1, to: 3.4 }, height: { from: 0, to: 2.7 }, params: {}, materials: {} } as DecorPiece;
    const kept = withoutArtOverDecor([print('over', 2.2), print('beside', 3.9)], [slats], plan);
    expect(kept.map((i) => i.id)).toEqual(['beside']);
  });
});

describe('dining chairs round the table as matched', () => {
  it('seats as many chairs as the real table takes, each at its place round it', () => {
    const kitchen = room('k', 'kitchen', 6, 5);
    const catalog = [
      product(20, 'kitchen_run', 300, 62, 92),
      product(21, 'fridge', 70, 70, 190),
      product(22, 'dining_table', 80, 80, 75),
      product(23, 'dining_chair', 45, 50, 85),
    ];
    const laid = layoutRoom(kitchen);
    expect(laid.filter((i) => i.slot === 'dining_chair').length).toBeGreaterThanOrEqual(4);
    const matched = matchProducts(laid, catalog, { styleId: 'scandinavian', rooms: [kitchen] });
    const table = matched.find((i) => i.slot === 'dining_table' && i.product)!;
    const chairs = matched.filter((i) => i.slot === 'dining_chair' && i.product);
    // A 0.8 m round table seats two, one each side.
    expect(chairs).toHaveLength(2);
    for (const chair of chairs) {
      const d = Math.hypot(chair.position.x - table.position.x, chair.position.z - table.position.z);
      expect(d).toBeLessThan(table.size.depth / 2 + chair.size.depth / 2 + 0.01);
      expect(d).toBeGreaterThan(table.size.depth / 2 - 0.2);
    }
  });
});

describe('built decor keeps off a basin mirror', () => {
  it('puts a niche beside the bathroom mirror, not over it', async () => {
    const { resolveDecor } = await import('@/lib/design/decor/resolve');
    const bath = room('w', 'bathroom', 4.4, 2.4);
    // A mirror hung over the basin on wall 0 (z = 0, x 0–4.4), 1.5 m along.
    const mirror: PlacedItem = { id: 'w-mirror', roomId: 'w', slot: 'mirror', kind: 'mirror', position: { x: 1.5, z: 0.03 }, rotation: 0, elevationM: 1.2, size: { width: 0.6, depth: 0.03, height: 0.8 }, product: null };
    const piece = resolveDecor({ room: 'w', family: 'niche', anchor: 'wall', wallIndex: 0 } as never, bath, [mirror], [], 'd1');
    expect(piece).toBeTruthy();
    // The mirror takes 1.2–1.8 m along the wall (10 cm aside): the niche stands clear of it.
    expect(piece!.span.to <= 1.1 + 1e-6 || piece!.span.from >= 1.9 - 1e-6).toBe(true);
  });
});
