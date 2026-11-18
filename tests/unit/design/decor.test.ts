import { describe, expect, it } from 'vitest';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import { matchProducts } from '@/lib/design/matcher';
import { priceScene } from '@/lib/design/pricing';
import type { DecorPiece, DesignScene, FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';
import { decorWall, fitMoulding, fitNiche, fitSlats, freeSpans } from '@/lib/design/decor/layout';
import { decorPurchases, decorUses, piecePurchases, quantityIn } from '@/lib/design/decor/quantities';
import { decorMaterialFrom, defaultHeight, resolveDecor, resolveRoomDecor, sanitizeParams, wallBehind } from '@/lib/design/decor/resolve';
import { decorMaterialKind, isDecorMaterial } from '@/lib/design/decor/materials';
import { proposalDecor, proposalFinish, proposalPicks } from '@/lib/design/aiProposal';
import { generateScene } from '@/lib/design/generateScene';
import { getStyle } from '@/lib/design/styles';
import { tickFor } from '@/lib/design/ticks';
import { buildBrief, DESIGN_PROMPT, listText, MAX_DECOR_PER_ROOM, maxDecor, validateProposal, type Offer } from '@/lib/design/aiDesign';
import { REVIEW_PROMPT } from '@/lib/design/aiReview';
import { BASIN_TOP_M, BLIND_ROOMS, KITCHEN_CIRCULATION_M, NEUTRAL_LIGHT_K, SHALLOW_WARDROBE_DEPTH_M, SHOWER_MIN_M, WARDROBE_DEPTH_M, WARM_LIGHT_K } from '@/lib/design/rules';

function room(openings: PlanRoom['openings'] = [], polygon = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3.5 }, { x: 0, z: 3.5 }]): PlanRoom {
  return refreshRoom({ id: 'r1', type: 'bedroom', name: 'Bedroom', polygon, heightM: 2.7, areaM2: 0, perimeterM: 0, openings });
}

/** The edge whose inside faces +z: the wall along z = 0. */
const northIndex = (r: PlanRoom) => roomEdges(r.polygon).find((e) => e.inward.z > 0.5)!.index;

function material(id: number, kind: string, unit: 'm2' | 'linear_m' | 'piece', price: number, specs: Record<string, unknown> = {}): CatalogProduct {
  return {
    id,
    nameKa: `m${id}`,
    nameEn: `material ${id}`,
    slug: `decor-${kind}-${id}`,
    brand: null,
    categorySlug: `decor-${kind}`,
    pricePerUnit: price,
    unit,
    imageUrl: null,
    colorHex: '#C9A177',
    textureUrl: null,
    model3dKind: null,
    model3dUrl: null,
    widthCm: null,
    depthCm: null,
    heightCm: null,
    styleTags: ['modern'],
    tags: [],
    isFeatured: false,
    specs,
    coveragePerUnit: null,
    store: { id: 9, nameKa: 'Decor Workshop' } as CatalogProduct['store'],
  };
}

const OAK = material(1, 'wood', 'm2', 185, { textureScaleM: 1 });
const OAK_BY_METRE = material(2, 'wood', 'linear_m', 9);
const FELT = material(3, 'board', 'm2', 48);
const LED = material(4, 'led', 'linear_m', 38, { cct: 2700 });
const MOULD = material(5, 'moulding', 'linear_m', 22, { tintable: true, profileMm: 32 });
const GYPSUM = material(6, 'gypsum', 'm2', 95, { tintable: true });
const MARBLE = material(7, 'stone', 'm2', 420);
const CATALOG = [OAK, OAK_BY_METRE, FELT, LED, MOULD, GYPSUM, MARBLE];

