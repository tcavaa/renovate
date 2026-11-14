import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { SHOWER_GLASS_HEIGHT_M, SHOWER_GLASS_MAX_THICKNESS_M, SHOWER_GLASS_THICKNESS_M, dragShowerHandle, resizedShower, showerArea, showerGlass, showerHandleSpots } from '@/lib/design/shower';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';

/** A shower's tray and glass (lib/design/shower.ts): the glass on the sides off the walls, following the piece. */

const bath: PlanRoom = refreshRoom({ id: 'b', type: 'bathroom', name: 'b', polygon: [{ x: 0, z: 0 }, { x: 2.4, z: 0 }, { x: 2.4, z: 2 }, { x: 0, z: 2 }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

/** A column 50 × 30 cm standing at the back of a 90 × 90 tray in the room's top-right corner, facing +z. */
const shower = (extra: Partial<PlacedItem> = {}): PlacedItem => ({ id: 's', roomId: 'b', slot: 'shower', kind: 'shower', position: { x: 1.94, z: 0.16 }, rotation: 0, elevationM: 0, size: { width: 0.5, depth: 0.3, height: 2.2 }, product: null, areaM: { width: 0.9, depth: 0.9 }, ...extra });

describe('a shower\'s area', () => {
  it('is found from the piece: its back on the piece\'s back, centred across it', () => {
    const area = showerArea(shower())!;
    expect(area.centre.x).toBeCloseTo(1.94, 5);
    expect(area.centre.z).toBeCloseTo(0.01 + 0.45, 5);
    expect(showerArea({ ...shower(), slot: 'sink' })).toBeNull();
  });
});

describe('a shower\'s glass', () => {
  it('stands on the sides of the tray off the walls — its front and the side away from the corner — 3 cm thick, 2 m tall', () => {
    const panes = showerGlass(shower(), bath);
    expect(panes).toHaveLength(2);
    for (const pane of panes) {
      expect(pane.thicknessM).toBe(SHOWER_GLASS_THICKNESS_M);
      expect(pane.heightM).toBe(SHOWER_GLASS_HEIGHT_M);
    }
    // The front pane along z ≈ 0.91, the side one along x ≈ 1.49, each inside the tray by half the glass.
    const front = panes.find((p) => Math.abs(p.a.z - p.b.z) < 1e-6)!;
    const side = panes.find((p) => Math.abs(p.a.x - p.b.x) < 1e-6)!;
    expect(front.a.z).toBeCloseTo(0.91 - 0.015, 5);
    expect(side.a.x).toBeCloseTo(1.49 + 0.015, 5);
  });

  it('follows the shower when it is moved to another corner', () => {
    const moved = shower({ position: { x: 0.46, z: 1.84 }, rotation: Math.PI });
    const panes = showerGlass(moved, bath);
    expect(panes).toHaveLength(2);
    expect(panes.some((p) => Math.abs(p.a.x - p.b.x) < 1e-6 && p.a.x > 0.85 && p.a.x < 0.92)).toBe(true);
  });

  it('is laid out with the shower and stays round it once the column is matched', () => {
    const room = refreshRoom({ ...bath, openings: [{ id: 'd', roomId: 'b', kind: 'door', wallIndex: 2, t: 0.7, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false }] });
    const laid = layoutRoom(room).find((i) => i.slot === 'shower')!;
    const column = { id: 1, nameKa: 'c', slug: 'c', brand: null, categorySlug: 'showers', pricePerUnit: 600, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: 'shower', model3dUrl: '/c.glb', widthCm: 50, depthCm: 30, heightCm: 220, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null } as CatalogProduct;
    const [matched] = matchProducts([laid], [column], { styleId: 'modern', rooms: [room] });
    const before = showerArea(laid)!;
    const after = showerArea(matched)!;
    // The column closes the layout's centimetre to the wall, and the tray with it.
    expect(Math.hypot(after.centre.x - before.centre.x, after.centre.z - before.centre.z)).toBeLessThan(0.02);
    expect(showerGlass(matched, room).length).toBeGreaterThan(0);
  });
});

describe('resizing a shower on its card', () => {
  it('keeps the side on the wall where it is, and its glass between 2 and 5 cm', () => {
    const next = resizedShower(shower(), bath, { widthM: 1.2, glassThicknessM: 0.09 })!;
    expect(next.areaM).toEqual({ width: 1.2, depth: 0.9 });
    expect(next.glass?.thicknessM).toBe(SHOWER_GLASS_MAX_THICKNESS_M);
    // The right side was on the wall (x = 2.4): the piece moves left by half the change.
    expect(next.position!.x).toBeCloseTo(1.94 - 0.15, 5);
    const grown = showerArea({ ...shower(), ...next })!;
    expect(grown.centre.x + grown.width / 2).toBeCloseTo(2.39, 5);
  });
});

describe('a shower\'s arrows', () => {
  it('stand on the sides off the walls, the front and the top of the glass', () => {
    const found = showerHandleSpots(shower(), bath)!;
    const panes = showerGlass(shower(), bath).length;
    // One arrow a pane of glass (a side on a wall has neither), and the one on top.
    expect(found.spots.length).toBe(panes + 1);
    expect(found.spots.some((s) => s.handle === 'top' && s.facing === null && s.y === SHOWER_GLASS_HEIGHT_M)).toBe(true);
    expect(found.spots.some((s) => s.handle === 'front')).toBe(true);
  });

  it('dragged, ask for the size the pointer is at', () => {
    const item = shower();
    const area = showerArea(item)!;
    const forward = { x: Math.sin(area.rotation), z: Math.cos(area.rotation) };
    // The front pulled 30 cm further out than it is.
    const out = area.depth / 2 + 0.3;
    const front = dragShowerHandle(item, bath, 'front', { x: area.centre.x + forward.x * out, z: area.centre.z + forward.z * out }, 1)!;
    expect(front.depthM).toBeCloseTo(area.depth + 0.3, 2);
    expect(resizedShower(item, bath, front)!.areaM!.depth).toBeCloseTo(area.depth + 0.3, 2);
    // The top: the glass as tall as the pointer is high, kept in bounds by the resize.
    expect(dragShowerHandle(item, bath, 'top', area.centre, 2.25)).toEqual({ glassHeightM: 2.25 });
    expect(resizedShower(item, bath, { glassHeightM: 9 })!.glass!.heightM).toBe(2.6);
    // A free side: from the side on a wall when there is one, so the tray grows by what it is pulled.
    const side = showerHandleSpots(item, bath)!.spots.find((s) => s.handle === 'left' || s.handle === 'right');
    if (side && side.facing && showerHandleSpots(item, bath)!.spots.filter((s) => s.handle === 'left' || s.handle === 'right').length === 1) {
      const pulled = dragShowerHandle(item, bath, side.handle, { x: side.at.x + side.facing.x * 0.2, z: side.at.z + side.facing.z * 0.2 }, 1)!;
      expect(pulled.widthM).toBeCloseTo(area.width + 0.2, 2);
    }
  });
});
