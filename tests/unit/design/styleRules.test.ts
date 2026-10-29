import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { matchProducts, quantityFor, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { BLIND_LOWERED, windowDressing } from '@/lib/design/rules';
import { styleRejects } from '@/lib/design/styleGuide';
import { finishFromProduct, flatFinishRoom, isClosedKitchen, withFlatFinish } from '@/lib/design/surfaces';
import type { Opening, PlacedItem, PlanRoom, SurfaceFinish } from '@/lib/design/types';

/**
 * The second round's style rules (docs/design-studio/design-rules.md, stage 5): one floor and one
 * wall finish through the flat, no black in a Scandinavian flat, pictures at gallery height, and
 * the windows dressed by style — roller blinds or curtains.
 */

const room = (id: string, type: PlanRoom['type'], w = 4, d = 3, openings: Array<Omit<Opening, 'id' | 'roomId'>> = [], extra: Partial<PlanRoom> = {}): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })), ...extra });

const window = (wallIndex: number, widthM = 1.2): Omit<Opening, 'id' | 'roomId'> => ({ kind: 'window', wallIndex, t: 0.5, widthM, heightM: 1.4, sillM: 0.9, exterior: true });
const door = (wallIndex: number): Omit<Opening, 'id' | 'roomId'> => ({ kind: 'door', wallIndex, t: 0.5, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false });

const surface = (id: number, surfaces: Array<'floor' | 'wall'>, wet = false): CatalogProduct =>
  ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: wet ? 'floor-tiles' : 'laminate', pricePerUnit: 30, unit: 'm2', imageUrl: null, colorHex: null, textureUrl: `/textures/p${id}.webp`, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: ['modern'], tags: [], isFeatured: false, specs: { surfaces, wet, textureScaleM: 1 }, coveragePerUnit: null, store: null }) as CatalogProduct;

describe('one floor and one wall finish through the flat', () => {
  const oak = surface(1, ['floor']);
  const walnut = surface(2, ['floor']);
  const plaster = surface(3, ['wall']);
  const paint = surface(4, ['wall']);
  const tiles = surface(5, ['floor', 'wall'], true);
  const catalog = [oak, walnut, plaster, paint, tiles];
  const living = room('liv', 'living_room', 5, 4);
  const bedroom = room('bed', 'bedroom');
  const hall = room('hall', 'hallway', 2, 3);
  const bath = room('bath', 'bathroom', 2, 2);
  const kitchen = room('k', 'kitchen', 3, 3);
  const balcony = room('bal', 'balcony', 3, 1.2);
  const rooms = [living, bedroom, hall, bath, kitchen, balcony];
  const laid = (r: PlanRoom, s: 'floor' | 'wall', p: CatalogProduct): SurfaceFinish => finishFromProduct(r, s, p, 'style');
  const finishes = [
    laid(living, 'floor', oak), laid(living, 'wall', plaster),
    laid(bedroom, 'floor', walnut), laid(bedroom, 'wall', paint),
    laid(hall, 'floor', walnut), laid(hall, 'wall', paint),
    laid(bath, 'floor', tiles), laid(bath, 'wall', tiles),
    laid(kitchen, 'floor', walnut), laid(kitchen, 'wall', paint),
    laid(balcony, 'floor', walnut), laid(balcony, 'wall', paint),
  ];
  const product = (list: SurfaceFinish[], r: PlanRoom, s: 'floor' | 'wall') => list.find((f) => f.roomId === r.id && f.surface === s)?.product?.productId;

  it('is drawn for the living room, and laid in every room but the bathroom, the balcony and a closed kitchen', () => {
    expect(flatFinishRoom(rooms)?.id).toBe('liv');
    const next = withFlatFinish(finishes, rooms, catalog);
    for (const r of [bedroom, hall]) {
      expect(product(next, r, 'floor'), r.id).toBe(oak.id);
      expect(product(next, r, 'wall'), r.id).toBe(plaster.id);
    }
    expect(product(next, bath, 'floor')).toBe(tiles.id);
    expect(product(next, balcony, 'floor')).toBe(walnut.id);
    expect(isClosedKitchen(kitchen)).toBe(true);
    expect(product(next, kitchen, 'floor')).toBe(walnut.id);
  });

  it('runs into an open kitchen, and leaves a floor somebody chose', () => {
    const open = room('k', 'kitchen', 3, 3, [{ kind: 'archway', wallIndex: 1, t: 0.5, widthM: 1.2, heightM: 2.1, sillM: 0, exterior: false }]);
    expect(isClosedKitchen(open)).toBe(false);
    const chosen = finishes.map((f) => (f.roomId === 'bed' && f.surface === 'floor' ? { ...f, origin: 'studio' as const } : f));
    const next = withFlatFinish(chosen, [living, bedroom, open], catalog);
    expect(product(next, open, 'floor')).toBe(oak.id);
    expect(product(next, bedroom, 'floor')).toBe(walnut.id);
  });
});