function bed(r: PlanRoom): PlacedItem {
  return {
    id: 'bed-1',
    roomId: r.id,
    slot: 'bed',
    kind: 'bed_double',
    position: { x: 2, z: 1.06 },
    elevationM: 0,
    rotation: 0,
    size: { width: 1.6, depth: 2.1, height: 1 },
    product: { productId: 100, nameKa: 'bed', slug: 'bed', brand: null, pricePerUnit: 1000, unit: 'piece', qty: 1, totalPrice: 1000, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/m.glb', categorySlug: 'beds', store: null },
  };
}

describe('decor materials', () => {
  it('knows a material by its sub-category and a unit the budget can measure', () => {
    expect(decorMaterialKind(OAK)).toBe('wood');
    expect(isDecorMaterial(OAK)).toBe(true);
    expect(isDecorMaterial({ ...OAK, unit: 'liter' })).toBe(false);
    expect(isDecorMaterial({ ...OAK, categorySlug: 'decor' })).toBe(false);
  });
});

describe('fitting decor to a wall', () => {
  const r = room();
  const piece = (over: Partial<DecorPiece> = {}): DecorPiece => ({ id: 'd1', roomId: r.id, family: 'slats', wallIndex: northIndex(r), span: { from: 0.5, to: 3.5 }, height: { from: 1, to: 2.5 }, params: {}, materials: {}, ...over });

  it('repeats a real slat section a whole number of times, the remainder centred', () => {
    const wall = decorWall(piece(), r)!;
    const fit = fitSlats({ slatWidthMm: 40, gapMm: 20 }, wall);
    // (3 + 0.02) / 0.06 → 50 slats.
    expect(fit.xs).toHaveLength(50);
    const left = fit.xs[0] - 0.02 - wall.x0;
    const right = wall.x1 - (fit.xs[fit.xs.length - 1] + 0.02);
    expect(left).toBeCloseTo(right, 6);
  });

  it('clips a stretch to the wall and refuses one too small to build', () => {
    expect(decorWall(piece({ span: { from: 3.95, to: 9 } }), r)).toBeNull();
    expect(decorWall(piece({ span: { from: 3, to: 9 } }), r)!.x1).toBeCloseTo(4, 6);
  });

  it('frames whole bays around a door, never across it', () => {
    const withDoor = room([{ id: 'door', kind: 'door', wallIndex: 0, t: 0.5, widthM: 0.9, heightM: 2.1, sillM: 0, roomId: 'r1', exterior: false }]);
    const edge = roomEdges(withDoor.polygon)[0];
    const wall = decorWall({ wallIndex: 0, span: { from: 0, to: edge.length }, height: { from: 0, to: 2.7 } }, withDoor)!;
    const fit = fitMoulding({}, wall, withDoor.openings);
    const doorFrom = edge.length / 2 - 0.45;
    const doorTo = edge.length / 2 + 0.45;
    for (const f of fit.frames.filter((fr) => fr.y < 2.1)) expect(f.x + f.w <= doorFrom || f.x >= doorTo).toBe(true);
    expect(fit.rails.every((rail) => rail.x1 <= doorFrom + 0.01 || rail.x0 >= doorTo - 0.01)).toBe(true);
    expect(fit.profileM).toBeGreaterThan(5);
    expect(freeSpans(edge, withDoor.openings, 0, edge.length, 0.06)).toHaveLength(2);
  });

  it('puts a pair of niches either side of a mantel and measures the build-out', () => {
    const wide = room([], [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }]);
    const wall = decorWall({ wallIndex: northIndex(wide), span: { from: 0, to: 5 }, height: { from: 0, to: 2.7 } }, wide)!;
    const fit = fitNiche({ count: 2, mantel: true, shelves: 3 }, wall);
    expect(fit.niches).toHaveLength(2);
    expect(fit.mantel).not.toBeNull();
    expect(fit.niches[0].cx).toBeLessThan(fit.mantel!.cx - fit.mantel!.w / 2);
    expect(fit.niches[1].cx).toBeGreaterThan(fit.mantel!.cx + fit.mantel!.w / 2);
    expect(fit.shelfCount).toBe(6);
    expect(fit.bodyM2).toBeGreaterThan(5 * 2.7 * 0.5);
  });
});

