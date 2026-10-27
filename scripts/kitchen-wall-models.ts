/* eslint-disable no-console */
/**
 * The made-to-measure kitchen's hanging (wall) cabinets as 3D models, one per material the
 * kitchen maker sells (`kitchen-wall-material-ldsp`, `-mdf`, `-veneer`): a row of four doors
 * under a carcase, handles along the doors' lower edge, in the same fronts and handle colours as
 * the runs of `pnpm models:kitchens`. The studio draws a made-to-measure wall run as its
 * material's model, stretched along each axis to the run as measured (`fitToItem`).
 *
 *   pnpm models:kitchen-walls            → public/models/kitchens/wall-*.glb + their rows in manifest.json
 *   pnpm models:photos --only=wall-ldsp,wall-mdf,wall-veneer → then the product photos
 *
 * The run's source (a CC BY kitchen) has no wall units, so these are made here from boxes — a
 * carcase a shade darker than the fronts so the gaps between the doors read, the doors, the
 * handles — with the fronts' texture laid on in metres (0.9 m a repeat) on every face, as the
 * runs have it. The frame is the furniture's: metres, standing on y = 0, centred on x and z, the
 * fronts along +z; the studio hangs it on its wall at its height.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, type Material } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { linearColor, newIO } from './lib/gltfPipeline';
import { compressModels } from './lib/compressModels';
import type { KitchenManifestModel } from './kitchen-models';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'kitchens');
/** A wall run as a joiner makes one: four 60 cm doors, 72 cm high, 35 cm deep. */
const WIDTH_M = 2.4;
const HEIGHT_M = 0.72;
const DEPTH_M = 0.35;
const DOORS = 4;
const DOOR_THICKNESS_M = 0.018;
const GAP_M = 0.004;
/** One repeat of a front texture, in metres, on every face — the runs' own. */
const REPEAT_M = 0.9;

interface Finish {
  texture?: string;
  color?: string;
  metallic: number;
  roughness: number;
}

interface WallVariant {
  slug: string;
  material: string;
  title: string;
  body: Finish;
  handles: Finish;
}

/** The runs' finishes (scripts/kitchen-models.ts), so a wall run matches the run under it. */
const VARIANTS: WallVariant[] = [
  {
    slug: 'wall-ldsp',
    material: 'kitchen-wall-material-ldsp',
    title: 'Wall cabinets, laminated chipboard (LDSP), grey oak, silver handles',
    body: { texture: 'textures/kitchen-oak-grey-diffuse.webp', metallic: 0, roughness: 0.62 },
    handles: { color: '#c9ccd0', metallic: 0.5, roughness: 0.3 },
  },
  {
    slug: 'wall-mdf',
    material: 'kitchen-wall-material-mdf',
    title: 'Wall cabinets, painted MDF, matt cashmere, black handles',
    body: { color: '#dcd5c8', metallic: 0, roughness: 0.85 },
    handles: { color: '#1c1c1e', metallic: 0.2, roughness: 0.45 },
  },
  {
    slug: 'wall-veneer',
    material: 'kitchen-wall-material-veneer',
    title: 'Wall cabinets, natural oak veneer, brass handles',
    body: { texture: 'textures/wood-floor-light-diffuse.webp', metallic: 0, roughness: 0.55 },
    handles: { color: '#b08d57', metallic: 0.5, roughness: 0.3 },
  },
];

