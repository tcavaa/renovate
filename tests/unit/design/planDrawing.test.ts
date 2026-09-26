import { describe, expect, it } from 'vitest';
import { drawBaseFinishes, formatDimension, outerDimensionChains, wallEndExtensions } from '@/components/plan/draw';
import { addWalls, rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import type { FloorPlan, SceneProduct, SurfaceFinish, Wall } from '@/lib/design/types';

const blankPlan = (): FloorPlan => ({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] });

/** Two rooms side by side: 3 m and 5 m wide, 5 m deep, 15 cm walls — the drawing in the brief. */
function twoRooms(): FloorPlan {
  const walls = [
    { x: 0.075, z: 0.075, width: 2.85, depth: 4.85 },
    { x: 3.075, z: 0.075, width: 4.85, depth: 4.85 },
  ].reduce((all, r, i) => addWalls(all, wallsForRectangle(r, 0.15, 'user', `r${i}`)), [] as Wall[]);
  return rebuildRooms(blankPlan(), walls);
}

describe('wallEndExtensions', () => {
  it('runs a wall past a corner by half the thickness of the wall it turns into, and not past a free end', () => {
    const walls: Wall[] = [
      { id: 'a', a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thicknessM: 0.12, origin: 'user' },
      { id: 'b', a: { x: 4, z: 0 }, b: { x: 4, z: 3 }, thicknessM: 0.2, origin: 'user' },
    ];
    const ext = wallEndExtensions(walls);
    expect(ext.get('a')).toEqual({ a: 0, b: 0.1 });
    expect(ext.get('b')).toEqual({ a: 0.06, b: 0 });
  });

  it('butts two walls in line against each other instead of overlapping them', () => {
    const walls: Wall[] = [
      { id: 'a', a: { x: 0, z: 0 }, b: { x: 2, z: 0 }, thicknessM: 0.12, origin: 'user' },
      { id: 'b', a: { x: 2, z: 0 }, b: { x: 5, z: 0 }, thicknessM: 0.12, origin: 'user' },
    ];
    const ext = wallEndExtensions(walls);
    expect(ext.get('a')!.b).toBe(0);
    expect(ext.get('b')!.a).toBe(0);
  });

  it('closes every corner of a rectangle', () => {
    const ext = wallEndExtensions(wallsForRectangle({ x: 0, z: 0, width: 3, depth: 2 }, 0.12, 'user', 'w'));
    for (const e of ext.values()) expect(e).toEqual({ a: 0.06, b: 0.06 });
  });
});

describe('outerDimensionChains', () => {
  it('chains the exterior walls of each side and measures the overall size outer face to outer face', () => {
    const chains = outerDimensionChains(twoRooms());
    expect(chains).not.toBeNull();
    // The top and bottom are cut at the partition: 3 m and 5 m, centreline to centreline.
    expect(chains!.top.map((m) => Math.round(m * 100) / 100)).toEqual([0, 3, 8]);
    expect(chains!.bottom.map((m) => Math.round(m * 100) / 100)).toEqual([0, 3, 8]);
    // The sides are one stretch each.
    expect(chains!.left.map((m) => Math.round(m * 100) / 100)).toEqual([0, 5]);
    expect(chains!.right.map((m) => Math.round(m * 100) / 100)).toEqual([0, 5]);
    // 3 + 5 between the centrelines, plus a half thickness each side.
    expect(chains!.box.maxX - chains!.box.minX).toBeCloseTo(8.15, 2);
    expect(chains!.box.maxZ - chains!.box.minZ).toBeCloseTo(5.15, 2);
  });

  it('leaves the partition out of the sides it does not face, and a plan without walls alone', () => {
    const chains = outerDimensionChains(twoRooms())!;
    // The partition between the rooms faces neither left nor right: it is interior.
    expect(chains.left).toHaveLength(2);
    expect(outerDimensionChains({ rooms: [], walls: [] })).toBeNull();
  });
});

describe('formatDimension', () => {
  it('writes lengths to the centimetre without trailing zeros', () => {
    expect(formatDimension(3, 'm')).toBe('3 m');
    expect(formatDimension(5.2, 'm')).toBe('5.2 m');
    expect(formatDimension(8.349, 'm')).toBe('8.35 m');
  });
});

describe('drawBaseFinishes', () => {
  /** A canvas that only counts what is filled. */
  const canvas = () => {
    const fills: string[] = [];
    const ctx = { fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, fill() { fills.push(String(this.fillStyle)); }, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {} };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
  };
  const plan = twoRooms();
  const product = { productId: 5, nameKa: 'ლამინატი', pricePerUnit: 20, unit: 'm2', qty: 14, totalPrice: 280, colorHex: '#6B4A32', categorySlug: 'laminate' } as SceneProduct;
  const floor = (origin: SurfaceFinish['origin']): SurfaceFinish => ({ roomId: plan.rooms[0].id, surface: 'floor', colorHex: '#6B4A32', textureUrl: '/t.jpg', textureScaleM: 1, product, origin });

  it('tints a floor somebody chose, and leaves the style’s own as the sheet’s paper though it is a product too', () => {
    const chosen = canvas();
    drawBaseFinishes(chosen.ctx, { scale: 50, offsetX: 0, offsetY: 0 }, plan, [floor('studio')]);
    expect(chosen.fills).toEqual(['#6B4A32']);
    const style = canvas();
    drawBaseFinishes(style.ctx, { scale: 50, offsetX: 0, offsetY: 0 }, plan, [floor('style')]);
    expect(style.fills).toEqual([]);
  });
});