describe('what decor buys', () => {
  const r = room();
  const slats: DecorPiece = {
    id: 'd1',
    roomId: r.id,
    family: 'slats',
    wallIndex: northIndex(r),
    span: { from: 0.5, to: 3.5 },
    height: { from: 1, to: 2.5 },
    params: { slatWidthMm: 40, gapMm: 20, led: 'bottom' },
    materials: { face: decorMaterialFrom(OAK), backing: decorMaterialFrom(FELT), led: decorMaterialFrom(LED) },
  };

  it('measures each part in its unit, with the cutting waste', () => {
    const uses = decorUses(slats, r);
    const face = uses.find((u) => u.slot === 'face')!;
    expect(face.m2).toBeCloseTo(4.5, 6);
    expect(face.pcs).toBe(50);
    expect(face.m).toBeCloseTo(75, 6);
    expect(quantityIn(face, 'm2')).toBeCloseTo(5, 6); // 4.5 × 1.1 = 4.95 → 5.0
    expect(quantityIn(face, 'linear_m')).toBeCloseTo(78.8, 6); // 75 × 1.05 = 78.75 → 78.8
    expect(quantityIn(face, 'piece')).toBe(50);
    expect(uses.find((u) => u.slot === 'led')!.m).toBeCloseTo(3, 6);
  });

  it('prices a piece by what admin set per unit', () => {
    const lines = piecePurchases(slats, r);
    expect(lines.map((l) => l.slot)).toEqual(['face', 'backing', 'led']);
    expect(lines[0].total).toBeCloseTo(5 * 185, 6);
    expect(lines[2].total).toBeCloseTo(3.2 * 38, 6); // 3 × 1.05 = 3.15 → 3.2 m
    // The same piece in oak sold by the metre buys metres of slat.
    const byMetre = piecePurchases({ ...slats, materials: { ...slats.materials, face: decorMaterialFrom(OAK_BY_METRE) } }, r);
    expect(byMetre[0].unit).toBe('linear_m');
    expect(byMetre[0].qty).toBeCloseTo(78.8, 6);
  });

  it('folds a material used by several pieces into one purchase', () => {
    const second = { ...slats, id: 'd2', span: { from: 0.2, to: 1.2 } };
    const purchases = decorPurchases([slats, second], [r]);
    const oak = purchases.find((p) => p.product.productId === OAK.id)!;
    expect(oak.pieceIds).toEqual(['d1', 'd2']);
    expect(oak.qty).toBeCloseTo(5 + 1.7, 6); // 1 × 1.5 = 1.5 m² × 1.1 → 1.7
  });

  it('puts the materials on the budget as order lines the workshop is sent', () => {
    const plan = { rooms: [r], wallThicknessM: 0.2, metresPerPixel: null, bounds: { width: 4, depth: 3.5 }, source: 'manual' } as FloorPlan;
    const scene: DesignScene = { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [], finishes: [], decor: [slats] };
    const cost = priceScene(plan, scene);
    const oak = cost.lines.find((l) => l.key === `decor-${OAK.id}`)!;
    expect(oak.tick).toBe(tickFor.decor(OAK.id));
    expect(oak.section).toBe('finishes');
    expect(oak.total).toBeCloseTo(925, 6);
    expect(oak.product?.store?.id).toBe(9);
    expect(cost.lines.find((l) => l.key === `decor-${LED.id}`)!.section).toBe('lighting');
    // Ticked off, it leaves the totals.
    const off = priceScene(plan, { ...scene, excluded: [tickFor.decor(OAK.id)] });
    expect(off.finishesTotal).toBeCloseTo(cost.finishesTotal - 925, 6);
  });
});

describe('decor intents made pieces', () => {
  const r = room([{ id: 'w', kind: 'window', wallIndex: 0, t: 0.8, widthM: 1, heightM: 1.4, sillM: 0.9, roomId: 'r1', exterior: true }]);

  it('finds the wall a bed stands against', () => {
    expect(wallBehind(bed(r), r)?.index).toBe(northIndex(r));
  });

  it('centres a field on its anchor with a margin, and gives every slot a real material', () => {
    const r = room();
    const piece = resolveDecor({ family: 'slats', anchor: 'bed', materials: [{ slot: 'face', productId: OAK.id }] }, r, [bed(r)], CATALOG, 'x')!;
    expect(piece.wallIndex).toBe(northIndex(r));
    const mid = (piece.span.from + piece.span.to) / 2;
    const edge = roomEdges(r.polygon).find((e) => e.index === piece.wallIndex)!;
    const bedAlong = (2 - edge.a.x) * edge.dir.x + (1.06 - edge.a.z) * edge.dir.z;
    expect(mid).toBeCloseTo(bedAlong, 6);
    expect(piece.span.to - piece.span.from).toBeCloseTo(1.6 + 1.5, 6);
    expect(piece.materials.face?.product?.productId).toBe(OAK.id);
    // A board behind by default; no light until asked for.
    expect(piece.materials.backing?.product?.productId).toBe(FELT.id);
    expect(piece.materials.led).toBeUndefined();
  });

  it('ignores a material of the wrong kind and a colour on one that takes none', () => {
    const piece = resolveDecor({ family: 'slats', anchor: 'bed', materials: [{ slot: 'face', productId: MARBLE.id, colorHex: '#123456' }] }, r, [bed(r)], CATALOG, 'x')!;
    expect(piece.materials.face?.product?.productId).toBe(OAK.id);
    expect(piece.materials.face?.colorHex).toBeUndefined();
    const moulding = resolveDecor({ family: 'moulding', anchor: 'wall', wallIndex: northIndex(r), materials: [{ slot: 'profile', productId: MOULD.id, colorHex: '#93A086' }] }, r, [], CATALOG, 'm')!;
    expect(moulding.materials.profile?.colorHex).toBe('#93A086');
  });

  it('keeps a field centred on its anchor off a window beside it', () => {
    const piece = resolveDecor({ family: 'slats', anchor: 'bed' }, r, [bed(r)], CATALOG, 'x')!;
    const edge = roomEdges(r.polygon).find((e) => e.index === piece.wallIndex)!;
    expect(edge.index).toBe(0);
    expect(piece.span.to).toBeLessThanOrEqual(0.8 * edge.length - 0.6 + 1e-6);
  });

  it('keeps a stretch off a window, and drops what the room cannot have', () => {
    const windowWall = roomEdges(r.polygon)[0];
    const slab = resolveDecor({ family: 'slab', anchor: 'wall', wallIndex: 0 }, r, [], CATALOG, 's')!;
    const winFrom = 0.8 * windowWall.length - 0.5 - 0.1;
    expect(slab.span.to).toBeLessThanOrEqual(winFrom + 1e-6);
    expect(resolveDecor({ family: 'slab', anchor: 'tv' }, r, [], CATALOG, 't')).toBeNull();
    const lShaped = room([], [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }]);
    expect(resolveDecor({ family: 'light', anchor: 'room' }, lShaped, [], CATALOG, 'c')).toBeNull();
    expect(resolveDecor({ family: 'light', anchor: 'room' }, r, [], CATALOG, 'c')?.wallIndex).toBeNull();
  });

  it('never stacks two pieces on one stretch, and keeps knobs in range', () => {
    const pieces = resolveRoomDecor([{ family: 'slats', anchor: 'bed' }, { family: 'panel', anchor: 'bed' }, { family: 'light', anchor: 'room' }], r, [bed(r)], CATALOG);
    expect(pieces.map((p) => p.family)).toEqual(['slats', 'light']);
    expect(sanitizeParams('slats', { slatWidthMm: 500, gapMm: 2 })).toEqual({ slatWidthMm: 60, gapMm: 8 });
  });
});

