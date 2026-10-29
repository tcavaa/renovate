/**
 * The roller blinds (რულონური ფარდა), written in code: one model per blind in
 * `scripts/lib/blindProducts.ts`, the same shape in each one's colours.
 *
 *   pnpm models:blinds   → public/models/blinds/*.glb + manifest.json
 *   pnpm models:photos --only=roller-blind-white,…   → their product photos
 *   pnpm models:seed     → one product per blind (a deploy has them from migration 0013)
 *
 * No download and no Blender: a cassette with its end caps, the cloth let down from it and the
 * weighted bar at its foot, from the radiators' mesh kit (`scripts/radiator-models.ts`). The
 * studio stretches the model to its window — the curtain's slot, sized by the layout engine
 * (`placeAtWindow`) — so its proportions are a typical blind's, let down a third of the way.
 *
 * Every file stands in the frame a placed piece is drawn in: centred on x, standing on y = 0,
 * centred on z, its front along +z, in metres. The script measures what it wrote and fails when
 * a file is out of that frame. Material names stay clear of the words the studio lights up
 * (`LIT_MATERIAL` in lib/design3d/buildStructure.ts).
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { box, linearColor, mergeBySurface, type Part, type Surface } from './radiator-models';
import { BLIND_MODEL_CM, BLIND_PRODUCTS, blindModelUrl, blindPhotoUrl, type BlindProduct } from './lib/blindProducts';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'blinds');
const LIT_WORDS = /light|lamp|glow|bulb|emiss|led|tube|shade/i;
const FRAME_TOLERANCE_M = 0.0005;

export interface BlindManifestModel {
  slug: string;
  url: string;
  imageUrl: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  triangles: number;
  bytes: number;
}

/** One blind, in centimetres: the cassette on top, the cloth from it, the bar at its foot. */
function buildBlind(blind: BlindProduct): Part[] {
  const { width, height, depth } = BLIND_MODEL_CM;
  const half = width / 2;
  const back = -depth / 2;
  const front = depth / 2;
  const cloth: Surface = { name: 'blind-cloth', color: blind.fabric, metallic: 0, roughness: 0.95 };
  const frame: Surface = { name: 'blind-cassette', color: blind.frame, metallic: blind.frameMetallic, roughness: 0.42 };
  const cap = 1.2;
  const cassette = 8;
  return [
    // The cassette, between its two end caps.
    { surface: frame, shape: box([-half + cap, height - cassette + 0.4, back + 0.2], [half - cap, height - 0.4, front - 0.2]) },
    { surface: frame, shape: box([-half, height - cassette, back], [-half + cap, height, front]) },
    { surface: frame, shape: box([half - cap, height - cassette, back], [half, height, front]) },
    // The cloth, off the front of the roll, down to the bar.
    { surface: cloth, shape: box([-half + 2, 3, 1.1], [half - 2, height - cassette + 0.4, 1.5], ['+y']) },
    // The weighted bar along its foot.
    { surface: frame, shape: box([-half + 1.5, 0, 0.3], [half - 1.5, 3, 2.3]) },
  ];
}

async function writeOne(blind: BlindProduct): Promise<BlindManifestModel> {
  const meshes = mergeBySurface(blind.slug, buildBlind(blind));
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'RenovationRoom scripts/blind-models.ts';
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(blind.slug);
  for (const part of meshes) {
    if (LIT_WORDS.test(part.surface.name)) throw new Error(`${blind.slug}: the studio would light up a material called ${part.surface.name}`);
    const material = doc.createMaterial(part.surface.name).setBaseColorFactor(linearColor(part.surface.color)).setMetallicFactor(part.surface.metallic).setRoughnessFactor(part.surface.roughness);
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(part.positions).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(part.normals).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(part.indices).setBuffer(buffer))
        .setMaterial(material)
    );
  }
  const scene = doc.createScene(blind.slug).addChild(doc.createNode(blind.slug).setMesh(mesh));
  doc.getRoot().setDefaultScene(scene);

  // --- the frame, measured ----------------------------------------------------
  const { min, max } = getBounds(scene);
  const size = [0, 1, 2].map((k) => max[k] - min[k]);
  const off = (value: number) => Math.abs(value) > FRAME_TOLERANCE_M;
  const mm = (value: number) => `${(value * 1000).toFixed(2)} mm`;
  if (off(min[0] + max[0])) throw new Error(`${blind.slug} is not centred on x (${mm(min[0])} … ${mm(max[0])})`);
  if (off(min[1])) throw new Error(`${blind.slug} does not stand on y = 0 (${mm(min[1])})`);
  if (off(min[2] + max[2])) throw new Error(`${blind.slug} is not centred on z (${mm(min[2])} … ${mm(max[2])})`);
  for (const [k, cm] of [[0, BLIND_MODEL_CM.width], [1, BLIND_MODEL_CM.height], [2, BLIND_MODEL_CM.depth]] as const) {
    if (off(size[k] - cm / 100)) throw new Error(`${blind.slug} is ${mm(size[k])} on axis ${k}, not ${cm * 10} mm`);
  }

  const out = path.join(OUT_DIR, `${blind.slug}.glb`);
  await new NodeIO().write(out, doc);
  const { size: bytes } = await stat(out);
  return {
    slug: blind.slug,
    url: blindModelUrl(blind.slug),
    imageUrl: blindPhotoUrl(blind.slug),
    widthCm: BLIND_MODEL_CM.width,
    heightCm: BLIND_MODEL_CM.height,
    depthCm: BLIND_MODEL_CM.depth,
    triangles: meshes.reduce((sum, part) => sum + part.triangles, 0),
    bytes,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const models: BlindManifestModel[] = [];
  for (const blind of BLIND_PRODUCTS) {
    const model = await writeOne(blind);
    models.push(model);
    console.log(`  ✓ ${model.slug.padEnd(24)} ${model.triangles} triangles · ${(model.bytes / 1024).toFixed(1)} KB`);
  }
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        note: 'Written by scripts/blind-models.ts. One roller blind per product in scripts/lib/blindProducts.ts: centred on x, standing on y = 0, centred on z, its front along +z, in metres. The studio stretches it to its window (the curtain slot).',
        models,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`\n${models.length} blinds · ${path.relative(ROOT, OUT_DIR)}`);
}

// Only when run, not when the photo script or the seed reads this file's types.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
