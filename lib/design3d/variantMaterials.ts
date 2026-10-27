/**
 * A product's material variant on its model (`lib/design/variants.ts`): the GLB's materials a
 * variant names, by name, replaced with copies in the variant's look — every other part as the
 * file has it. Shared by the studio (`buildPlacedItem`) and the product form's turntable.
 *
 * What a slot does to its material:
 *  - a colour map of its own (`colorUrl`): laid on the model's own UVs, `repeat` times across them,
 *    under the slot's colour (white by default), with its normal and roughness maps;
 *  - a colour over the part's texture (`keepTexture`, the default): the texture made grey — its
 *    light and shade kept, its colour gone — so a brown leather becomes a black or a white one
 *    with the same grain, which a plain multiply cannot do (white over brown stays brown);
 *  - a plain colour (`keepTexture: false`): the texture dropped;
 *  - `roughness`: how glossy, 0 to 1.
 *
 * Copies are cached per original material and look, so forty chairs in one fabric share one
 * material; textures by URL. The model cache's clones share the originals, so the originals are
 * never changed. glTF textures are not flipped (`flipY = false`), and the new ones are read the
 * same way.
 */

import * as THREE from 'three';
import type { VariantSlot } from '@/lib/design/variants';
import { releaseMaterial } from './gpuRelease';

export interface VariantLook {
  id: string;
  slots: VariantSlot[];
}

export interface VariantMaterials {
  /** Gives the meshes under `root` the look's materials where it names them; `null` puts the file's own back. */
  apply(root: THREE.Object3D, look: VariantLook | null): void;
  /** Lets go of the GPU copies for a renderer that is going away; the objects stay whole (`gpuRelease.ts`). */
  release(): void;
  /** Frees everything — for a turntable that is closing. */
  dispose(): void;
}

/** How much of the texture's own light and shade a recoloured part keeps. */
const GRAIN_RELIEF = 0.85;
/** The grey map's mean: below 1 so the grain's highlights are not cut off; the colour is lifted by its inverse. */
const GRAIN_MEAN = 0.8;
/** A grey map is made at most this big; the grain does not need more. */
const GRAIN_MAX_PX = 1024;

type Standard = THREE.MeshStandardMaterial;

export function createVariantMaterials(): VariantMaterials {
  const loader = new THREE.TextureLoader();
  const textures = new Map<string, THREE.Texture>();
  const greyMaps = new Map<string, THREE.Texture | null>();
  const copies = new Map<string, THREE.Material>();
  /** Each mesh's own material(s), from before any look was put on it. */
  const originals = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

  const texture = (url: string, colour: boolean, repeat: number): THREE.Texture => {
    const key = `${url}|${colour ? 'c' : 'd'}|${repeat}`;
    let tex = textures.get(key);
    if (!tex) {
      tex = loader.load(url);
      tex.flipY = false;
      tex.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = 4;
      textures.set(key, tex);
    }
    return tex;
  };

  /** The texture's light and shade alone, around `GRAIN_MEAN`; null when its picture cannot be read. */
  const greyOf = (map: THREE.Texture): THREE.Texture | null => {
    if (greyMaps.has(map.uuid)) return greyMaps.get(map.uuid)!;
    let grey: THREE.Texture | null = null;
    try {
      const image = map.image as CanvasImageSource & { width: number; height: number };
      if (image && image.width > 0 && image.height > 0 && typeof document !== 'undefined') {
        const scale = Math.min(1, GRAIN_MAX_PX / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = pixels.data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          const mean = Math.max(1, sum / (d.length / 4));
          for (let i = 0; i < d.length; i += 4) {
            const shade = (1 + ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / mean - 1) * GRAIN_RELIEF) * GRAIN_MEAN;
            const v = Math.max(0, Math.min(255, Math.round(shade * 255)));
            d[i] = d[i + 1] = d[i + 2] = v;
          }
          ctx.putImageData(pixels, 0, 0);
          const made = new THREE.CanvasTexture(canvas);
          made.flipY = map.flipY;
          // A multiplier, not a colour: read as it is stored.
          made.colorSpace = THREE.NoColorSpace;
          made.wrapS = map.wrapS;
          made.wrapT = map.wrapT;
          made.repeat.copy(map.repeat);
          made.offset.copy(map.offset);
          made.rotation = map.rotation;
          made.channel = map.channel;
          made.anisotropy = 4;
          grey = made;
        }
      }
    } catch {
      grey = null; // a picture the canvas may not read: the colour is laid over the texture as it is
    }
    greyMaps.set(map.uuid, grey);
    return grey;
  };

  const copyFor = (base: THREE.Material, slot: VariantSlot, lookId: string): THREE.Material => {
    const key = `${base.uuid}|${lookId}|${JSON.stringify(slot)}`;
    const known = copies.get(key);
    if (known) return known;
    const m = base.clone() as Standard;
    const hasColour = 'color' in m && m.color instanceof THREE.Color;
    const repeat = slot.repeat ?? 1;
    if (slot.colorUrl) {
      m.map = texture(slot.colorUrl, true, repeat);
      if (hasColour) m.color.set(slot.colorHex ?? '#FFFFFF');
    } else if (slot.colorHex && hasColour) {
      const grey = slot.keepTexture === false || !m.map ? null : greyOf(m.map);
      if (slot.keepTexture === false) m.map = null;
      if (grey) {
        m.map = grey;
        m.color.set(slot.colorHex).multiplyScalar(1 / GRAIN_MEAN);
      } else m.color.set(slot.colorHex);
    }
    if ('normalMap' in m && slot.normalUrl) m.normalMap = texture(slot.normalUrl, false, repeat);
    if ('roughnessMap' in m && slot.roughnessUrl) m.roughnessMap = texture(slot.roughnessUrl, false, repeat);
    if ('roughness' in m && slot.roughness != null) m.roughness = slot.roughness;
    m.name = base.name;
    m.needsUpdate = true;
    copies.set(key, m);
    return m;
  };

  const lookFor = (base: THREE.Material, look: VariantLook | null): THREE.Material => {
    const slot = look?.slots.find((s) => s.material === base.name);
    return slot && look ? copyFor(base, slot, look.id) : base;
  };

  return {
    apply(root, look) {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mesh = child as THREE.Mesh;
        if (!originals.has(mesh)) originals.set(mesh, mesh.material);
        const own = originals.get(mesh)!;
        mesh.material = Array.isArray(own) ? own.map((m) => lookFor(m, look)) : lookFor(own, look);
      });
    },
    release() {
      copies.forEach(releaseMaterial);
      textures.forEach((t) => t.dispose());
      greyMaps.forEach((t) => t?.dispose());
    },
    dispose() {
      copies.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      greyMaps.forEach((t) => t?.dispose());
      copies.clear();
      textures.clear();
      greyMaps.clear();
    },
  };
}