describe('the AI proposal', () => {
  it('becomes the matcher picks and the room decor', () => {
    const r = room();
    const proposal = { model: 'm', rooms: [{ roomId: r.id, note: 'n', furniture: [{ kind: 'bed_double', productId: 100 }], floor: null, wall: null, decor: [{ family: 'slats' as const, anchor: 'bed' as const }] }] };
    expect(proposalPicks(proposal)).toEqual({ 'bed_double|r1': 100 });
    const plan = { rooms: [r] } as FloorPlan;
    expect(proposalDecor(plan, proposal, [bed(r)], CATALOG)).toHaveLength(1);
  });

  it('is taken by the matcher for its room where it is a candidate', () => {
    const r = room();
    const sofa = (id: number) => ({ ...material(id, 'wood', 'piece', 1000 + id), categorySlug: 'sofas', model3dKind: 'sofa_3seat', model3dUrl: `/s${id}.glb`, widthCm: 200, depthCm: 90, heightCm: 80, styleTags: ['modern'] });
    const slot: PlacedItem = { id: 's', roomId: r.id, slot: 'sofa', kind: 'sofa_3seat', position: { x: 2, z: 1 }, elevationM: 0, rotation: 0, size: { width: 2.2, depth: 0.9, height: 0.8 }, product: null };
    const matched = matchProducts([slot], [sofa(11), sofa(12), sofa(13)], { styleId: 'modern', picks: { 'sofa_3seat|r1': 13 } });
    expect(matched[0].product?.productId).toBe(13);
    const notOffered = matchProducts([slot], [sofa(11), sofa(12)], { styleId: 'modern', picks: { 'sofa_3seat|r1': 99 } });
    expect(notOffered[0].product?.productId).not.toBe(99);
  });
});

