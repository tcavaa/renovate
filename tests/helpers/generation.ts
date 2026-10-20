import { refreshRoom } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';
import type { AiProposal } from '@/lib/design/aiProposal';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlanRoom } from '@/lib/design/types';

/**
 * A small flat and a catalogue to generate it from — a bedroom and a living room, beds,
 * nightstands, sofas, coffee tables, the modern style's floors and walls, a decor material — and
 * an AI proposal for it: what `generateScene` and the generation job are tested with.
 */

const rect = (id: string, type: PlanRoom['type'], x: number, w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [{ x, z: 0 }, { x: x + w, z: 0 }, { x: x + w, z: d }, { x, z: d }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });

export function generationPlan(): FloorPlan {
  return {
    rooms: [rect('bed', 'bedroom', 0, 4, 4), rect('living', 'living_room', 4.2, 6, 5)],
    metresPerPixel: null,
    bounds: { width: 10.2, depth: 5 },
    source: 'manual',
    wallThicknessM: 0.2,
  };
}

function product(id: number, kind: string | null, patch: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    nameKa: `p${id}`,
    slug: `p${id}`,
    brand: null,
    categorySlug: kind ?? 'paint',
    pricePerUnit: 500 + id,
    unit: 'piece',
    imageUrl: null,
    colorHex: '#999999',
    textureUrl: null,
    model3dKind: kind,
    model3dUrl: kind ? `/models/p${id}.glb` : null,
    widthCm: null,
    depthCm: null,
    heightCm: null,
    styleTags: ['modern'],
    tags: [],
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
    ...patch,
  };
}

const look = getStyle('modern').surfaces;
const finish = (id: number, textureUrl: string | undefined, surfaces: Array<'floor' | 'wall'>, wet = false) =>
  product(id, null, { unit: 'm2', pricePerUnit: 10 + id, textureUrl: textureUrl ?? null, specs: { surfaces, wet } });

export const GENERATION_CATALOG: CatalogProduct[] = [
  product(101, 'bed_double', { widthCm: 160, depthCm: 210, heightCm: 100, categorySlug: 'beds' }),
  product(102, 'bed_double', { widthCm: 180, depthCm: 210, heightCm: 110, categorySlug: 'beds' }),
  product(111, 'nightstand', { widthCm: 45, depthCm: 40, heightCm: 55, categorySlug: 'nightstands' }),
  product(112, 'nightstand', { widthCm: 50, depthCm: 40, heightCm: 50, categorySlug: 'nightstands' }),
  product(121, 'sofa_3seat', { widthCm: 220, depthCm: 92, heightCm: 82, categorySlug: 'sofas' }),
  product(122, 'sofa_3seat', { widthCm: 200, depthCm: 88, heightCm: 80, categorySlug: 'sofas' }),
  product(123, 'sofa_corner', { widthCm: 270, depthCm: 175, heightCm: 82, categorySlug: 'sofas' }),
  product(124, 'sofa_corner', { widthCm: 260, depthCm: 170, heightCm: 80, categorySlug: 'sofas' }),
  product(131, 'coffee_table', { widthCm: 110, depthCm: 60, heightCm: 40, categorySlug: 'coffee-tables' }),
  finish(201, look.floor.textureUrl, ['floor']),
  finish(202, look.wall.textureUrl, ['wall']),
  finish(203, look.wetFloor.textureUrl, ['floor'], true),
  finish(204, look.wetWall.textureUrl, ['wall'], true),
  product(301, null, { categorySlug: 'decor-wood', unit: 'm2', pricePerUnit: 185, specs: { textureScaleM: 1 } }),
];

/** The designer's answer for the flat: its picks (the living room's 30 m² take a corner sofa), and slats behind the bed. */
export function generationProposal(): AiProposal {
  return {
    model: 'claude-test',
    rooms: [
      { roomId: 'bed', note: 'A calm bedroom.', furniture: [{ kind: 'bed_double', productId: 102 }, { kind: 'nightstand', productId: 112 }], floor: null, wall: null, decor: [{ family: 'slats', anchor: 'bed' }] },
      { roomId: 'living', note: 'A bright living room.', furniture: [{ kind: 'sofa_corner', productId: 124 }], floor: null, wall: null, decor: [] },
    ],
  };
}
