import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { IDLE_GRACE_MS, MAX_IDLE_TEXTURES, StyleMaterials, type TextureSource } from '@/lib/design3d/materials';
import { buildPaintedCells } from '@/lib/design3d/buildStructure';
import { paintCell } from '@/lib/design/paint';
import { polygonAreaM2, polygonPerimeterM } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlanRoom, SurfaceFinish } from '@/lib/design/types';

/**
 * Every floor or wall finish tried used to stay on the GPU until the studio closed — up to
 * three 1024-pixel maps each. `releaseUnused` lets go of what the shells no longer wear.
 */

/** Textures without a `document`: nothing loads, and each texture reports its own disposal. */
class FakeLoader implements TextureSource {
  loaded: Array<{ url: string; texture: THREE.Texture; done: (texture: THREE.Texture) => void }> = [];
  load(url: string, onLoad?: (texture: THREE.Texture) => void): THREE.Texture {
    const texture = new THREE.Texture();
    this.loaded.push({ url, texture, done: (t) => onLoad?.(t) });
    return texture;
  }
  texture(url: string): THREE.Texture {
    return this.loaded.find((l) => l.url === url)!.texture;
  }
}

const style = getStyle('scandinavian');
const spec = style.surfaces.floor;
const tile = (url: string) => ({ textureUrl: url, normalUrl: null, roughnessUrl: null });