describe('checking the designer\'s answer', () => {
  const r = room();
  const plan = { rooms: [r] } as FloorPlan;
  const offer: Offer = {
    furniture: new Map([[r.id, new Map([['bed_double', new Set([100, 101])]])]]),
    floors: new Map([[r.id, new Set([500])]]),
    walls: new Map([[r.id, new Set([600])]]),
    decorMaterials: new Map(CATALOG.map((p) => [p.id, p])),
    referenceIds: new Set(['bedroom_modern']),
  };
  const auto = { slatWidthMm: 0, gapMm: 25, depthMm: 0, backing: 'no', led: 'bottom', dadoMm: 0, bayWidthMm: 0, upper: 'auto', lower: 'auto', rail: 'auto', shape: 'auto', count: 0, nicheWidthMm: 0, nicheHeightMm: 0, shelves: -1, mantel: 'auto', moduleWidthMm: 0, moduleHeightMm: 0, style: 'auto', border: 'auto', path: 'auto' };

  it('keeps only what was offered and reads the sentinels as defaults', () => {
    const proposal = validateProposal(
      {
        rooms: [
          {
            roomId: r.id,
            note: 'Calm oak and linen.',
            furniture: [{ kind: 'bed_double', productId: 101 }, { kind: 'bed_double', productId: 999 }, { kind: 'sofa_3seat', productId: 100 }],
            floor: 500,
            wall: 777,
            decor: [
              { family: 'slats', referenceId: 'bedroom_modern', concept: 'Oak headwall', anchor: 'bed', wallIndex: -1, widthM: 0, heightFromM: -1, heightToM: -1, params: auto, materials: [{ slot: 'face', productId: OAK.id, colorHex: '' }, { slot: 'face', productId: 9999, colorHex: '' }, { slot: 'led', productId: MARBLE.id, colorHex: '' }], note: 'Warmth behind the bed.' },
              { family: 'spaceship', referenceId: '', concept: '', anchor: 'bed', wallIndex: -1, widthM: 0, heightFromM: -1, heightToM: -1, params: auto, materials: [], note: '' },
            ],
          },
          { roomId: 'nowhere', note: '', furniture: [], floor: 0, wall: 0, decor: [] },
        ],
      } as never,
      plan,
      offer,
      'claude-opus-5-5'
    );
    expect(proposal.rooms).toHaveLength(1);
    const room0 = proposal.rooms[0];
    expect(room0.furniture).toEqual([{ kind: 'bed_double', productId: 101 }]);
    expect(room0.floor).toBe(500);
    expect(room0.wall).toBeNull();
    expect(room0.decor).toHaveLength(1);
    const d = room0.decor[0];
    expect(d.wallIndex).toBeNull();
    expect(d.widthM).toBeNull();
    expect(d.heightFromM).toBeNull();
    expect(d.params).toEqual({ gapMm: 25, backing: false, led: 'bottom' });
    expect(d.materials?.map((m) => m.productId)).toEqual([OAK.id]);
  });

  it('drops a tiled field in a bathroom or a toilet — their walls are tiled already — and keeps it elsewhere', () => {
    const field = { family: 'tile', referenceId: '', concept: 'Field', anchor: 'wall', wallIndex: 0, widthM: 0, heightFromM: -1, heightToM: -1, params: auto, materials: [], note: '' };
    const niche = { ...field, family: 'niche' };
    const answer = (roomId: string) => ({ rooms: [{ roomId, note: '', furniture: [], floor: 0, wall: 0, decor: [field, niche] }] }) as never;
    for (const type of ['bathroom', 'toilet'] as const) {
      const wet = { ...r, type };
      const decor = validateProposal(answer(wet.id), { rooms: [wet] } as FloorPlan, offer, 'm').rooms[0].decor;
      expect(decor.map((d) => d.family)).toEqual(['niche']);
    }
    expect(validateProposal(answer(r.id), plan, offer, 'm').rooms[0].decor.map((d) => d.family)).toEqual(['tile', 'niche']);
  });

  it('keeps only the decor families the style takes, and light only in a Modern flat', () => {
    const slats = { family: 'slats', referenceId: '', concept: '', anchor: 'bed', wallIndex: -1, widthM: 0, heightFromM: -1, heightToM: -1, params: auto, materials: [], note: '' };
    const answer = { rooms: [{ roomId: r.id, note: '', furniture: [], floor: 0, wall: 0, decor: [slats, { ...slats, family: 'moulding' }, { ...slats, family: 'panel' }] }] } as never;
    const decor = (styleId: 'modern' | 'scandinavian' | 'industrial' | 'vintage') => validateProposal(answer, plan, offer, 'm', styleId).rooms[0].decor;
    expect(decor('modern').map((d) => d.family)).toEqual(['slats', 'moulding', 'panel']);
    expect(decor('modern')[0].params?.led).toBe('bottom');
    expect(decor('vintage').map((d) => d.family)).toEqual(['slats', 'moulding']);
    expect(decor('scandinavian').map((d) => d.family)).toEqual(['slats']);
    expect(decor('industrial').map((d) => d.family)).toEqual(['slats']);
    for (const styleId of ['scandinavian', 'industrial', 'vintage'] as const) expect(decor(styleId)[0].params?.led, styleId).toBe('none');
  });

  it('refuses an answer with nothing usable', () => {
    expect(() => validateProposal({ rooms: [] }, plan, offer, 'm')).toThrow();
  });

  it('builds one decor piece in a hall, a kitchen or a bathroom, as the prompt says — the first asked that can be built — and three elsewhere (A7)', () => {
    const piece = (family: string, wallIndex: number) => ({ family, referenceId: '', concept: '', anchor: 'wall', wallIndex, widthM: 0, heightFromM: -1, heightToM: -1, params: auto, materials: [], note: '' });
    // The first of five is not usable (an unknown family): the first three usable ones are kept.
    const answer = (roomId: string) => ({ rooms: [{ roomId, note: '', furniture: [], floor: 0, wall: 0, decor: [piece('spaceship', 0), piece('slab', 0), piece('slab', 1), piece('slab', 2), piece('slab', 3)] }] }) as never;
    expect(validateProposal(answer(r.id), plan, offer, 'm').rooms[0].decor.map((d) => d.wallIndex)).toEqual([0, 1, 2]);
    expect(maxDecor('living_room')).toBe(MAX_DECOR_PER_ROOM);
    // The bed stands against the north wall: a niche asked there cannot be built.
    const north = northIndex(r);
    const other = (north + 2) % 4;
    const asked = { rooms: [{ roomId: r.id, note: '', furniture: [], floor: 0, wall: 0, decor: [piece('niche', north), piece('slab', other), piece('slab', (north + 1) % 4)] }] } as never;
    for (const type of ['hallway', 'kitchen', 'bathroom'] as const) {
      const typed = { rooms: [{ ...r, type }] } as FloorPlan;
      const built = proposalDecor(typed, validateProposal(asked, typed, offer, 'm'), [bed(r)], CATALOG);
      expect(built.map((d) => `${d.family}@${d.wallIndex}`), type).toEqual([`slab@${other}`]);
    }
    expect(proposalDecor(plan, validateProposal(answer(r.id), plan, offer, 'm'), [], CATALOG)).toHaveLength(MAX_DECOR_PER_ROOM);
  });

  it('leaves a niche or a panel asked on a wall to the flat as built, which the designer’s picks may change (W9)', () => {
    // The brief, from the engine's flat, offered wall 1 for slats only; the flat as built leaves it clear.
    const offered: Offer = { ...offer, decorWalls: new Map([[r.id, new Map([[0, new Set(['niche', 'panel', 'slats'] as const)], [1, new Set(['slats'] as const)]])]]) };
    const piece = (family: string, wallIndex: number) => ({ family, referenceId: '', concept: '', anchor: 'wall', wallIndex, widthM: 0, heightFromM: -1, heightToM: -1, params: auto, materials: [], note: '' });
    const answer = { rooms: [{ roomId: r.id, note: '', furniture: [], floor: 0, wall: 0, decor: [piece('niche', 1), piece('panel', -1)] }] } as never;
    const proposal = validateProposal(answer, plan, offered, 'm', 'modern');
    // A wall-anchored piece with no wall (-1) goes on the room's longest clear wall.
    expect(proposal.rooms[0].decor.map((d) => `${d.family}@${d.wallIndex}`)).toEqual(['niche@1', 'panel@null']);
    const built = proposalDecor(plan, proposal, [], CATALOG);
    expect(built.map((d) => d.family)).toEqual(['niche', 'panel']);
    expect(built[0].wallIndex).toBe(1);
  });
});