/** A box's 24 vertices (4 a face, so each face has its own normal) with texture coordinates in metres over `REPEAT_M`. */
function box(min: [number, number, number], max: [number, number, number]) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces: Array<{ n: [number, number, number]; c: Array<[number, number, number]> }> = [
    { n: [0, 0, 1], c: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], c: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { n: [1, 0, 0], c: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { n: [-1, 0, 0], c: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { n: [0, 1, 0], c: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { n: [0, -1, 0], c: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  faces.forEach((face, f) => {
    for (const [x, y, z] of face.c) {
      positions.push(x, y, z);
      normals.push(...face.n);
      // Projected on the plane the face faces, so the grain runs up the doors.
      const [u, v] = face.n[2] !== 0 ? [x, y] : face.n[0] !== 0 ? [z, y] : [x, z];
      uvs.push(u / REPEAT_M, 1 - v / REPEAT_M);
    }
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { positions, normals, uvs, indices };
}

async function makeVariant(variant: WallVariant): Promise<KitchenManifestModel> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const finish = (name: string, f: Finish, shade = 1): Promise<Material> => (async () => {
    const material = doc.createMaterial(name).setMetallicFactor(f.metallic).setRoughnessFactor(f.roughness);
    if (f.texture) {
      const image = new Uint8Array(await readFile(path.join(ROOT, 'public', f.texture)));
      material.setBaseColorTexture(doc.createTexture(`${name}-front`).setImage(image).setMimeType('image/webp')).setBaseColorFactor([shade, shade, shade, 1]);
    } else {
      const [r, g, b] = linearColor(f.color!);
      material.setBaseColorFactor([r * shade, g * shade, b * shade, 1]);
    }
    return material;
  })();
  const fronts = await finish('fronts', variant.body);
  const carcase = await finish('carcase', variant.body, 0.72);
  const handles = await finish('handles', variant.handles);

  const parts: Array<{ material: Material; boxes: Array<ReturnType<typeof box>> }> = [
    { material: carcase, boxes: [] },
    { material: fronts, boxes: [] },
    { material: handles, boxes: [] },
  ];
  const back = -DEPTH_M / 2;
  const front = DEPTH_M / 2;
  parts[0].boxes.push(box([-WIDTH_M / 2, 0, back], [WIDTH_M / 2, HEIGHT_M, front - DOOR_THICKNESS_M]));
  const doorWidth = WIDTH_M / DOORS;
  for (let i = 0; i < DOORS; i++) {
    const x0 = -WIDTH_M / 2 + i * doorWidth + GAP_M / 2;
    const x1 = x0 + doorWidth - GAP_M;
    parts[1].boxes.push(box([x0, GAP_M / 2, front - DOOR_THICKNESS_M], [x1, HEIGHT_M - GAP_M / 2, front]));
    // A bar handle along the door's lower edge, on the side it opens: wall units are reached from below.
    const hx = i % 2 === 0 ? x1 - 0.2 : x0 + 0.04;
    parts[2].boxes.push(box([hx, 0.035, front], [hx + 0.16, 0.047, front + 0.022]));
  }

  const mesh = doc.createMesh('wall-cabinets');
  let triangles = 0;
  for (const part of parts) {
    const merged = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] };
    for (const b of part.boxes) {
      const offset = merged.positions.length / 3;
      merged.positions.push(...b.positions);
      merged.normals.push(...b.normals);
      merged.uvs.push(...b.uvs);
      merged.indices.push(...b.indices.map((i) => i + offset));
    }
    triangles += merged.indices.length / 3;
    mesh.addPrimitive(
      doc
        .createPrimitive()
        .setMaterial(part.material)
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.positions)).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.normals)).setBuffer(buffer))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(merged.uvs)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(merged.indices)).setBuffer(buffer))
    );
  }
  doc.createScene('wall-cabinets').addChild(doc.createNode('wall-cabinets').setMesh(mesh));

  const file = path.join(OUT_DIR, `${variant.slug}.glb`);
  await newIO().write(file, doc);
  return {
    slug: variant.slug,
    material: variant.material as KitchenManifestModel['material'],
    kind: 'kitchen_wall',
    url: `/models/kitchens/${variant.slug}.glb`,
    widthCm: Math.round(WIDTH_M * 1000) / 10,
    heightCm: Math.round(HEIGHT_M * 1000) / 10,
    depthCm: Math.round(DEPTH_M * 1000) / 10,
    triangles,
    bytes: (await stat(file)).size,
    title: variant.title,
    source: 'procedural' as KitchenManifestModel['source'],
    sourceUrl: '',
    author: 'PLAYCE',
    license: 'own',
    credit: { title: variant.title, author: 'PLAYCE', license: 'own', url: '', text: `${variant.title} — made from boxes by scripts/kitchen-wall-models.ts` } as KitchenManifestModel['credit'],
    imageUrl: `/uploads/furniture/kitchen-${variant.slug}.webp`,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const manifest = existsSync(manifestPath) ? (JSON.parse(await readFile(manifestPath, 'utf8')) as { models: KitchenManifestModel[]; [k: string]: unknown }) : { models: [] as KitchenManifestModel[] };
  const made: KitchenManifestModel[] = [];
  for (const variant of VARIANTS) {
    const model = await makeVariant(variant);
    made.push(model);
    console.log(`• ${model.slug} ✓ ${model.widthCm}×${model.heightCm}×${model.depthCm} cm · ${model.triangles} tris · ${(model.bytes / 1024).toFixed(0)} KB`);
  }
  // The runs' rows stay as `pnpm models:kitchens` wrote them; these replace their own.
  manifest.models = [...manifest.models.filter((m) => !made.some((w) => w.slug === m.slug)), ...made];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await compressModels();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