describe('StyleMaterials.releaseUnused', () => {
  it('keeps what is worn, keeps an unused finish for a grace period, then lets it go with its map', () => {
    const loader = new FakeLoader();
    const materials = new StyleMaterials(style, loader);
    const oak = materials.metreSurface(spec, tile('/oak.jpg'));
    const marble = materials.metreSurface(spec, tile('/marble.jpg'));
    const oakMaterialGone = vi.fn();
    oak.addEventListener('dispose', oakMaterialGone);
    const oakMapGone = vi.fn();
    loader.texture('/oak.jpg').addEventListener('dispose', oakMapGone);
    const marbleMapGone = vi.fn();
    loader.texture('/marble.jpg').addEventListener('dispose', marbleMapGone);

    // The oak floor painted over with marble: the oak stays a while — an undo brings it back.
    expect(materials.releaseUnused(new Set([marble]), 1_000)).toBe(0);
    expect(materials.metreSurface(spec, tile('/oak.jpg'))).toBe(oak);
    expect(materials.releaseUnused(new Set([marble]), 1_000 + IDLE_GRACE_MS - 1)).toBe(0);

    expect(materials.releaseUnused(new Set([marble]), 1_000 + IDLE_GRACE_MS)).toBe(1);
    expect(oakMaterialGone).toHaveBeenCalled();
    expect(oakMapGone).toHaveBeenCalled();
    expect(marbleMapGone).not.toHaveBeenCalled();
    // Asked for again, it is made afresh.
    expect(materials.metreSurface(spec, tile('/oak.jpg'))).not.toBe(oak);
  });

  it('forgets the idle clock of a finish that is worn again', () => {
    const materials = new StyleMaterials(style, new FakeLoader());
    const oak = materials.metreSurface(spec, tile('/oak.jpg'));
    materials.releaseUnused(new Set(), 0);
    materials.releaseUnused(new Set([oak]), IDLE_GRACE_MS / 2);
    expect(materials.releaseUnused(new Set(), IDLE_GRACE_MS + 1)).toBe(0);
  });

  it('keeps a map another worn finish still uses', () => {
    const loader = new FakeLoader();
    const materials = new StyleMaterials(style, loader);
    const light = materials.metreSurface(spec, { ...tile('/oak.jpg'), colorHex: '#ffffff' });
    const dark = materials.metreSurface(spec, { ...tile('/oak.jpg'), colorHex: '#333333' });
    expect(light).not.toBe(dark);
    const mapGone = vi.fn();
    loader.texture('/oak.jpg').addEventListener('dispose', mapGone);
    expect(materials.releaseUnused(new Set([dark]), IDLE_GRACE_MS * 2)).toBe(0);
    expect(materials.releaseUnused(new Set([dark]), IDLE_GRACE_MS * 4)).toBe(1);
    expect(mapGone).not.toHaveBeenCalled();
  });

  it('caps what idle finishes hold: the longest idle go at once when too many tiles are tried', () => {
    const materials = new StyleMaterials(style, new FakeLoader());
    const tried = Array.from({ length: MAX_IDLE_TEXTURES + 6 }, (_, i) => materials.metreSurface(spec, tile(`/tile-${i}.jpg`)));
    const gone = tried.map((material) => {
      const fn = vi.fn();
      material.addEventListener('dispose', fn);
      return fn;
    });
    expect(materials.releaseUnused(new Set(), 0)).toBe(6);
    expect(gone.slice(0, 6).every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(gone.slice(6).some((fn) => fn.mock.calls.length > 0)).toBe(false);
  });

  it('never lets go of the role materials, which carry no map', () => {
    const materials = new StyleMaterials(style, new FakeLoader());
    const glass = materials.get('glass');
    materials.releaseUnused(new Set(), IDLE_GRACE_MS * 10);
    expect(materials.get('glass')).toBe(glass);
  });

  it('drops a map that arrives after its finish was let go', () => {
    const loader = new FakeLoader();
    const materials = new StyleMaterials(style, loader);
    const oak = materials.metreSurface(spec, tile('/oak.jpg'));
    materials.releaseUnused(new Set(), 0);
    materials.releaseUnused(new Set(), IDLE_GRACE_MS);
    loader.loaded[0].done(loader.loaded[0].texture);
    expect(oak.map).toBeNull();
  });
});

describe('painted floor tiles', () => {
  const polygon = [
    { x: 1, z: 1 },
    { x: 4.32, z: 1 },
    { x: 4.32, z: 3.5 },
    { x: 1, z: 3.5 },
  ];
  const room: PlanRoom = { id: 'r', type: 'bedroom', name: 'Bedroom', polygon, heightM: 2.8, areaM2: polygonAreaM2(polygon), perimeterM: polygonPerimeterM(polygon), openings: [] };
  const plan: FloorPlan = { rooms: [room], metresPerPixel: null, bounds: { width: 5, depth: 4 }, source: 'manual', wallThicknessM: 0.12 };
  const product = (id: number) => ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: 'tiles', pricePerUnit: 10, unit: 'm2', imageUrl: null, colorHex: '#aabbcc', textureUrl: `/t${id}.jpg`, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: [], tags: [], isFeatured: false, specs: { surfaces: ['floor'] }, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;

  it('are one mesh per finish, however many square metres were painted', () => {
    let finishes: SurfaceFinish[] = [];
    for (const cell of [[0, 0], [1, 0], [2, 0], [3, 2]] as Array<[number, number]>) finishes = paintCell(finishes, room, cell, product(1));
    finishes = paintCell(finishes, room, [0, 1], product(2));
    const group = buildPaintedCells(plan, finishes, new StyleMaterials(style, new FakeLoader()), style);
    const meshes = group.children as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    // Three whole tiles and a clipped corner: two triangles each.
    const oak = meshes.find((m) => m.geometry.index!.count === 4 * 6);
    expect(oak).toBeDefined();
    expect(oak!.userData).toMatchObject({ pickKind: 'surface', roomId: 'r', surface: 'floor' });
  });
});

describe('a finish whose picture did not arrive', () => {
  /** Fails every load, later (as a browser does) or at once (as the node stand-in does). */
  class FailingLoader implements TextureSource {
    calls = 0;
    pending: Array<() => void> = [];
    constructor(private readonly atOnce: boolean) {}
    load(_url: string, _onLoad?: (texture: THREE.Texture) => void, _onProgress?: unknown, onError?: (error: unknown) => void): THREE.Texture {
      this.calls += 1;
      const texture = new THREE.Texture();
      if (this.atOnce) onError?.(new Error('404'));
      else this.pending.push(() => onError?.(new Error('404')));
      return texture;
    }
  }

  it.each([false, true])('is asked for again by the next surface that wears it (failing at once: %s)', (atOnce) => {
    const loader = new FailingLoader(atOnce);
    const materials = new StyleMaterials(style, loader);
    materials.metreSurface(spec, tile('/gone.jpg'));
    for (const fail of loader.pending.splice(0)) fail();
    // Another surface with the same picture at the same scale (the same texture, a new material):
    // the texture is not kept image-less, it is loaded again.
    materials.metreSurface(spec, { ...tile('/gone.jpg'), colorHex: '#123456' });
    expect(loader.calls).toBe(2);
  });
});
