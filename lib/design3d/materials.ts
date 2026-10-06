/**
 * Material factory for the 3D studio.
 *
 * Every material and texture is cached by key, because a furnished flat asks for the same
 * oak, the same wool and the same brushed steel hundreds of times and creating a fresh
 * `MeshStandardMaterial` per mesh would cost a shader compile each.
 *
 * Textures come from the partner asset drop via `scripts/extract-assets.sh`; anything without
 * a texture falls back to a flat colour from the style palette, so the scene renders correctly
 * before (or without) any image loading.
 */

import * as THREE from 'three';
import type { StyleDefinition, StyleSurface } from '@/lib/design/types';
import { loadStarted } from './loadProgress';

export type MaterialRole =
  | 'frame'
  | 'wood'
  | 'upholstery'
  | 'metal'
  | 'accent'
  | 'textile'
  | 'glass'
  | 'mirror'
  | 'ceramic'
  | 'stone'
  | 'foliage'
  | 'lampshade'
  | 'emissive';

export interface MaterialOptions {
  /** Overrides the palette colour — used when a real product has a known colour. */
  colorHex?: string | null;
  roughness?: number;
  metalness?: number;
}

/** How long a surface material no surface wears is kept, for a room put back in view or an undo. */
export const IDLE_GRACE_MS = 30_000;
/**
 * How many textures idle materials may hold between them before the oldest go at once. A
 * 1024-pixel map is about 5.6 MB of GPU memory with its mipmaps, so this caps the idle ones
 * near 130 MB however many tiles are tried in a row.
 */
export const MAX_IDLE_TEXTURES = 24;

/** What loads a texture: three's `TextureLoader`, or a stand-in in the tests. */
export interface TextureSource {
  load(url: string, onLoad?: (texture: THREE.Texture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): THREE.Texture;
}

/**
 * Where there is no `document` to load an image into — a test building the shell in Node —
 * every map fails at once and the surface keeps its flat colour.
 */
const NO_IMAGES: TextureSource = {
  load(_url, _onLoad, _onProgress, onError) {
    onError?.(new Error('no document'));
    return new THREE.Texture();
  },
};

/**
 * Owns every material and texture for one rendered scene.
 *
 * Call `dispose()` when the viewer unmounts — Three.js does not garbage-collect GPU
 * resources, so a studio session that swapped styles a few times would otherwise leak
 * every texture it ever loaded. Within a session the surfaces (floor, wall and ceiling
 * finishes, `surface` / `metreSurface` / `photo`) are let go once nothing wears them
 * (`releaseUnused`, after every rebuild of the room shells): every tile tried used to stay on
 * the GPU until the studio closed. The role materials (`get`) are few, carry no texture and stay.
 */
export class StyleMaterials {
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Map<string, THREE.Texture>();
  /** Who is waiting for a texture whose image has not arrived yet. */
  private pending = new Map<string, Array<(texture: THREE.Texture) => void>>();
  /** The surface materials and the texture keys each one asked for — what `releaseUnused` may let go. */
  private surfaceTextures = new Map<THREE.MeshStandardMaterial, string[]>();
  /** When each surface material was last seen unused, while it still is. */
  private idleSince = new Map<THREE.MeshStandardMaterial, number>();
  private loader: TextureSource;

  constructor(
    public style: StyleDefinition,
    loader: TextureSource = typeof document === 'undefined' ? NO_IMAGES : new THREE.TextureLoader()
  ) {
    this.loader = loader;
  }

  // -------------------------------------------------------------------------
  // Furniture
  // -------------------------------------------------------------------------

