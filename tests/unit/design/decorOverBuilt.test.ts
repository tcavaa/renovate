import { describe, expect, it } from 'vitest';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { CabinetSection, DecorPiece, FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';
import { resolveDecor, withPlacement, type DecorIntent } from '@/lib/design/decor/resolve';
import { builtRects, DEFAULT_PLACEMENT, DECOR_PLACEMENTS, LOW_BUILT_MAX_M, placementOver } from '@/lib/design/decor/overBuilt';
import { decorUses } from '@/lib/design/decor/quantities';
import { applyReviewFixes, proposalDecor } from '@/lib/design/aiProposal';
import { DESIGN_PROMPT, DESIGN_SCHEMA, validateProposal, type Offer } from '@/lib/design/aiDesign';
import { decorPieceSchema } from '@/lib/validations/design.schema';

/**
 * Decor over low joinery (Nini's decision 8): full height behind a WC's box or a vanity, above it,
 * partly, or beside it — and whatever the placement, clear of the mirror, the basin, its tap, a
 * radiator and the openings.
 */

const H = 2.7;
function bathroom(openings: PlanRoom['openings'] = [], heightM = H): PlanRoom {
  return refreshRoom({ id: 'b1', type: 'bathroom', name: 'Bathroom', polygon: [{ x: 0, z: 0 }, { x: 2.4, z: 0 }, { x: 2.4, z: 1.8 }, { x: 0, z: 1.8 }], heightM, areaM2: 0, perimeterM: 0, openings });
}
const B = bathroom();
/** The wall along z = 0, its inside facing +z: where the WC, the vanity and the column stand. */
const NORTH = roomEdges(B.polygon).find((e) => e.inward.z > 0.5)!;
/** Where a point at x falls along that wall. */
const at = (x: number) => (x - NORTH.a.x) * NORTH.dir.x;

const product = { productId: 1, nameKa: 'p', slug: 'p', brand: null, pricePerUnit: 100, unit: 'piece' as const, qty: 1, totalPrice: 100, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/m.glb', categorySlug: 'x', store: null };
function item(id: string, slot: PlacedItem['slot'], x: number, depth: number, size: PlacedItem['size'], elevationM = 0): PlacedItem {
  return { id, roomId: B.id, slot, kind: slot, position: { x, z: depth / 2 }, elevationM, rotation: 0, size, product: { ...product, slug: id } };
}
const WC = item('wc', 'toilet', 1.2, 0.72, { width: 0.36, depth: 0.52, height: 0.46 });

/** A WC's box on the north wall, 0.8–1.6 m along it, half height (1 m) unless `full`. */
function wcBox(full = false): DecorPiece {
  const [a, b] = [at(0.8), at(1.6)].sort((p, q) => p - q);
  return { id: 'box', roomId: B.id, family: 'box', wallIndex: NORTH.index, span: { from: a, to: b }, height: { from: 0, to: full ? H : 1 }, params: { depthMm: 200, full }, materials: {}, anchor: 'wc', itemId: WC.id };
}

/** Made-to-measure joinery on the north wall from x0, its sections left to right. */
function cabinet(x0: number, sections: CabinetSection[]): DecorPiece {
  const width = sections.reduce((sum, s) => sum + s.widthMm / 1000, 0);
  return { id: `cab-${x0}`, roomId: B.id, family: 'cabinet', wallIndex: NORTH.index, span: { from: at(x0), to: at(x0) + width }, height: { from: 0, to: Math.max(...sections.map((s) => s.heightMm / 1000)) }, params: { sections }, materials: {}, anchor: 'joinery' };
}

const slab = (extra: Partial<DecorIntent> = {}): DecorIntent => ({ family: 'slab', anchor: 'wall', wallIndex: NORTH.index, ...extra });
const fit = (intent: DecorIntent, built: DecorPiece[], items: PlacedItem[] = [WC], room = B) => resolveDecor(intent, room, items, [], 'd', { built });
const overlapsAlong = (piece: DecorPiece, from: number, to: number) => Math.min(piece.span.to, to) - Math.max(piece.span.from, from) > 0.02;

describe('decor over a WC’s box', () => {
  const box = wcBox();

  it('goes above the box by default — from its top to the ceiling, over its stretch', () => {
    expect(DEFAULT_PLACEMENT).toBe('above');
    const piece = fit(slab(), [box])!;
    expect(piece.placement).toBe('above');
    expect(piece.height).toEqual({ from: 1, to: H });
    expect(overlapsAlong(piece, box.span.from, box.span.to)).toBe(true);
    expect(placementOver(piece, [box])).toBe('above');
  });

  it('runs floor to ceiling behind the box when asked full height, whatever heights were given', () => {
    const piece = fit(slab({ placement: 'full', heightFromM: 1.4, heightToM: 2 }), [box])!;
    expect(piece.placement).toBe('full');
    expect(piece.height).toEqual({ from: 0, to: H });
    expect(piece.span.from).toBeLessThanOrEqual(box.span.from);
    expect(piece.span.to).toBeGreaterThanOrEqual(box.span.to);
    expect(placementOver(piece, [box])).toBe('behind');
  });

  it('takes the height and width asked when partial, behind the box where it reaches it', () => {
    const piece = resolveDecor({ ...slab({ placement: 'partial', heightFromM: 0.5, heightToM: 2.1, widthM: 1 }), anchor: 'toilet' }, B, [WC], [], 'd', { built: [box] })!;
    expect(piece.height).toEqual({ from: 0.5, to: 2.1 });
    expect(piece.span.to - piece.span.from).toBeCloseTo(1, 6);
    // Centred on the WC (the toilet anchor).
    expect((piece.span.from + piece.span.to) / 2).toBeCloseTo(at(1.2), 6);
    expect(placementOver(piece, [box])).toBe('behind');
  });

  it('keeps beside the box when asked, 10 cm clear of it', () => {
    const piece = fit(slab({ placement: 'beside' }), [box])!;
    expect(piece.placement).toBe('beside');
    expect(overlapsAlong(piece, box.span.from - 0.09, box.span.to + 0.09)).toBe(false);
    expect(placementOver(piece, [box])).toBe('beside');
  });

  it('goes beside where too little wall is left above the box', () => {
    const piece = fit(slab({ heightToM: 1.3 }), [box])!;
    expect(piece.placement).toBe('beside');
    expect(overlapsAlong(piece, box.span.from, box.span.to)).toBe(false);
  });

  it('never stands behind a box to the ceiling: tall joinery is kept beside', () => {
    const tall = wcBox(true);
    expect(builtRects(tall)[0].low).toBe(false);
    for (const placement of DECOR_PLACEMENTS) {
      const piece = fit(slab({ placement }), [tall])!;
      expect(overlapsAlong(piece, tall.span.from, tall.span.to)).toBe(false);
      expect(piece.placement).toBeUndefined();
    }
  });

  it('keeps a niche wall off the box: it is built out', () => {
    const niche = fit({ family: 'niche', anchor: 'wall', wallIndex: NORTH.index, placement: 'full' }, [box]);
    if (niche) expect(overlapsAlong(niche, box.span.from, box.span.to)).toBe(false);
  });

  it('buys the wall as clad: full height counts the stretch behind the box', () => {
    const piece = fit(slab({ placement: 'full' }), [box])!;
    const face = decorUses(piece, B).find((u) => u.slot === 'face')!;
    expect(face.m2).toBeCloseTo((piece.span.to - piece.span.from) * H, 1);
  });
});

describe('decor over a vanity and a column', () => {
  const basin: CabinetSection = { kind: 'basin', widthMm: 2000, heightMm: 850, depthMm: 500, itemId: 'sink' };
  const vanity = cabinet(0.2, [basin]);
  const sink = item('sink', 'sink', 0.7, 0.45, { width: 0.6, depth: 0.45, height: 0.15 }, 0.85);
  const tap = item('tap', 'tap', 0.7, 0.15, { width: 0.2, depth: 0.15, height: 0.05 }, 1.0);
  const mirror = item('mirror', 'mirror', 0.7, 0.02, { width: 0.7, depth: 0.02, height: 0.8 }, 1.4);

  it('goes above the vanity, clear of the basin, its tap and the mirror over it', () => {
    for (const placement of ['full', 'above', 'partial'] as const) {
      const piece = fit(slab({ placement }), [vanity], [sink, tap, mirror])!;
      // The basin, the tap and the mirror stand 0.35–1.05 m along (with their 10 cm each side).
      expect(overlapsAlong(piece, at(0.25), at(1.15))).toBe(false);
      expect(overlapsAlong(piece, vanity.span.from, vanity.span.to)).toBe(true);
      expect(piece.height.from).toBe(placement === 'above' ? 0.85 : 0);
    }
  });

  it('a tap just under the decor keeps it off: a slab above a vanity does not sit on the tap', () => {
    const low = cabinet(0.2, [{ ...basin, heightMm: 980 }]);
    const piece = fit(slab(), [low], [{ ...tap, elevationM: 0.94 }])!;
    expect(piece.height.from).toBeCloseTo(0.98, 6);
    expect(overlapsAlong(piece, at(0.6), at(0.8))).toBe(false);
  });

  it('goes above a washing machine’s column even when asked full height: the machine stands against the wall in it', () => {
    const column = cabinet(1.4, [{ kind: 'washer', widthMm: 650, heightMm: 900, depthMm: 650, itemId: 'washer' }]);
    expect(builtRects(column)[0]).toMatchObject({ low: true, behind: false });
    const piece = fit(slab({ placement: 'full' }), [column], [])!;
    expect(piece.height.from).toBe(0.9);
    expect(overlapsAlong(piece, column.span.from, column.span.to)).toBe(true);
  });

  it('a bath’s box is gone over, never behind', () => {
    const bathBox: DecorPiece = { ...wcBox(), id: 'bath', anchor: 'bath', height: { from: 0, to: 0.55 }, params: { depthMm: 700 } };
    expect(builtRects(bathBox)[0]).toMatchObject({ low: true, behind: false });
    expect(fit(slab({ placement: 'full' }), [bathBox], [])!.height.from).toBe(0.55);
  });

  it(`reads joinery up to ${LOW_BUILT_MAX_M} m as low, a corner leg's wall cabinets as kept beside`, () => {
    const leg = { ...cabinet(0, [{ kind: 'kitchen', widthMm: 1200, heightMm: 900, depthMm: 600 } as CabinetSection]), params: { sections: [{ kind: 'kitchen', widthMm: 1200, heightMm: 900, depthMm: 600 } as CabinetSection], wallUnits: { from: 0, to: 1.2, bottomMm: 1450, heightMm: 720, depthMm: 350 } } };
    const rects = builtRects(leg);
    expect(rects.map((r) => r.low)).toEqual([true, false]);
    const piece = fit(slab(), [leg], [])!;
    // Above the base units, beside the wall cabinets over them.
    expect(overlapsAlong(piece, 0, 1.2)).toBe(false);
  });
});

describe('decor and the radiators', () => {
  it('keeps off a radiator on its wall at its height', () => {
    const radiators = [{ roomId: B.id, wallIndex: NORTH.index, from: 0, to: 0.6, bottom: 0.2, top: 1.0 }];
    const piece = resolveDecor(slab(), B, [], [], 'd', { radiators })!;
    expect(piece.span.from).toBeGreaterThanOrEqual(0.7 - 1e-6);
    // A band above it is not in its way.
    const high = resolveDecor(slab({ heightFromM: 1.2 }), B, [], [], 'd', { radiators })!;
    expect(high.span.from).toBe(0);
  });
});

describe('the card’s placement', () => {
  const box = wcBox();
  it('fits a piece again where it stands, its materials kept', () => {
    const above = { ...fit(slab(), [box])!, materials: { face: { product: { ...product, productId: 7 } } } } as DecorPiece;
    const full = withPlacement(above, 'full', B, [WC], { built: [box] })!;
    expect(full.height).toEqual({ from: 0, to: H });
    expect(full.placement).toBe('full');
    expect(full.origin).toBe('studio');
    expect(full.materials.face?.product?.productId).toBe(7);
    const beside = withPlacement(full, 'beside', B, [WC], { built: [box] })!;
    expect(overlapsAlong(beside, box.span.from, box.span.to)).toBe(false);
    const back = withPlacement(beside, 'above', B, [WC], { built: [box] })!;
    expect(back.height.from).toBe(1);
    expect(withPlacement({ ...box }, 'full', B, [WC], { built: [box] })).toBeNull();
  });

  it('is saved with the piece', () => {
    const piece = fit(slab(), [box])!;
    expect(decorPieceSchema.parse(piece).placement).toBe('above');
    expect(decorPieceSchema.safeParse({ ...piece, placement: 'floating' }).success).toBe(false);
  });
});

describe('the designer asks for it', () => {
  const plan = { rooms: [B] } as FloorPlan;
  const box = wcBox();

  it('is offered plainly in the prompt and the schema', () => {
    for (const word of ['full', 'above', 'partial', 'beside', 'behind the box', 'concealed-cistern']) expect(DESIGN_PROMPT).toContain(word);
    const decor = DESIGN_SCHEMA.properties.rooms.items.properties.decor.items;
    expect(decor.required).toContain('placement');
    expect(decor.properties.placement.enum).toEqual(['auto', 'full', 'above', 'partial', 'beside']);
  });

  it('is read from the answer, auto and anything else as the engine’s', () => {
    const offer: Offer = { furniture: new Map(), floors: new Map(), walls: new Map(), decorMaterials: new Map(), referenceIds: new Set() };
    const raw = (placement: string) => ({ family: 'slab', referenceId: '', concept: '', anchor: 'toilet', wallIndex: -1, widthM: 0, heightFromM: -1, heightToM: -1, placement, params: {}, materials: [], note: '' });
    const answer = { rooms: [{ roomId: B.id, note: '', furniture: [], floor: 0, wall: 0, decor: [raw('full'), raw('auto'), raw('sideways')] }] } as never;
    const decor = validateProposal(answer, plan, offer, 'm').rooms[0].decor;
    expect(decor.map((d) => d.placement)).toEqual(['full', null, null]);
    expect(decor[0].anchor).toBe('toilet');
  });

  it('becomes the flat’s decor over the box, and a check’s move keeps its placement', () => {
    const proposal = { model: 'm', rooms: [{ roomId: B.id, note: null, furniture: [], floor: null, wall: null, decor: [slab({ placement: 'full' })] }] };
    const [piece] = proposalDecor(plan, proposal, [WC], [], [box]);
    expect(piece.placement).toBe('full');
    expect(piece.height.from).toBe(0);
    const east = roomEdges(B.polygon).find((e) => e.inward.x < -0.5)!;
    const moved = applyReviewFixes([WC], [box, piece], { model: 'm', notes: {}, fixes: [{ action: 'decor_to_wall', target: piece.id, wallIndex: east.index, productId: null, reason: '' }] }, plan, []).decor.find((d) => d.id === piece.id)!;
    expect(moved.wallIndex).toBe(east.index);
    // No joinery on that wall: floor to ceiling there too, nothing to be placed over.
    expect(moved.height).toEqual({ from: 0, to: H });
    expect(moved.placement).toBeUndefined();
  });
});
