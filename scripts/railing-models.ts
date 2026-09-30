/**
 * The balcony railing (მოაჯირი), written in code: one MODULE a metre wide. The studio stands
 * as many modules in a railing's gap as fit its length, each stretched a little so they fill
 * it exactly (the way a radiator repeats its section), and to the railing's height.
 *
 *   pnpm models:railings   → public/models/railings/railing.glb + manifest.json
 *                            + lib/design3d/railingManifest.ts (the same data, typed)
 *
 * A railing is not sold — it comes with the balcony — so there is no product, no photo and no
 * seed. No download and no Blender: a handrail, a bottom rail, a half post at each end and
 * the balusters between them, from the radiators' mesh kit (`scripts/radiator-models.ts`).
 *
 * The file stands in the frame an opening's model does, which is what the placing code
 * relies on:
 *
 *   - centred on x, with an x-extent of EXACTLY the pitch (`pitchCm`), so modules placed at
 *     that pitch touch — their half posts join into one post, their rails into one rail;
 *   - standing on y = 0, in metres, Y up;
 *   - centred on z: the studio stands it in the middle of the wall's thickness.
 *
 * The script measures what it wrote and fails when the file is out of that frame. The
 * material's name stays clear of the words the studio lights up (`LIT_MATERIAL`).
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import { box, linearColor, mergeBySurface, type Part, type Surface } from './radiator-models';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'railings');
const TS_OUT = path.join(ROOT, 'lib', 'design3d', 'railingManifest.ts');
const LIT_WORDS = /light|lamp|glow|bulb|emiss|led|tube|shade/i;
const FRAME_TOLERANCE_M = 0.0005;

const SLUG = 'railing';
/** The module's width: the pitch the studio repeats it at. */
const PITCH_CM = 100;
const HEIGHT_CM = 100;

const STEEL: Surface = { name: 'railing-steel', color: '#34373c', metallic: 0.6, roughness: 0.42 };

/**
 * One metre of a painted steel balcony railing, in centimetres: a flat handrail on top, a
 * bottom rail a hand off the floor, eight square balusters between them — gaps under ten
 * centimetres, as a balcony's must be — and half a post at each end, so two modules side by
 * side share one post.
 */
function buildRailing(): Part[] {
  const half = PITCH_CM / 2;
  const railTop = HEIGHT_CM;
  const railBottom = HEIGHT_CM - 4.5;
  const post = 2;
  const parts: Part[] = [
    // The handrail and the bottom rail run the module's whole width; their ends are hidden
    // inside the next module's, or show at the railing's ends as the rail's end.
    { surface: STEEL, shape: box([-half, railBottom, -2.5], [half, railTop, 2.5]) },
    { surface: STEEL, shape: box([-half, 7, -1.5], [half, 10, 1.5]) },
    // Half a post at each end, standing on the slab.
    { surface: STEEL, shape: box([-half, 0, -2], [-half + post, railBottom, 2], ['-y', '+y']) },
    { surface: STEEL, shape: box([half - post, 0, -2], [half, railBottom, 2], ['-y', '+y']) },
  ];
  const inner = PITCH_CM - post * 2;
  const count = 8;
  const bar = 1.4;
  for (let k = 1; k <= count; k++) {
    const x = -half + post + (inner * k) / (count + 1);
    parts.push({ surface: STEEL, shape: box([x - bar / 2, 10, -bar / 2], [x + bar / 2, railBottom, bar / 2], ['-y', '+y']) });
  }
  return parts;
}

export interface RailingManifestModel {
  slug: string;
  url: string;
  /** The module's exact x-extent: modules placed at this pitch touch. */
  pitchCm: number;
  heightCm: number;
  depthCm: number;
  triangles: number;
  bytes: number;
  author: string;
  license: string;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const meshes = mergeBySurface(SLUG, buildRailing());
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'RenovationRoom scripts/railing-models.ts';
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(SLUG);
  for (const part of meshes) {
    if (LIT_WORDS.test(part.surface.name)) throw new Error(`the studio would light up a material called ${part.surface.name}`);
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
  const scene = doc.createScene(SLUG).addChild(doc.createNode(SLUG).setMesh(mesh));
  doc.getRoot().setDefaultScene(scene);

  // --- the frame, measured ----------------------------------------------------
  const { min, max } = getBounds(scene);
  const size = [0, 1, 2].map((k) => max[k] - min[k]);
  const off = (value: number) => Math.abs(value) > FRAME_TOLERANCE_M;
  const mm = (value: number) => `${(value * 1000).toFixed(2)} mm`;
  if (off(size[0] - PITCH_CM / 100)) throw new Error(`the module is ${mm(size[0])} wide, the pitch is ${PITCH_CM * 10} mm`);
  if (off(min[0] + max[0])) throw new Error(`the module is not centred on x (${mm(min[0])} … ${mm(max[0])})`);
  if (off(min[1])) throw new Error(`the module does not stand on y = 0 (its foot is at ${mm(min[1])})`);
  if (off(min[2] + max[2])) throw new Error(`the module is not centred on z (${mm(min[2])} … ${mm(max[2])})`);
  if (off(size[1] - HEIGHT_CM / 100)) throw new Error(`the module is ${mm(size[1])} tall, not ${HEIGHT_CM * 10} mm`);

  const out = path.join(OUT_DIR, `${SLUG}.glb`);
  await new NodeIO().write(out, doc);
  const { size: bytes } = await stat(out);
  const round = (metres: number) => Math.round(metres * 1000) / 10; // cm, to the millimetre
  const model: RailingManifestModel = {
    slug: SLUG,
    url: `/models/railings/${SLUG}.glb`,
    pitchCm: round(size[0]),
    heightCm: round(size[1]),
    depthCm: round(size[2]),
    triangles: meshes.reduce((sum, part) => sum + part.triangles, 0),
    bytes,
    author: 'RenovationRoom',
    license: 'CC0',
  };

  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        note: 'Written by scripts/railing-models.ts. One MODULE of a balcony railing: centred on x with an x-extent of exactly pitchCm (modules at that pitch touch and share their posts), standing on y = 0, centred on z, in metres. Not a product: a railing comes with the balcony.',
        models: [model],
      },
      null,
      2
    ) + '\n'
  );
  await writeFile(
    TS_OUT,
    `/**\n * Generated by scripts/railing-models.ts — do not edit. The balcony railing in\n * public/models/railings: one MODULE, centred on x with an x-extent of exactly \`pitchCm\`\n * (modules placed at that pitch touch and share their posts), standing on y = 0, centred on z.\n * A railing is as many modules as fit its length, stretched to fill it, and to its height.\n */\n\nexport interface RailingModel {\n  slug: string;\n  url: string;\n  pitchCm: number;\n  heightCm: number;\n  depthCm: number;\n}\n\nexport const RAILING_MODEL: RailingModel = ${JSON.stringify({ slug: model.slug, url: model.url, pitchCm: model.pitchCm, heightCm: model.heightCm, depthCm: model.depthCm }, null, 2)};\n`
  );
  console.log(`✓ ${model.slug} ${model.pitchCm}×${model.heightCm}×${model.depthCm} cm · ${model.triangles} tris · ${(model.bytes / 1024).toFixed(1)} KB · ${path.relative(ROOT, out)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
