import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { blocksWindow } from '@/lib/design/manipulate';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom, roomEdges as roomEdgesOf } from '@/lib/design/planGeometry';
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
    // Its middle at 1.5 m, its bottom over the basin.
    expect(mirror.elevationM + mirror.size.height / 2).toBeCloseTo(1.5, 5);
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
              { target: stands[0].id, action: 'replace', product: 5, wall: -1, reason: 'Lighter.' },
              { target: bed.id, action: 'remove', product: 0, wall: -1, reason: 'No.' },
              { target: bed.id, action: 'replace', product: 999, wall: -1, reason: 'Not offered.' },
              { target: 'nope', action: 'remove', product: 0, wall: -1, reason: 'Unknown.' },
              { target: bed.id, action: 'move_to_wall', product: 0, wall: 42, reason: 'No such wall.' },
            ],
          },
          { room: 'elsewhere', note: 'x', fixes: [] },
        ],
      },
      plan,
      offer,
      'claude-opus-5-5',
    );
    expect(review.fixes.map((f) => [f.target, f.action, f.productId]).sort()).toEqual([[stands[0].id, 'replace', 5], [stands[1].id, 'replace', 5]].sort());
    expect(review.notes).toEqual({ b: 'Calmer now.' });
  });

  it('puts a replacement where the old piece stood, and the nightstands by a new, wider bed', () => {
    const items = laid();
    const bed = items.find((i) => i.slot === 'bed')!;
    const fixed = applyReviewFixes(items, [], { model: 'm', notes: {}, fixes: [{ target: bed.id, action: 'replace', productId: 6, wallIndex: null, reason: '' }] }, plan, catalog).items;
    const newBed = fixed.find((i) => i.id === bed.id)!;
    expect(newBed.product?.productId).toBe(6);
    expect(backGap(newBed, 4.4, 4.2)).toBeLessThan(0.03);
    for (const stand of fixed.filter((i) => i.slot === 'nightstand')) {
      const off = { x: stand.position.x - newBed.position.x, z: stand.position.z - newBed.position.z };
      expect(Math.abs(dot(off, right(newBed))) - newBed.size.width / 2 - stand.size.width / 2).toBeCloseTo(0.04, 3);
    }
    const removed = applyReviewFixes(items, [], { model: 'm', notes: {}, fixes: [{ target: items.find((i) => i.slot === 'nightstand')!.id, action: 'remove', productId: null, wallIndex: null, reason: '' }] }, plan, catalog).items;
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

describe('the room tidied after generating and after the check', () => {
  const plan1 = (r: PlanRoom): FloorPlan => ({ rooms: [r], metresPerPixel: null, bounds: { width: 5, depth: 5 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 });
  const piece = (id: string, kind: string, slot: string, x: number, z: number, rotation: number, w: number, d: number, h: number, extra: Partial<PlacedItem> = {}): PlacedItem => ({ id, roomId: 'b', kind, slot: slot as PlacedItem['slot'], position: { x, z }, rotation, elevationM: 0, size: { width: w, depth: d, height: h }, product: { productId: 1 } as PlacedItem['product'], ...extra });

  it('puts a chest of drawers standing 48 cm off its wall back against it', async () => {
    const { settleToWalls } = await import('@/lib/design/aiProposal');
    const r = room('b', 'bedroom', 4.4, 4.2);
    // Wall 0 runs along z = 0; the chest faces into the room (+z), its back at z = 0.48.
    const chest = piece('chest', 'dresser', 'dresser', 1, 0.48 + 0.23, 0, 0.7, 0.46, 1.3);
    const [settled] = settleToWalls([chest], plan1(r));
    expect(settled.position.z - settled.size.depth / 2).toBeCloseTo(0.02, 5);
  });

  it('moves a bed off the headboard panel on its wall, by the panel\'s depth', async () => {
    const { clearOfDecor } = await import('@/lib/design/aiProposal');
    const r = room('b', 'bedroom', 4.4, 4.2);
    const bed = piece('bed', 'bed_double', 'bed', 2.2, 0.02 + 1.025, 0, 1.6, 2.05, 1.0);
    const panel = { id: 'd1', roomId: 'b', family: 'panel', wallIndex: 0, span: { from: 1, to: 3.4 }, height: { from: 0.35, to: 1.6 }, params: { style: 'upholstered', thicknessMm: 50 }, materials: {} } as unknown as DecorPiece;
    const [moved] = clearOfDecor([bed], [panel], plan1(r));
    expect(moved.position.z - moved.size.depth / 2).toBeGreaterThanOrEqual(0.05);
  });

  it('keeps a niche wall off the bath standing against that wall', async () => {
    const { resolveDecor } = await import('@/lib/design/decor/resolve');
    const r = room('b', 'bathroom', 4.4, 2.2);
    const bath = piece('bath', 'bathtub', 'bathtub', 1.2, 0.02 + 0.375, 0, 1.7, 0.75, 0.55);
    const niche = resolveDecor({ family: 'niche', anchor: 'wall', wallIndex: 0 } as never, r, [bath], [], 'n1');
    // The bath takes 0.35–2.05 m along wall 0 (5 cm aside): the niche stands clear of it, or not at all.
    if (niche) expect(niche.span.from >= 2.05 - 1e-6 || niche.span.to <= 0.35 + 1e-6).toBe(true);
  });

  it('lays kitchen tiles behind the run, from the worktop to the wall cabinets, and moves them with it', async () => {
    const { resolveDecor, reanchorDecor } = await import('@/lib/design/decor/resolve');
    const r = room('b', 'kitchen', 4, 4);
    const run = piece('run', 'kitchen_run', 'kitchen_run', 2, 0.02 + 0.31, 0, 2.8, 0.62, 0.92);
    const cabinets = piece('wall', 'kitchen_wall', 'kitchen_wall', 2, 0.01 + 0.175, 0, 2.8, 0.35, 0.72, { elevationM: 1.5 });
    // Asked for wall 1, a kitchen's tiles are its backsplash anyway.
    const tiles = resolveDecor({ family: 'tile', anchor: 'wall', wallIndex: 1 } as never, r, [run, cabinets], [], 't1')!;
    expect(tiles.wallIndex).toBe(0);
    expect(tiles.anchor).toBe('kitchen');
    expect(tiles.height).toEqual({ from: 0.92, to: 1.5 });
    // As long as the run: the wall cabinets hang above the tiles, not in their way.
    expect(tiles.span.to - tiles.span.from).toBeCloseTo(2.8, 3);
    // The run moved to wall 1 (x = 4, facing −x): the tiles follow it.
    const moved = { ...run, position: { x: 4 - 0.02 - 0.31, z: 2 }, rotation: -Math.PI / 2 };
    const [followed] = reanchorDecor([tiles], [moved], [r]);
    expect(followed.wallIndex).toBe(1);
  });

  it('hangs lamps and ceiling points under a lowered ceiling from it, not through it', async () => {
    const { underCeilingDecor } = await import('@/lib/design/aiProposal');
    const r = room('b', 'living_room', 5, 4);
    const cove = { id: 'c1', roomId: 'b', family: 'light', wallIndex: null, span: { from: 0, to: 0 }, height: { from: 2.5, to: 2.7 }, params: { path: 'cove' }, materials: {} } as unknown as DecorPiece;
    const lamp = piece('lamp', 'pendant', 'pendant', 2.5, 2, 0, 0.5, 0.5, 0.6, { elevationM: 2.1 });
    const point = { id: 'p1', roomId: 'b', kind: 'light_ceiling', position: { x: 2.5, z: 2 }, elevationM: 2.7 } as never;
    const out = underCeilingDecor([lamp], [point], [cove], plan1(r));
    // The panel's underside is 2.7 − 0.12 (the cove's drop) − 0.07 = 2.51 m.
    expect(out.items[0].elevationM + out.items[0].size.height).toBeLessThanOrEqual(2.51 + 1e-6);
    expect((out.electrical[0] as { elevationM: number }).elevationM).toBeCloseTo(2.505, 3);
  });

  it('never lets a tall piece stand across a window, a low one may', async () => {
    const { blocksWindow } = await import('@/lib/design/manipulate');
    const r = { ...room('b', 'bedroom', 4.4, 4.2), openings: [{ id: 'w', kind: 'window', wallIndex: 0, t: 0.5, widthM: 1.4, heightM: 1.4, sillM: 0.9, roomId: 'b', exterior: true }] } as PlanRoom;
    expect(blocksWindow(piece('ward', 'wardrobe', 'wardrobe', 2.2, 0.33, 0, 1.6, 0.62, 2.2), r)).toBe(true);
    expect(blocksWindow(piece('side', 'dresser', 'dresser', 2.2, 0.25, 0, 1.2, 0.45, 0.8), r)).toBe(false);
  });
});

describe('the check moves pieces and decor, and seats chairs round a new table', () => {
  const r = room('k', 'kitchen', 5, 4);
  const plan: FloorPlan = { rooms: [r], metresPerPixel: null, bounds: { width: 5, depth: 4 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 };
  const p = (id: string, kind: string, slot: string, x: number, z: number, rotation: number, w: number, d: number, h: number, productId = 1): PlacedItem => ({ id, roomId: 'k', kind, slot: slot as PlacedItem['slot'], position: { x, z }, rotation, elevationM: 0, size: { width: w, depth: d, height: h }, product: { productId, nameKa: 'x', pricePerUnit: 1, unit: 'piece', qty: 1, totalPrice: 1 } as PlacedItem['product'] });

  it('seats the chairs round a replaced bistro table and takes out the one it has no seat for', () => {
    const table = p('t', 'dining_table', 'dining_table', 2.5, 2, 0, 1.6, 0.9, 0.76);
    const chairs = [p('c1', 'dining_chair', 'dining_chair', 2.1, 1.3, 0, 0.45, 0.5, 0.85), p('c2', 'dining_chair', 'dining_chair', 2.9, 1.3, 0, 0.45, 0.5, 0.85), p('c3', 'dining_chair', 'dining_chair', 2.1, 2.7, Math.PI, 0.45, 0.5, 0.85)];
    const catalog = [product(7, 'dining_table', 70, 70, 76)];
    const { items } = applyReviewFixes([table, ...chairs], [], { model: 'm', notes: {}, fixes: [{ target: 't', action: 'replace', productId: 7, wallIndex: null, reason: '' }] }, plan, catalog);
    const seated = items.filter((i) => i.slot === 'dining_chair');
    const newTable = items.find((i) => i.slot === 'dining_table')!;
    expect(newTable.size.width).toBeCloseTo(0.7);
    expect(seated).toHaveLength(2);
    for (const c of seated) expect(Math.hypot(c.position.x - newTable.position.x, c.position.z - newTable.position.z)).toBeLessThan(0.6);
  });

  it('pushes a piece back to its wall, moves one to another wall, and moves or takes out decor', () => {
    const fridge = p('f', 'fridge', 'fridge', 4, 1, 0, 0.7, 0.7, 1.9);
    const tiles = { id: 'd1', roomId: 'k', family: 'tile', wallIndex: 2, span: { from: 1, to: 3 }, height: { from: 0, to: 1.2 }, params: {}, materials: {} } as unknown as DecorPiece;
    const slats = { id: 'd2', roomId: 'k', family: 'slats', wallIndex: 1, span: { from: 1, to: 2 }, height: { from: 0, to: 2.7 }, params: {}, materials: {} } as unknown as DecorPiece;
    const back = applyReviewFixes([fridge], [tiles, slats], { model: 'm', notes: {}, fixes: [{ target: 'f', action: 'to_wall', productId: null, wallIndex: null, reason: '' }, { target: 'd2', action: 'remove_decor', productId: null, wallIndex: null, reason: '' }, { target: 'd1', action: 'decor_to_wall', productId: null, wallIndex: 0, reason: '' }] }, plan, []);
    expect(back.items[0].position.z - back.items[0].size.depth / 2).toBeCloseTo(0.02, 3);
    expect(back.decor.map((d) => d.id)).toEqual(['d1']);
    expect(back.decor[0].wallIndex).toBe(0);
    // Wall 1 is x = 5, facing −x.
    const moved = applyReviewFixes([fridge], [], { model: 'm', notes: {}, fixes: [{ target: 'f', action: 'move_to_wall', productId: null, wallIndex: 1, reason: '' }] }, plan, []).items[0];
    expect(moved.rotation).toBeCloseTo(-Math.PI / 2, 5);
    expect(moved.position.x + moved.size.depth / 2).toBeCloseTo(5 - 0.02, 3);
  });
});

describe('hanging lamps hang by their length', () => {
  it('hangs a pendant from the ceiling, and only one short enough to clear a head', () => {
    const living = room('l', 'living_room', 5, 4);
    const laid = layoutRoom(living).filter((i) => i.slot === 'pendant');
    const catalog = [product(30, 'pendant', 40, 40, 110), product(31, 'pendant', 40, 40, 60)];
    const [lamp] = matchProducts(laid, catalog, { styleId: 'scandinavian', rooms: [living] });
    expect(lamp.product?.productId).toBe(31);
    expect(lamp.elevationM + lamp.size.height).toBeCloseTo(2.7, 5);
  });
});

describe('a wall mirror swapped in for a floor mirror', () => {
  it('hangs on the wall, not on the floor where the floor mirror stood', () => {
    const hall = room('h', 'hallway', 4, 1.8);
    const plan: FloorPlan = { rooms: [hall], metresPerPixel: null, bounds: { width: 4, depth: 1.8 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 };
    const floorMirror: PlacedItem = { id: 'm', roomId: 'h', kind: 'mirror', slot: 'mirror', position: { x: 2, z: 0.3 }, rotation: 0, elevationM: 0, size: { width: 0.59, depth: 0.5, height: 1.64 }, product: { productId: 14 } as PlacedItem['product'] };
    const { items } = applyReviewFixes([floorMirror], [], { model: 'm', notes: {}, fixes: [{ target: 'm', action: 'replace', productId: 13, wallIndex: null, reason: '' }] }, plan, [product(13, 'mirror', 60, 3, 80)]);
    expect(items[0].elevationM + items[0].size.height / 2).toBeCloseTo(1.5, 5);
  });
});

describe('a desk in front of slats', () => {
  it('moves off the slats with its chair tucked under it', async () => {
    const { clearOfDecor } = await import('@/lib/design/aiProposal');
    const office = room('o', 'office', 3.4, 2.6);
    const plan: FloorPlan = { rooms: [office], metresPerPixel: null, bounds: { width: 3.4, depth: 2.6 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 };
    const desk: PlacedItem = { id: 'desk', roomId: 'o', kind: 'desk', slot: 'desk', position: { x: 1.7, z: 0.015 + 0.375 }, rotation: 0, elevationM: 0, size: { width: 1.58, depth: 0.75, height: 0.75 }, product: { productId: 1 } as PlacedItem['product'] };
    const chair: PlacedItem = { id: 'chair', roomId: 'o', kind: 'office_chair', slot: 'office_chair', position: { x: 1.7, z: 0.39 + 0.375 + 0.335 - 0.18 }, rotation: Math.PI, elevationM: 0, size: { width: 0.67, depth: 0.67, height: 0.8 }, product: { productId: 2 } as PlacedItem['product'] };
    const slats = { id: 's', roomId: 'o', family: 'slats', wallIndex: 0, span: { from: 0.5, to: 2.9 }, height: { from: 0, to: 2.7 }, params: {}, materials: {} } as unknown as DecorPiece;
    const [d, c] = clearOfDecor([desk, chair], [slats], plan);
    expect(d.position.z - d.size.depth / 2).toBeGreaterThanOrEqual(0.034);
    expect(c.position.z - chair.position.z).toBeCloseTo(d.position.z - desk.position.z, 6);
  });
});

describe('decor that follows a piece the check moved', () => {
  it('goes with the desk to its new wall, and the desk stands clear of it there', () => {
    const office = room('o', 'office', 3.4, 2.6);
    const plan: FloorPlan = { rooms: [office], metresPerPixel: null, bounds: { width: 3.4, depth: 2.6 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 };
    const desk: PlacedItem = { id: 'desk', roomId: 'o', kind: 'desk', slot: 'desk', position: { x: 1.7, z: 0.02 + 0.225 }, rotation: 0, elevationM: 0, size: { width: 1.18, depth: 0.45, height: 0.74 }, product: { productId: 1 } as PlacedItem['product'] };
    const panel = { id: 'p', roomId: 'o', family: 'panel', anchor: 'desk', wallIndex: 0, span: { from: 1.2, to: 2.2 }, height: { from: 0, to: 2.7 }, params: { style: 'fluted' }, materials: {} } as unknown as DecorPiece;
    // Wall 1 is x = 3.4.
    const out = applyReviewFixes([desk], [panel], { model: 'm', notes: {}, fixes: [{ target: 'desk', action: 'move_to_wall', productId: null, wallIndex: 1, reason: '' }] }, plan, []);
    expect(out.decor[0].wallIndex).toBe(1);
    const moved = out.items[0];
    expect(3.4 - (moved.position.x + moved.size.depth / 2)).toBeGreaterThanOrEqual(0.03);
  });
});

describe('the desk chair under the desk', () => {
  it('lays it out and matches it with its seat under the desk, and the studio lets it stand there', async () => {
    const { isPlacementValid, tucksUnder } = await import('@/lib/design/manipulate');
    expect(tucksUnder({ kind: 'office_chair' }, { kind: 'desk' })).toBe(true);
    expect(tucksUnder({ kind: 'desk' }, { kind: 'office_chair' })).toBe(true);
    expect(tucksUnder({ kind: 'office_chair' }, { kind: 'dining_table' })).toBe(false);
    const office = room('o', 'office', 3.4, 2.6);
    const items = matchProducts(layoutRoom(office), [product(1, 'desk', 140, 60, 75), product(2, 'office_chair', 74, 76, 96)], { styleId: 'scandinavian', rooms: [office] });
    const desk = items.find((i) => i.slot === 'desk')!;
    const chair = items.find((i) => i.slot === 'office_chair')!;
    expect(chair.product?.productId).toBe(2);
    const off = { x: chair.position.x - desk.position.x, z: chair.position.z - desk.position.z };
    // 18 cm of the chair under the desk's front edge, as the rule says (it used to stand 7–10 cm off it).
    expect(dot(off, forward(desk)) - desk.size.depth / 2 - chair.size.depth / 2).toBeCloseTo(-0.18, 2);
    expect(isPlacementValid(office, chair, items)).toBe(true);
  });
});

describe('a double bed and its nightstands', () => {
  // 335's first bedroom: the hallway door on the east wall, 0.94 m from the corner of the bed's wall.
  const bedroom = refreshRoom({
    id: 'b',
    type: 'bedroom',
    name: 'b',
    polygon: [{ x: 0, z: 0 }, { x: 4.74, z: 0 }, { x: 4.74, z: 4.28 }, { x: 0, z: 4.28 }],
    heightM: 2.8,
    areaM2: 0,
    perimeterM: 0,
    openings: [
      { id: 'd1', kind: 'door', wallIndex: 1, t: 0.78, widthM: 0.85, heightM: 2.05, sillM: 0, roomId: 'b', exterior: false },
      { id: 'd2', kind: 'door', wallIndex: 0, t: 0.53, widthM: 0.9, heightM: 2.2, sillM: 0, roomId: 'b', exterior: true },
      { id: 'w1', kind: 'window', wallIndex: 3, t: 0.5, widthM: 1.6, heightM: 1.4, sillM: 0.9, roomId: 'b', exterior: true },
    ],
  });

  it('leaves room to walk past either side of the bed, whatever the draw', async () => {
    const { tightSpots } = await import('@/lib/design/clearance');
    const { seededRng } = await import('@/lib/design/random');
    for (let seed = 1; seed <= 12; seed++) {
      const items = layoutRoom(bedroom, { rng: seededRng(seed) });
      const bed = items.find((i) => i.slot === 'bed')!;
      expect(items.filter((i) => i.slot === 'nightstand')).toHaveLength(2);
      expect(tightSpots(bedroom, items).find((t) => t.itemId === bed.id && t.against === 'wall')).toBeUndefined();
    }
  });

  it('keeps the bed near the middle of its wall, whatever the draw', async () => {
    const { seededRng } = await import('@/lib/design/random');
    // 335's second bedroom: windows on the west and north walls, the door on the east wall.
    const second = refreshRoom({
      id: 'b2',
      type: 'bedroom',
      name: 'b2',
      polygon: [{ x: 4.74, z: 3.34 }, { x: 0, z: 3.34 }, { x: 0, z: 0 }, { x: 4.74, z: 0 }],
      heightM: 2.8,
      areaM2: 0,
      perimeterM: 0,
      openings: [
        { id: 'w1', kind: 'window', wallIndex: 1, t: 0.51, widthM: 1.4, heightM: 1.4, sillM: 0.9, roomId: 'b2', exterior: true },
        { id: 'w0', kind: 'window', wallIndex: 0, t: 0.49, widthM: 1.4, heightM: 1.4, sillM: 0.9, roomId: 'b2', exterior: true },
        { id: 'd', kind: 'door', wallIndex: 3, t: 0.46, widthM: 0.85, heightM: 2.05, sillM: 0, roomId: 'b2', exterior: false },
      ],
    });
    for (let seed = 1; seed <= 12; seed++) {
      const bed = layoutRoom(second, { rng: seededRng(seed) }).find((i) => i.slot === 'bed')!;
      // On the wall at z = 0 (4.74 m), its middle at x = 2.37.
      expect(Math.abs(bed.position.x - 2.37)).toBeLessThanOrEqual(0.3);
    }
  });

  it('puts one product on both nightstands when the room\'s did not fit one side', async () => {
    const { pairsAlike, toSceneProduct } = await import('@/lib/design/matcher');
    const wide = product(11, 'nightstand', 58, 44, 42);
    const narrow = product(12, 'nightstand', 45, 38, 55);
    const bed: PlacedItem = { id: 'bed', roomId: 'b', kind: 'bed_double', slot: 'bed', position: { x: 0.5 + 0.8, z: 0.02 + 1.025 }, rotation: 0, elevationM: 0, size: { width: 1.6, depth: 2.05, height: 1 }, product: toSceneProduct(product(1, 'bed_double', 160, 205, 100), 1) };
    const stand = (id: string, p: CatalogProduct, side: number): PlacedItem => {
      const size = { width: p.widthCm! / 100, depth: p.depthCm! / 100, height: p.heightCm! / 100 };
      return { id, roomId: 'b', kind: 'nightstand', slot: 'nightstand', position: { x: 1.3 + side * (0.8 + 0.04 + size.width / 2), z: 0.02 + size.depth / 2 }, rotation: 0, elevationM: 0, size, product: toSceneProduct(p, 1) };
    };
    // 50 cm between the bed and the west wall: the 58 cm nightstand only fitted the east side.
    const items = [bed, stand('s1', narrow, -1), stand('s2', wide, 1)];
    const out = pairsAlike(items, [wide, narrow], new Map([['b', bedroom]]));
    const stands = out.filter((i) => i.slot === 'nightstand');
    expect(stands.map((s) => s.product?.productId)).toEqual([12, 12]);
    for (const s of stands) expect(Math.abs(s.position.x - 1.3) - 0.8 - s.size.width / 2).toBeCloseTo(0.04, 5);
  });

  it('has the check replace both nightstands together, each beside the bed', () => {
    const plan: FloorPlan = { rooms: [bedroom], metresPerPixel: null, bounds: { width: 4.74, depth: 4.28 }, source: 'sample', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8 };
    const catalog = [product(1, 'bed_double', 160, 205, 100), product(2, 'nightstand', 45, 40, 52), product(5, 'nightstand', 52, 36, 50)];
    const items = matchProducts(layoutRoom(bedroom), catalog.slice(0, 2), { styleId: 'scandinavian', rooms: [bedroom] });
    const stands = items.filter((i) => i.slot === 'nightstand');
    const fixed = applyReviewFixes(items, [], { model: 'm', notes: {}, fixes: [{ target: stands[0].id, action: 'replace', productId: 5, wallIndex: null, reason: '' }] }, plan, catalog).items;
    const bed = fixed.find((i) => i.slot === 'bed')!;
    const after = fixed.filter((i) => i.slot === 'nightstand');
    expect(after.map((s) => s.product?.productId)).toEqual([5, 5]);
    for (const s of after) {
      const off = { x: s.position.x - bed.position.x, z: s.position.z - bed.position.z };
      expect(Math.abs(dot(off, right(bed))) - bed.size.width / 2 - s.size.width / 2).toBeCloseTo(0.04, 3);
    }
  });
});

describe('a small kitchen on one wall', () => {
  const kitchen = (w: number, d: number): PlanRoom =>
    refreshRoom({
      id: 'k',
      type: 'kitchen',
      name: 'k',
      polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }],
      heightM: 2.7,
      areaM2: 0,
      perimeterM: 0,
      openings: [{ id: 'a', kind: 'archway', wallIndex: 2, t: 0.5, widthM: 1.2, heightM: 2.1, sillM: 0, roomId: 'k', exterior: false }],
    });

  it('runs the units from a corner, the fridge at their end and the wall cabinets over the units only', async () => {
    const { seededRng } = await import('@/lib/design/random');
    // In a 2.6 × 3.4 kitchen the archway's approach takes the end of the run's wall: the fridge
    // goes on another wall there, and the cabinets still hang over the run alone.
    for (const [w, d, together] of [[3, 2.6, true], [3.94, 3.94, true], [4, 3, true], [2.6, 3.4, false]] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const r = kitchen(w, d);
        const items = layoutRoom(r, { rng: seededRng(seed) });
        const run = items.find((i) => i.slot === 'kitchen_run')!;
        const fridge = items.find((i) => i.slot === 'fridge')!;
        const cabinets = items.find((i) => i.slot === 'kitchen_wall')!;
        if (together) {
          // On the run's wall, hard against its end, backs in line.
          expect(fridge.rotation).toBeCloseTo(run.rotation, 5);
          const off = { x: fridge.position.x - run.position.x, z: fridge.position.z - run.position.z };
          expect(Math.abs(dot(off, right(run))) - run.size.width / 2 - fridge.size.width / 2).toBeCloseTo(0.02, 5);
          expect(dot(off, forward(run))).toBeCloseTo((fridge.size.depth - run.size.depth) / 2, 5);
        }
        // The cabinets over the run, not over the fridge.
        expect(cabinets.rotation).toBeCloseTo(run.rotation, 5);
        const c = { x: cabinets.position.x - run.position.x, z: cabinets.position.z - run.position.z };
        expect(Math.abs(dot(c, right(run))) + cabinets.size.width / 2).toBeLessThanOrEqual(run.size.width / 2 + 1e-6);
      }
    }
  });

  it('keeps a real fridge of another width against the end of the run', () => {
    const r = kitchen(3, 2.6);
    const items = matchProducts(layoutRoom(r), [product(3, 'fridge', 60, 65, 185)], { styleId: 'scandinavian', rooms: [r] });
    const run = items.find((i) => i.slot === 'kitchen_run')!;
    const fridge = items.find((i) => i.slot === 'fridge')!;
    expect(fridge.product?.productId).toBe(3);
    const off = { x: fridge.position.x - run.position.x, z: fridge.position.z - run.position.z };
    expect(Math.abs(dot(off, right(run))) - run.size.width / 2 - fridge.size.width / 2).toBeCloseTo(0.02, 5);
    expect(dot(off, forward(run))).toBeCloseTo((fridge.size.depth - run.size.depth) / 2, 5);
  });

  it('makes a slab on the run\'s wall the backsplash, as long as the run whatever width was asked', async () => {
    const { resolveDecor } = await import('@/lib/design/decor/resolve');
    const r = kitchen(4, 4);
    const run: PlacedItem = { id: 'run', roomId: 'k', kind: 'kitchen_run', slot: 'kitchen_run', position: { x: 1.3, z: 0.02 + 0.31 }, rotation: 0, elevationM: 0, size: { width: 2.55, depth: 0.62, height: 0.92 }, product: { productId: 1 } as PlacedItem['product'] };
    const slab = resolveDecor({ family: 'slab', anchor: 'wall', wallIndex: 0, widthM: 1.2, heightFromM: 0.92, heightToM: 1.5 } as never, r, [run], [], 's1')!;
    expect(slab.anchor).toBe('kitchen');
    expect(slab.span.to - slab.span.from).toBeCloseTo(2.55, 3);
    // A slab floor to ceiling on another wall stays the feature wall it was asked to be.
    const feature = resolveDecor({ family: 'slab', anchor: 'wall', wallIndex: 1, widthM: 0, heightFromM: 0, heightToM: 2.7 } as never, r, [run], [], 's2')!;
    expect(feature.anchor).toBe('wall');
    expect(feature.wallIndex).toBe(1);
  });

  it('lets wall cabinets hang over the units but not over the fridge', async () => {
    const { hangOnWall } = await import('@/lib/design/manipulate');
    const r = kitchen(4, 3);
    const items = layoutRoom(r, { rng: (await import('@/lib/design/random')).seededRng(3) });
    const run = items.find((i) => i.slot === 'kitchen_run')!;
    const fridge = items.find((i) => i.slot === 'fridge')!;
    const cabinets = { ...items.find((i) => i.slot === 'kitchen_wall')!, size: { width: 0.8, depth: 0.35, height: 0.72 } };
    const wall = roomEdgesOf(r.polygon).find((e) => Math.abs(Math.atan2(Math.sin(e.facing - run.rotation), Math.cos(e.facing - run.rotation))) < 0.01)!;
    const over = (p: PlacedItem) => hangOnWall(r, cabinets, wall.index, p.position, 1.86, items)!;
    expect(over(run).valid).toBe(true);
    expect(over(fridge).valid).toBe(false);
  });
});

describe('a TV over the TV unit', () => {
  // The door on a side wall near a corner, so the wall the sofa faces is free for the TV unit.
  const living = refreshRoom({
    ...room('l', 'living_room', 5.2, 4.4),
    openings: [{ id: 'l-door', kind: 'door', wallIndex: 1, t: 0.85, widthM: 0.85, heightM: 2.05, sillM: 0, roomId: 'l', exterior: true }],
  });
  const unitProduct = product(20, 'tv_unit', 160, 40, 50);
  const standing = product(21, 'tv', 123, 29, 81);
  const flat = product(22, 'tv', 145, 5, 82);
  const tooWide = product(23, 'tv', 190, 30, 110);

  it('lays a TV slot out over the unit, and none in a room without one', () => {
    const items = layoutRoom(living);
    const unit = items.find((i) => i.slot === 'tv_unit')!;
    const tv = items.find((i) => i.slot === 'tv')!;
    expect(Math.cos(tv.rotation - unit.rotation)).toBeCloseTo(1, 5);
    const off = { x: tv.position.x - unit.position.x, z: tv.position.z - unit.position.z };
    expect(Math.abs(dot(off, right(unit)))).toBeLessThan(0.01);
    expect(tv.elevationM).toBeGreaterThan(unit.size.height);
    expect(layoutRoom(room('b', 'bedroom', 4.4, 4.2)).some((i) => i.slot === 'tv')).toBe(false);
  });

  it('stands a TV on its stand on the unit\'s top, in the middle of it front to back', () => {
    const items = matchProducts(layoutRoom(living), [unitProduct, standing], { styleId: 'scandinavian', rooms: [living] });
    const unit = items.find((i) => i.slot === 'tv_unit')!;
    const tv = items.find((i) => i.slot === 'tv')!;
    expect(tv.product?.productId).toBe(21);
    expect(tv.elevationM).toBeCloseTo(0.5, 5);
    const off = { x: tv.position.x - unit.position.x, z: tv.position.z - unit.position.z };
    expect(dot(off, forward(unit))).toBeCloseTo(0, 5);
  });

  it('hangs a flat TV on the wall over the unit, clear of it, and never stands one wider than the unit on it', () => {
    const items = matchProducts(layoutRoom(living), [unitProduct, flat, tooWide], { styleId: 'scandinavian', rooms: [living] });
    const unit = items.find((i) => i.slot === 'tv_unit')!;
    const tv = items.find((i) => i.slot === 'tv')!;
    expect(tv.product?.productId).toBe(22);
    expect(tv.elevationM).toBeGreaterThanOrEqual(unit.size.height + 0.12);
    expect(backGap(tv, 5.2, 4.4)).toBeLessThan(0.02);
  });

  it('swaps between the two in the studio: onto the unit, then onto the wall', async () => {
    const { applySwap, rehung } = await import('@/lib/design/matcher');
    const items = matchProducts(layoutRoom(living), [unitProduct, flat], { styleId: 'scandinavian', rooms: [living] });
    const tv = items.find((i) => i.slot === 'tv')!;
    const others = items.filter((i) => i.id !== tv.id);
    const onUnit = rehung(tv, applySwap([tv], tv.id, standing)[0], standing, others);
    expect(onUnit.elevationM).toBeCloseTo(0.5, 5);
    const back = rehung(onUnit, applySwap([onUnit], tv.id, flat)[0], flat, others);
    expect(back.elevationM).toBeGreaterThanOrEqual(0.62);
    expect(backGap(back, 5.2, 4.4)).toBeLessThan(0.02);
  });
});

describe('what the generation of 20 Oct got wrong', () => {
  it('keeps decor that follows a desk off the window the desk stands under', async () => {
    const { reanchorDecor } = await import('@/lib/design/decor/resolve');
    // A 3.28 m office wall with a 1.2 m window in its middle; the desk stands under it.
    const office = refreshRoom({
      ...room('o', 'office', 3.28, 2.54),
      openings: [{ id: 'w', kind: 'window', wallIndex: 0, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9, roomId: 'o', exterior: true }],
    });
    const desk: PlacedItem = { id: 'desk', roomId: 'o', kind: 'desk', slot: 'desk', position: { x: 1.4, z: 0.02 + 0.225 }, rotation: 0, elevationM: 0, size: { width: 1.18, depth: 0.45, height: 0.74 }, product: { productId: 1 } as PlacedItem['product'] };
    const slats = { id: 's', roomId: 'o', family: 'slats', anchor: 'desk', wallIndex: 0, span: { from: 2.4, to: 3.2 }, height: { from: 0, to: 2.8 }, params: {}, materials: {} } as unknown as DecorPiece;
    const [moved] = reanchorDecor([slats], [desk], [office]);
    // The window takes 1.04–2.24 m along the wall (10 cm aside): the slats stand beside it.
    expect(moved.span.to <= 0.94 + 1e-6 || moved.span.from >= 2.34 - 1e-6).toBe(true);
  });

  it('slides or shrinks the TV along its unit off a window beside it', () => {
    const living = refreshRoom({
      ...room('l', 'living_room', 5.2, 4.4),
      openings: [
        { id: 'd', kind: 'door', wallIndex: 1, t: 0.85, widthM: 0.85, heightM: 2.05, sillM: 0, roomId: 'l', exterior: true },
        // On the wall the TV unit goes on (z = 4.4), just left of its middle.
        { id: 'w', kind: 'window', wallIndex: 2, t: 0.72, widthM: 1.4, heightM: 1.4, sillM: 0.9, roomId: 'l', exterior: true },
      ],
    });
    const items = layoutRoom(living);
    const unit = items.find((i) => i.slot === 'tv_unit')!;
    const tv = items.find((i) => i.slot === 'tv')!;
    expect(unit).toBeDefined();
    expect(tv).toBeDefined();
    // Wall 2 runs from (5.2, 4.4) to (0, 4.4): the window takes x 0.756–2.156. The sofa now looks
    // for a wall to face that is not a window wall (the owner's notes), so the TV is on that wall
    // only when nothing better was found — and then off the window.
    if (Math.abs(tv.position.z - 4.4) < 0.3) {
      expect(tv.position.x - tv.size.width / 2 >= 2.156 - 1e-6 || tv.position.x + tv.size.width / 2 <= 0.756 + 1e-6).toBe(true);
      expect(Math.abs(tv.position.x - unit.position.x) + tv.size.width / 2).toBeLessThanOrEqual(unit.size.width / 2 + 1e-6);
    }
    expect(blocksWindow({ ...tv, size: { ...tv.size, height: 1.5 } }, living)).toBe(false);
  });

  it('never takes a range cooker for the kitchen run', async () => {
    const { seededRng } = await import('@/lib/design/random');
    const kitchen = room('k', 'kitchen', 4, 3);
    const material = product(30, 'kitchen_run', 0, 0, 0, { slug: 'kitchen-material-mdf', categorySlug: 'kitchen-custom', unit: 'm2', widthCm: null, depthCm: null, heightCm: null });
    const range = product(31, 'kitchen_run', 166, 67, 80, { categorySlug: 'kitchen-units' });
    const cooker = product(32, 'kitchen_run', 126, 77, 93, { categorySlug: 'kitchen-units' });
    for (let seed = 1; seed <= 12; seed++) {
      const items = matchProducts(layoutRoom(kitchen), [material, range, cooker], { styleId: 'scandinavian', rooms: [kitchen], rng: seededRng(seed) });
      expect(items.find((i) => i.slot === 'kitchen_run')?.product?.productId).toBe(30);
    }
  });
});

describe('sets and free-standing units', () => {
  it('seats one product round a table: a seat the set\'s chair does not fit stays empty', async () => {
    const { seededRng } = await import('@/lib/design/random');
    const kitchen = room('k', 'kitchen', 4, 3.6);
    const table = product(40, 'dining_table', 140, 80, 75);
    const wide = product(41, 'dining_chair', 70, 66, 100);
    const stool = product(42, 'dining_chair', 40, 40, 65);
    for (let seed = 1; seed <= 8; seed++) {
      const items = matchProducts(layoutRoom(kitchen), [table, wide, stool], { styleId: 'scandinavian', rooms: [kitchen], rng: seededRng(seed) });
      const chairs = items.filter((i) => i.slot === 'dining_chair' && i.product);
      expect(new Set(chairs.map((c) => c.product!.productId)).size).toBeLessThanOrEqual(1);
    }
  });

  it('stands a TV on its stand on a unit standing free in the room, and never a flat one there', () => {
    const living = room('l', 'living_room', 6, 5);
    const unit: PlacedItem = { id: 'u', roomId: 'l', kind: 'tv_unit', slot: 'tv_unit', position: { x: 3, z: 2.5 }, rotation: 0, elevationM: 0, size: { width: 1.6, depth: 0.4, height: 0.5 }, product: null };
    // The TV slot the layout gives such a unit: on its top, in the middle.
    const slot: PlacedItem = { id: 't', roomId: 'l', kind: 'tv', slot: 'tv', position: { x: 3, z: 2.5 }, rotation: 0, elevationM: 0.5, size: { width: 1.45, depth: 0.08, height: 0.82 }, product: null };
    const standing = product(21, 'tv', 123, 29, 81);
    const flat = product(22, 'tv', 123, 5, 75);
    const items = matchProducts([unit, slot], [product(20, 'tv_unit', 160, 40, 50), standing, flat], { styleId: 'scandinavian', rooms: [living] });
    const tv = items.find((i) => i.slot === 'tv')!;
    expect(tv.product?.productId).toBe(21);
    expect(tv.elevationM).toBeCloseTo(0.5, 5);
    expect(tv.position.z).toBeCloseTo(2.5, 5);
  });
});