  get(role: MaterialRole, options: MaterialOptions = {}): THREE.MeshStandardMaterial {
    const base = this.roleDefaults(role);
    const color = options.colorHex ?? base.color;
    const roughness = options.roughness ?? base.roughness;
    const metalness = options.metalness ?? base.metalness;

    const key = `${role}|${color}|${roughness}|${metalness}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      transparent: base.opacity < 1,
      opacity: base.opacity,
      side: THREE.FrontSide,
    });

    if (role === 'emissive') {
      material.emissive = new THREE.Color(this.style.lighting.lamp);
      material.emissiveIntensity = 1.4;
    }
    if (role === 'lampshade') {
      material.emissive = new THREE.Color(this.style.lighting.lamp);
      material.emissiveIntensity = 0.35;
    }

    this.materials.set(key, material);
    return material;
  }

  private roleDefaults(role: MaterialRole): {
    color: string;
    roughness: number;
    metalness: number;
    opacity: number;
  } {
    const p = this.style.palette;
    switch (role) {
      case 'frame':
        return { color: p.frame, roughness: 0.62, metalness: 0.05, opacity: 1 };
      case 'wood':
        return { color: p.wood, roughness: 0.58, metalness: 0, opacity: 1 };
      case 'upholstery':
        return { color: p.upholstery, roughness: 0.92, metalness: 0, opacity: 1 };
      case 'metal':
        return { color: p.metal, roughness: 0.32, metalness: 0.85, opacity: 1 };
      case 'accent':
        return { color: p.accent, roughness: 0.55, metalness: 0.1, opacity: 1 };
      case 'textile':
        return { color: p.textile, roughness: 0.95, metalness: 0, opacity: 1 };
      case 'glass':
        return { color: '#CFE0E6', roughness: 0.06, metalness: 0.1, opacity: 0.28 };
      case 'mirror':
        return { color: '#DCE6EA', roughness: 0.04, metalness: 0.95, opacity: 1 };
      case 'ceramic':
        return { color: '#F6F6F4', roughness: 0.16, metalness: 0.02, opacity: 1 };
      case 'stone':
        return { color: '#8E8E8A', roughness: 0.5, metalness: 0.05, opacity: 1 };
      case 'foliage':
        return { color: '#4C7A4A', roughness: 0.85, metalness: 0, opacity: 1 };
      case 'lampshade':
        return { color: '#F5EFE2', roughness: 0.8, metalness: 0, opacity: 1 };
      case 'emissive':
        return { color: '#FFF6E0', roughness: 1, metalness: 0, opacity: 1 };
      default:
        return { color: p.frame, roughness: 0.7, metalness: 0, opacity: 1 };
    }
  }

  // -------------------------------------------------------------------------
  // Surfaces (floor / wall / ceiling)
  // -------------------------------------------------------------------------

  /**
   * Builds a surface material.
   *
   * `repeatOverM` is the real size of the surface in metres, so the texture tiles at its
   * true physical scale — a 4 m wall shows twice as many bricks as a 2 m one instead of
   * stretching the same image across both.
   */
  surface(
    spec: StyleSurface,
    repeatOverM: { u: number; v: number },
    overrides: {
      colorHex?: string | null;
      textureUrl?: string | null;
      textureScaleM?: number | null;
      /** undefined keeps the style's map; null removes it — a chosen tile brings its own. */
      normalUrl?: string | null;
      roughnessUrl?: string | null;
    } = {}
  ): THREE.MeshStandardMaterial {
    const textureUrl = overrides.textureUrl ?? spec.textureUrl ?? null;
    const color = overrides.colorHex ?? spec.colorHex;
    const scale = overrides.textureScaleM ?? spec.textureScaleM ?? 2;
    const normalUrl = overrides.normalUrl === undefined ? spec.normalUrl : overrides.normalUrl;
    const roughnessUrl = overrides.roughnessUrl === undefined ? spec.roughnessUrl : overrides.roughnessUrl;
    const repeatU = Math.max(0.25, repeatOverM.u / scale);
    const repeatV = Math.max(0.25, repeatOverM.v / scale);

    const key = `surface|${textureUrl}|${color}|${repeatU.toFixed(2)}|${repeatV.toFixed(2)}|${normalUrl}|${roughnessUrl}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: spec.roughness ?? 0.85,
      metalness: spec.metalness ?? 0,
      side: THREE.FrontSide,
    });
    const textureKeys: string[] = [];
    this.surfaceTextures.set(material, textureKeys);

    // Every map is put on the material when its image has arrived, not before: a texture
    // with no image yet samples as black (and a normal map as a normal pointing nowhere),
    // so a wall strip painted a moment ago stood pitch black until its file came in. Until
    // then the surface shows its flat colour.
    if (textureUrl) {
      textureKeys.push(
        this.whenLoaded(textureUrl, repeatU, repeatV, true, (texture) => {
          material.map = texture;
          // A textured surface carries its own colour; tinting it again muddies the image.
          material.color.set('#FFFFFF');
          material.needsUpdate = true;
        })
      );
    }
    if (normalUrl) {
      textureKeys.push(
        this.whenLoaded(normalUrl, repeatU, repeatV, false, (texture) => {
          material.normalMap = texture;
          material.normalScale = new THREE.Vector2(0.6, 0.6);
          material.needsUpdate = true;
        })
      );
    }
    if (roughnessUrl) {
      textureKeys.push(
        this.whenLoaded(roughnessUrl, repeatU, repeatV, false, (texture) => {
          material.roughnessMap = texture;
          material.needsUpdate = true;
        })
      );
    }