describe('the designer’s prompts read their numbers from the rules (A7)', () => {
  const cm = (m: number) => Math.round(m * 100);
  it('tells the designer the rules’ sizes, light and window dressing', () => {
    expect(DESIGN_PROMPT).toContain(`a basin's top at ${cm(BASIN_TOP_M)} cm`);
    expect(DESIGN_PROMPT).toContain(`a shower at least ${cm(SHOWER_MIN_M)}×${cm(SHOWER_MIN_M)} cm`);
    expect(DESIGN_PROMPT).toContain(`a wardrobe ${cm(WARDROBE_DEPTH_M)} cm deep (${cm(SHALLOW_WARDROBE_DEPTH_M)} cm when shallow)`);
    expect(DESIGN_PROMPT).toContain(`warm (${WARM_LIGHT_K.min}–${WARM_LIGHT_K.max} K)`);
    expect(DESIGN_PROMPT).toContain(`neutral (${NEUTRAL_LIGHT_K.min}–${NEUTRAL_LIGHT_K.max} K)`);
    expect(DESIGN_PROMPT).toContain(`over every ${listText(BLIND_ROOMS.map((t) => `${t}'s`))} window`);
    expect(DESIGN_PROMPT).toContain(`Never more than ${MAX_DECOR_PER_ROOM} in a room`);
  });

  it('tells it the decor’s default heights as the engine fits them', () => {
    const band = (family: 'slab' | 'panel', anchor: 'tv' | 'bed') => defaultHeight(family, anchor, Infinity);
    expect(DESIGN_PROMPT).toContain(`a slab behind a TV ${band('slab', 'tv').from}–${band('slab', 'tv').to} m`);
    expect(DESIGN_PROMPT).toContain(`an upholstered headboard panel ${band('panel', 'bed').from}–${band('panel', 'bed').to} m`);
    expect(DESIGN_PROMPT).toContain(`a tiled field up to ${defaultHeight('tile', 'wall', Infinity).to} m`);
  });

  it('tells the check the kitchen’s clear floor', () => {
    expect(REVIEW_PROMPT).toContain(`${KITCHEN_CIRCULATION_M} m in front of the run stays clear`);
  });
});

describe('the designer is offered the finishes the engine lays (F4)', () => {
  const style = getStyle('modern');
  const finish = (id: number, categorySlug: string, surfaces: Array<'floor' | 'wall'>, wet = false, textureUrl = `/textures/f${id}.webp`): CatalogProduct => ({ ...material(id, 'wood', 'm2', 40 + id), categorySlug, slug: `f${id}`, textureUrl, specs: { surfaces, wet } });
  const at = (id: string, type: PlanRoom['type'], x: number, w: number, d: number, openings: PlanRoom['openings'] = []) =>
    refreshRoom({ id, type, name: id, polygon: [{ x, z: 0 }, { x: x + w, z: 0 }, { x: x + w, z: d }, { x, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings });
  const plan = {
    rooms: [
      at('bed', 'bedroom', 0, 3.5, 3.5),
      at('liv', 'living_room', 4, 5, 4),
      at('kit', 'kitchen', 10, 3, 3),
      at('bal', 'balcony', 14, 3, 1.2),
      at('wc', 'bathroom', 18, 2, 2),
    ],
  } as FloorPlan;
  const catalog = [
    finish(10, 'laminate', ['floor'], false, style.surfaces.floor.textureUrl ?? undefined),
    finish(11, 'laminate', ['floor']),
    finish(12, 'carpet', ['floor']),
    finish(13, 'carpet', ['floor']),
    finish(20, 'floor-tiles', ['floor'], true, style.surfaces.wetFloor.textureUrl ?? undefined),
    finish(21, 'floor-tiles', ['floor'], true),
    finish(22, 'floor-tiles', ['floor']),
    finish(30, 'paint', ['wall'], false, style.surfaces.wall.textureUrl ?? undefined),
    finish(31, 'paint', ['wall']),
    finish(40, 'wall-tiles', ['wall'], true, style.surfaces.wetWall.textureUrl ?? undefined),
  ];
  const { offer, text } = buildBrief({ plan, styleId: 'modern', locale: 'en', catalog, seed: 2 });
  const floors = (id: string) => [...(offer.floors.get(id) ?? [])].sort();

  it('offers a closed kitchen and a balcony tiles, not the living room’s carpet, and a bathroom wet tiles', () => {
    for (const id of ['kit', 'bal']) {
      expect(floors(id).length, id).toBeGreaterThan(0);
      for (const p of floors(id)) expect(catalog.find((c) => c.id === p)?.categorySlug, id).toBe('floor-tiles');
    }
    expect(floors('wc')).toEqual([20, 21]);
  });

  it('offers every room that shares the flat’s floor the lead room’s lists, and says which room leads and which kitchen is closed', () => {
    expect(floors('liv')).toEqual([10, 11]);
    expect(floors('bed')).toEqual(floors('liv'));
    expect([...(offer.walls.get('bed') ?? [])].sort()).toEqual([...(offer.walls.get('liv') ?? [])].sort());
    expect(text).toMatch(/this room leads the flat's one floor and walls/);
    expect(text).toMatch(/room liv's choice is laid here/);
    expect(text).toMatch(/a closed kitchen: its own, its floor tiled/);
  });

  it('offers the lead room the very lists the rooms that share its floor get, where there are more finishes than it draws (F4)', () => {
    // More laminates and paints than the ten drawn per surface: two draws would differ.
    const many = [
      ...catalog,
      ...Array.from({ length: 16 }, (_, i) => finish(100 + i, 'laminate', ['floor'])),
      ...Array.from({ length: 16 }, (_, i) => finish(200 + i, 'paint', ['wall'])),
    ];
    for (const seed of [1, 2, 3, 4, 5]) {
      const { offer } = buildBrief({ plan, styleId: 'modern', locale: 'en', catalog: many, seed });
      const of = (map: Map<string, Set<number>>, id: string) => [...(map.get(id) ?? [])].sort((a, b) => a - b);
      expect(of(offer.floors, 'liv').length, `seed ${seed}`).toBeGreaterThan(0);
      expect(of(offer.floors, 'bed'), `seed ${seed}`).toEqual(of(offer.floors, 'liv'));
      expect(of(offer.walls, 'bed'), `seed ${seed}`).toEqual(of(offer.walls, 'liv'));
    }
  });

  it('lays the lead room’s choice through the rooms that share it, and the closed kitchen’s own', () => {
    const proposal = validateProposal({ rooms: [{ roomId: 'liv', note: '', furniture: [], floor: 11, wall: 0, decor: [] }, { roomId: 'bed', note: '', furniture: [], floor: 11, wall: 0, decor: [] }, { roomId: 'kit', note: '', furniture: [], floor: floors('kit')[0], wall: 0, decor: [] }] } as never, plan, offer, 'm', 'modern');
    const scene = generateScene({ plan, styleId: 'modern', budgetGel: null, catalog, proposal, finishes: [], electrical: [], seed: 2, at: 'now', aiCount: 1 });
    const floorOf = (id: string) => scene.finishes.find((f) => f.roomId === id && f.surface === 'floor')?.product?.productId;
    expect(floorOf('liv')).toBe(11);
    expect(floorOf('bed')).toBe(11);
    expect(floorOf('kit')).toBe(floors('kit')[0]);
    // A carpet is no finish the engine lays in a kitchen: refused.
    expect(proposalFinish(plan.rooms[2], 'floor', 12, 'modern', catalog, plan.rooms)).toBeNull();
  });
});

describe('every generation is offered a fresh draw', () => {
  const living = refreshRoom({ id: 'r1', type: 'living_room', name: 'Living', polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
  const plan = { rooms: [living] } as FloorPlan;
  // 40 Scandinavian sofas — a sofa is the style's own whenever the catalogue has any (the matcher's
  // strict style) — and 20 Modern ones a Scandinavian flat is never given, so never offered.
  const sofas = Array.from({ length: 60 }, (_, i) => ({ ...material(1000 + i, 'wood', 'piece', 1500 + i * 10), categorySlug: 'sofas', model3dKind: 'sofa_3seat', model3dUrl: `/s${i}.glb`, widthCm: 220, depthCm: 95, heightCm: 80, styleTags: i < 40 ? ['scandinavian'] : ['modern'] }));
  const huge = { ...sofas[0], id: 2000, widthCm: 900, depthCm: 400 };
  const catalog = [...sofas, huge, ...CATALOG];
  const offered = (seed: number, previous?: number[]) => [...(buildBrief({ plan, styleId: 'scandinavian', locale: 'ka', catalog, seed, previous: previous ? { productIds: previous, decorFamilies: [] } : null }).offer.furniture.get('r1')?.get('sofa_3seat') ?? [])];

  it('offers different products to different generations, all from the whole catalogue', () => {
    const a = offered(1);
    const b = offered(2);
    expect(a).toHaveLength(12);
    expect(new Set([...a, ...b]).size).toBeGreaterThan(12);
    // The same seed reproduces the run.
    expect(offered(1)).toEqual(a);
  });

  it('never offers a piece the room cannot hold', () => {
    for (let seed = 1; seed < 30; seed++) expect(offered(seed)).not.toContain(2000);
  });

  it('never offers what the matcher would not take: another style’s sofa where the style has its own', () => {
    for (let seed = 1; seed < 30; seed++) for (const id of offered(seed)) expect(id).toBeLessThan(1040);
  });

  it('rarely offers again what the last design used', () => {
    const last = offered(5);
    let again = 0;
    let unpenalised = 0;
    for (let seed = 100; seed < 130; seed++) {
      again += offered(seed, last).filter((id) => last.includes(id)).length;
      unpenalised += offered(seed).filter((id) => last.includes(id)).length;
    }
    // 12 of the 40 the matcher would take were used last time: the same draws told nothing bring
    // back about 3.6 of them a time (12 × 12 / 40), the penalty far fewer.
    expect(unpenalised / 30).toBeGreaterThan(2.5);
    expect(again / 30).toBeLessThan(1.5);
  });

  it('gives each generation a direction and names the last design', () => {
    const { text } = buildBrief({ plan, styleId: 'scandinavian', locale: 'ka', catalog, seed: 3, previous: { productIds: [1001], decorFamilies: ['slats'] } });
    expect(text).toMatch(/Direction for this flat: /);
    expect(text).toMatch(/previous design used products 1001 and decor families slats/);
  });

  it('gives the designer the style’s guide and the sub-style the style test points to', () => {
    const { text } = buildBrief({ plan, styleId: 'industrial', locale: 'ka', catalog, seed: 3, styleProfile: { answers: { palette: 'brick', atmosphere: 'loft' }, scores: { modern: 0, scandinavian: 0, industrial: 4, vintage: 0 } } });
    expect(text).toMatch(/Style guide — industrial/);
    expect(text).toMatch(/This flat's sub-style: Loft/);
  });
});
