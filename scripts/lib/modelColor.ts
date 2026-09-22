/**
 * The colours a model is, read off the model itself.
 *
 * The shelf's colour filter needs to know that a sofa is pink and a bed is oak under white
 * linen, and nobody is going to type that in for two hundred models — nor would the product
 * photo say it reliably (a white sofa on a white backdrop has no colour at all). The GLB
 * does: every triangle has an area and a colour, the colour being the material's base factor
 * times the texel its middle maps to. Sampling *per triangle* matters twice over: Kenney's
 * pieces have no textures at all, only flat materials, and an atlas-textured model uses a
 * corner of its image — the average of the whole image is the colour of nothing.
 *
 * The triangles are sorted into the families of `lib/design/colors`, by area. A family that
 * covers an eighth of the piece is one of its colours (three at most, the largest first), and
 * its hex is the mean of what fell into it — so "brown" comes back as *this* walnut.
 */

import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { NodeIO, type Document, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { familyOfRgb, toHex, type ColorFamily } from '../../lib/design/colors';

/** A family has to cover this much of the piece to count as one of its colours. */
const MIN_SHARE = 0.12;
const MAX_COLORS = 3;
/** Triangles looked at per primitive; a woven rattan chair has a quarter of a million. */
const MAX_SAMPLES = 20000;
const TEXTURE_PX = 128;

let io: NodeIO | null = null;
async function reader(): Promise<NodeIO> {
  if (io) return io;
  await MeshoptDecoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io;
}

/** glTF factors are linear; what a person sees, and what a hex means, is sRGB. */
function toSrgb(linear: number): number {
  const v = Math.max(0, Math.min(1, linear));
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
}

type Pixels = { data: Buffer; size: number };

async function pixelsOf(texture: Texture, cache: Map<Texture, Pixels | null>): Promise<Pixels | null> {
  if (cache.has(texture)) return cache.get(texture) ?? null;
  let out: Pixels | null = null;
  const image = texture.getImage();
  if (image) {
    try {
      // Nearest, not smooth: a leaf atlas is green on nothing, and smoothing bleeds whatever
      // lies under the cut-out (usually black) into the green along every edge.
      const data = await sharp(Buffer.from(image)).resize(TEXTURE_PX, TEXTURE_PX, { fit: 'fill', kernel: 'nearest' }).ensureAlpha().toColourspace('srgb').raw().toBuffer();
      if (data.length === TEXTURE_PX * TEXTURE_PX * 4) out = { data, size: TEXTURE_PX };
    } catch {
      out = null; // KTX2 or something sharp cannot read: the factor alone will have to do
    }
  }
  cache.set(texture, out);
  return out;
}

export async function colorsOfDocument(doc: Document): Promise<string[]> {
  const buckets = new Map<ColorFamily, { area: number; r: number; g: number; b: number }>();
  const textures = new Map<Texture, Pixels | null>();
  let total = 0;

  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position || primitive.getMode() !== 4) continue;
      const material = primitive.getMaterial();
      const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const alphaMode = material?.getAlphaMode() ?? 'OPAQUE';
      const alpha = alphaMode === 'BLEND' ? factor[3] : 1;
      if (alpha < 0.05) continue; // glass
      // A cut-out material (leaves on a card) is only there where its texture says so.
      const cutout = alphaMode === 'OPAQUE' ? 0 : alphaMode === 'MASK' ? (material?.getAlphaCutoff() ?? 0.5) * 255 : 13;
      const baseTexture = material?.getBaseColorTexture() ?? null;
      const pixels = baseTexture ? await pixelsOf(baseTexture, textures) : null;
      const uv = pixels ? primitive.getAttribute('TEXCOORD_0') : null;
      const indices = primitive.getIndices();
      const count = Math.floor((indices ? indices.getCount() : position.getCount()) / 3);
      const stride = Math.max(1, Math.ceil(count / MAX_SAMPLES));

      const p: number[] = [0, 0, 0];
      const t: number[] = [0, 0];
      const corner = (i: number): [number, number, number] => {
        position.getElement(i, p);
        return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
      };

      for (let tri = 0; tri < count; tri += stride) {
        const ia = indices ? indices.getScalar(tri * 3) : tri * 3;
        const ib = indices ? indices.getScalar(tri * 3 + 1) : tri * 3 + 1;
        const ic = indices ? indices.getScalar(tri * 3 + 2) : tri * 3 + 2;
        const a = corner(ia);
        const b = corner(ib);
        const c = corner(ic);
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * stride * alpha;
        if (!(area > 0)) continue;

        let r = toSrgb(factor[0]);
        let g = toSrgb(factor[1]);
        let bl = toSrgb(factor[2]);
        if (pixels && uv) {
          let su = 0;
          let sv = 0;
          for (const i of [ia, ib, ic]) {
            uv.getElement(i, t);
            su += t[0];
            sv += t[1];
          }
          // The middle of the triangle, wrapped the way a repeating texture wraps.
          const x = Math.min(pixels.size - 1, Math.floor((((su / 3) % 1) + 1) % 1 * pixels.size));
          const y = Math.min(pixels.size - 1, Math.floor((((sv / 3) % 1) + 1) % 1 * pixels.size));
          const at = (y * pixels.size + x) * 4;
          if (cutout > 0 && pixels.data[at + 3] < cutout) continue; // nothing is drawn here
          // A white factor leaves the texel as it is; a tinted one tints it.
          r = (pixels.data[at] * r) / 255;
          g = (pixels.data[at + 1] * g) / 255;
          bl = (pixels.data[at + 2] * bl) / 255;
        }

        const family = familyOfRgb(r, g, bl);
        const bucket = buckets.get(family) ?? { area: 0, r: 0, g: 0, b: 0 };
        bucket.area += area;
        bucket.r += r * area;
        bucket.g += g * area;
        bucket.b += bl * area;
        buckets.set(family, bucket);
        total += area;
      }
    }
  }

  if (total <= 0) return [];
  const ranked = [...buckets.values()].sort((x, y) => y.area - x.area);
  // The largest always counts — a piece in five colours still has one that is most of it.
  return ranked
    .filter((bucket, index) => index === 0 || bucket.area / total >= MIN_SHARE)
    .slice(0, MAX_COLORS)
    .map((bucket) => toHex(bucket.r / bucket.area, bucket.g / bucket.area, bucket.b / bucket.area));
}

/** The colours of a GLB on disk, the largest first; empty when it cannot be read. */
export async function colorsOfGlb(file: string): Promise<string[]> {
  const bytes = await readFile(file);
  const doc = await (await reader()).readBinary(new Uint8Array(bytes));
  return colorsOfDocument(doc);
}