describe('a Scandinavian flat', () => {
  const piece = (id: number, colorHex: string): CatalogProduct =>
    ({ id, nameKa: `s${id}`, slug: `s${id}`, brand: null, categorySlug: 'sofas', pricePerUnit: 1000, unit: 'piece', imageUrl: null, colorHex, textureUrl: null, model3dKind: 'sofa_3seat', model3dUrl: `/s${id}.glb`, widthCm: 210, depthCm: 90, heightCm: 80, styleTags: ['scandinavian'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as CatalogProduct;

  it('has no piece whose main colour is black; another style does', () => {
    expect(styleRejects(piece(1, '#141414'), 'scandinavian')).toBe(true);
    expect(styleRejects(piece(1, '#141414'), 'industrial')).toBe(false);
    expect(styleRejects(piece(2, '#e8e2d6'), 'scandinavian')).toBe(false);
  });

  it('is furnished from the light pieces when there are any', () => {
    const slot: PlacedItem = { id: 's', roomId: 'liv', slot: 'sofa', kind: 'sofa_3seat', position: { x: 2, z: 1 }, rotation: 0, elevationM: 0, size: { width: 2.2, depth: 0.9, height: 0.8 }, product: null };
    for (let seed = 0; seed < 10; seed++) {
      const [matched] = matchProducts([slot], [piece(1, '#141414'), piece(2, '#e8e2d6')], { styleId: 'scandinavian' });
      expect(matched.product?.productId, `seed ${seed}`).toBe(2);
    }
  });
});

describe('pictures', () => {
  it('hang at gallery height on a free wall, and 20–30 cm over a bed', () => {
    const items = layoutRoom(room('bed', 'bedroom', 3.8, 3.6, [door(2), window(0)]));
    const art = items.find((i) => i.slot === 'artwork');
    const bed = items.find((i) => i.slot === 'bed')!;
    expect(art).toBeDefined();
    // A wall piece's elevation is its bottom.
    const overBed = Math.hypot(art!.position.x - bed.position.x, art!.position.z - bed.position.z) < bed.size.depth;
    if (overBed) {
      const gap = art!.elevationM - bed.size.height;
      expect(gap).toBeGreaterThanOrEqual(0.2 - 1e-6);
      expect(gap).toBeLessThanOrEqual(0.3 + 1e-6);
    } else {
      expect(art!.elevationM + art!.size.height / 2).toBeCloseTo(1.5, 2);
    }
  });
});

describe('windows by style', () => {
  it('are roller blinds in a Modern or Industrial flat and in a kitchen or bathroom, curtains otherwise', () => {
    expect(windowDressing('curtain', 'bedroom', 'modern')).toBe('blind');
    expect(windowDressing('curtain', 'living_room', 'industrial')).toBe('blind');
    expect(windowDressing('curtain', 'bedroom', 'scandinavian')).toBe('curtain');
    expect(windowDressing('curtain', 'living_room', 'vintage')).toBe('curtain');
    expect(windowDressing('blind', 'kitchen', 'vintage')).toBe('blind');
    expect(windowDressing('curtain', 'bathroom', 'scandinavian')).toBe('blind');
    expect(windowDressing('sofa_3seat', 'kitchen', 'modern')).toBe('sofa_3seat');
  });

  it('hangs a blind over the window, a little wider, let down a third of the way; a curtain from the ceiling to the floor', () => {
    const bedroom = room('bed', 'bedroom', 3.8, 3.6, [door(2), window(0, 1.2)]);
    const blind = layoutRoom(bedroom, { styleId: 'modern' }).find((i) => i.slot === 'curtain');
    expect(blind?.kind).toBe('blind');
    expect(blind!.size.width).toBeCloseTo(1.3, 5);
    const top = blind!.elevationM + blind!.size.height;
    expect(top).toBeCloseTo(0.9 + 1.4 + 0.1, 2);
    expect(blind!.elevationM).toBeCloseTo(0.9 + 1.4 * (1 - BLIND_LOWERED), 2);
    const curtain = layoutRoom(bedroom, { styleId: 'scandinavian' }).find((i) => i.slot === 'curtain');
    expect(curtain?.kind).toBe('curtain');
    expect(curtain!.elevationM).toBe(0);
  });

  it('dresses a kitchen\'s and a bathroom\'s window with a blind whatever the style, and sells it by the piece', () => {
    const kitchen = layoutRoom(room('k', 'kitchen', 4, 3, [door(2), window(0)]), { styleId: 'vintage' }).find((i) => i.slot === 'curtain');
    expect(kitchen?.kind).toBe('blind');
    const bath = layoutRoom(room('b', 'bathroom', 2.6, 2.2, [door(2), window(0, 0.6)]), { styleId: 'scandinavian' }).find((i) => i.slot === 'curtain');
    expect(bath?.kind).toBe('blind');
    expect(quantityFor({ ...kitchen!, size: { ...kitchen!.size, width: 2.6 } })).toBe(1);
  });
});