    this.materials.set(key, material);
    return material;
  }

  /**
   * A surface material for geometry whose UVs are in **metres** — which is every surface
   * the studio builds (a `ShapeGeometry` floor carries its plan coordinates as UVs, the
   * walls write theirs out in metres along and up). One tile of the texture then covers
   * `textureScaleM` metres on every surface, whatever its size: a plank is as long in the
   * hall as in the living room, and a pattern runs on unbroken from one painted strip of a
   * wall to the next. Passing a surface's own size to `surface()` with metre UVs tiled the
   * texture by the *square* of the size — a four-metre wall got four times the bricks per
   * metre that a two-metre wall did.
   */
  metreSurface(spec: StyleSurface, overrides: Parameters<StyleMaterials['surface']>[2] = {}): THREE.MeshStandardMaterial {
    return this.surface(spec, { u: 1, v: 1 }, overrides);
  }

  /** Hands `apply` the texture once its image is in — at once when it already is. Returns the texture's key. */
  private whenLoaded(url: string, repeatU: number, repeatV: number, srgb: boolean, apply: (texture: THREE.Texture) => void): string {
    const key = `${url}|${repeatU.toFixed(2)}|${repeatV.toFixed(2)}|${srgb}`;
    const cached = this.textures.get(key);
    if (cached) {
      const waiting = this.pending.get(key);
      if (waiting) waiting.push(apply);
      else apply(cached);
      return key;
    }

    this.pending.set(key, [apply]);
    // Counted until it is in or has failed: the loading screen waits on the finishes too.
    const done = loadStarted();
    let failedAtOnce = false;
    // Null until `load` returns: a loader that fails at once calls back before that.
    let loading: THREE.Texture | null = null;
    loading = this.loader.load(
      url,
      (loaded) => {
        done();
        const waiting = this.pending.get(key) ?? [];
        this.pending.delete(key);
        // Disposed while the file was on its way (the style changed): nobody wants it now.
        if (this.textures.get(key) !== loaded) return;
        for (const callback of waiting) callback(loaded);
      },
      undefined,
      () => {
        done();
        this.pending.delete(key);
        // Forgotten, so the next surface that wants it asks again: kept, the image-less texture
        // sampled black on every later use until the page was reloaded.
        if (loading && this.textures.get(key) === loading) {
          this.textures.delete(key);
          loading.dispose();
        } else failedAtOnce = true;
      }
    );
    const texture = loading;
    if (failedAtOnce) {
      texture.dispose();
      return key;
    }
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatU, repeatV);
    texture.anisotropy = 8;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, texture);
    return key;
  }

  /**
   * Lets go of the surface materials nothing wears any more, and of the textures only they
   * held. `inUse` is every material on screen that came from here (the viewer collects the
   * room shells'). An unused one is kept for `IDLE_GRACE_MS` — a room back in view, an undo —
   * unless the idle ones hold more than `MAX_IDLE_TEXTURES` textures between them, and then
   * the longest idle go first. Returns how many materials were released.
   */
  releaseUnused(inUse: ReadonlySet<THREE.Material>, now: number = Date.now()): number {
    for (const material of this.surfaceTextures.keys()) {
      if (inUse.has(material)) this.idleSince.delete(material);
      else if (!this.idleSince.has(material)) this.idleSince.set(material, now);
    }
    const idle = [...this.idleSince].sort((a, b) => a[1] - b[1]);
    const doomed = new Set<THREE.MeshStandardMaterial>(idle.filter(([, since]) => now - since >= IDLE_GRACE_MS).map(([material]) => material));
    // Textures in use stay whatever happens; the idle ones are counted against the cap.
    const worn = new Set<string>();
    for (const [material, keys] of this.surfaceTextures) if (inUse.has(material)) keys.forEach((key) => worn.add(key));
    const idleTextures = () => {
      const keys = new Set<string>();
      for (const [material] of idle) if (!doomed.has(material)) for (const key of this.surfaceTextures.get(material) ?? []) if (!worn.has(key)) keys.add(key);
      return keys.size;
    };
    for (const [material] of idle) {
      if (idleTextures() <= MAX_IDLE_TEXTURES) break;
      doomed.add(material);
    }

    for (const [key, material] of this.materials) {
      if (!doomed.has(material)) continue;
      material.dispose();
      this.materials.delete(key);
      this.surfaceTextures.delete(material);
      this.idleSince.delete(material);
    }
    const held = new Set<string>();
    for (const keys of this.surfaceTextures.values()) keys.forEach((key) => held.add(key));
    for (const [key, texture] of this.textures) {
      if (held.has(key)) continue;
      // Still on its way: the load callback finds it gone and drops it (`whenLoaded`).
      texture.dispose();
      this.textures.delete(key);
      this.pending.delete(key);
    }
    return doomed.size;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.materials.clear();
    this.textures.clear();
    this.pending.clear();
    this.surfaceTextures.clear();
    this.idleSince.clear();
  }
}
