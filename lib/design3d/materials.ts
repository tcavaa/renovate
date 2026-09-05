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

/**
 * Owns every material and texture for one rendered scene.
 *
 * Call `dispose()` when the viewer unmounts — Three.js does not garbage-collect GPU
 * resources, so a studio session that swapped styles a few times would otherwise leak
 * every texture it ever loaded.
 */
export class StyleMaterials {
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();

  constructor(public style: StyleDefinition) {}

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

    if (textureUrl) {
      material.map = this.texture(textureUrl, repeatU, repeatV, true);
      // A textured surface carries its own colour; tinting it again muddies the image.
      material.color.set('#FFFFFF');
    }
    if (normalUrl) {
      material.normalMap = this.texture(normalUrl, repeatU, repeatV, false);
      material.normalScale = new THREE.Vector2(0.6, 0.6);
    }
    if (roughnessUrl) {
      material.roughnessMap = this.texture(roughnessUrl, repeatU, repeatV, false);
    }

    this.materials.set(key, material);
    return material;
  }

  private texture(url: string, repeatU: number, repeatV: number, srgb: boolean): THREE.Texture {
    const key = `${url}|${repeatU.toFixed(2)}|${repeatV.toFixed(2)}|${srgb}`;
    const cached = this.textures.get(key);
    if (cached) return cached;

    const texture = this.loader.load(url);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatU, repeatV);
    texture.anisotropy = 8;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;

    this.textures.set(key, texture);
    return texture;
  }

  /** A product photo shown on a billboard when there is no better geometry for it. */
  photo(url: string): THREE.MeshStandardMaterial {
    const key = `photo|${url}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    const texture = this.loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.textures.set(key, texture);
    this.materials.set(key, material);
    return material;
  }

  /** Highlight applied to whatever the pointer is over. */
  highlight(): THREE.MeshStandardMaterial {
    return this.get('accent', { roughness: 0.3, metalness: 0.2 });
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.materials.clear();
    this.textures.clear();
  }
}
