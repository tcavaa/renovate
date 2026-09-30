/**
 * The made-to-measure kitchen's materials as 3D models: a straight run of base units with its
 * worktop, one per material the kitchen maker sells (`kitchen-material-ldsp`, `-mdf`, `-veneer`).
 * The studio draws a made-to-measure run as its material's model (`drawnModelUrl` in
 * lib/design/kitchen.ts), stretched along each axis to the run as measured (`fitToItem`).
 *
 *   pnpm models:kitchens                  → public/models/kitchens/*.glb + manifest.json
 *   pnpm models:photos --only=run-ldsp,run-mdf,run-veneer → then the product photos
 *
 * One downloaded run — a Sketchfab upload under CC BY 4.0, fetched from its Objaverse mirror
 * (see scripts/equipment-models.ts for the licence rules and the mirror) — made three times:
 * its fronts and carcase (one material in the file) re-textured or re-coloured for the
 * material, its knobs re-coloured, the worktop, sink and hob kept. Nothing is modelled here:
 * the tap is cut away (it stood 37 cm above the worktop, and a run is stretched to its
 * worktop's height by its bounding box), and so are the parts no one sees (a bin and the
 * valves inside the sink unit). The fronts' texture is laid on by projecting each face on the
 * plane it faces, in metres, so the grain runs up the doors whatever the source's own UVs.
 *
 * The frame is the furniture's: metres, standing on y = 0, centred on x and z, the fronts
 * along +z. The script reads back what it wrote and fails a model that is off that frame, not
 * its height, over 12 000 triangles or 1.5 MB, or with a material the studio would light up; a
 * failed model keeps its previous file and manifest row.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, PropertyType, type Document, type Primitive } from '@gltf-transform/core';
import { dedup, flatten, join, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import {
  bakeNodeTransforms,
  boundsOf,
  compressTextures,
  countTriangles,
  creditOf,
  fetchSource,
  FRAME_TOLERANCE_M,
  hasLitWord,
  linearColor,
  listPrimitives,
  materialName,
  newIO,
  simplifyTowards,
  transformPositions,
  type ModelCredit,
  type ModelSource,
} from './lib/gltfPipeline';
import { compressModels } from './lib/compressModels';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'models', 'kitchens');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'renovate-kitchens');
const TARGET_TRIANGLES = 10_000;
const MAX_TRIANGLES = 12_000;
const MAX_BYTES = 1.5 * 1024 * 1024;
/** The run's height to the top of its worktop (its hob's glass is the few millimetres above). */
const HEIGHT_M = 0.9;
/** One repeat of a front texture, in metres, on every face. */
const TEXTURE_TILE_M = 0.9;

export type KitchenMaterialSlug = 'kitchen-material-ldsp' | 'kitchen-material-mdf' | 'kitchen-material-veneer';

export interface KitchenManifestModel {
  slug: string;
  /** The kitchen maker's material product this model is drawn for. */
  material: KitchenMaterialSlug;
  kind: 'kitchen_run';
  url: string;
  /** Measured from the file, to the millimetre. */
  widthCm: number;
  heightCm: number;
  depthCm: number;
  triangles: number;
  bytes: number;
  title: string;
  source: ModelSource['type'];
  sourceUrl: string;
  author: string;
  license: string;
  credit: ModelCredit;
  /** The product photo, rendered by `pnpm models:photos`. */
  imageUrl: string;
}

// ---------------------------------------------------------------------------
// The source and what each material makes of it
// ---------------------------------------------------------------------------

const SOURCE: ModelSource = {
  type: 'sketchfab',
  uid: 'ff403d410a0b4d9b97845482cbc77a17',
  path: 'glbs/000-131/ff403d410a0b4d9b97845482cbc77a17.glb',
  title: 'kitchen.ciete.warszawa',
  author: 'corbaanton',
  license: 'CC-BY 4.0',
};

/** The source's materials, by what they are. */
const PARTS = {
  /** Fronts, plinth and carcase, all one material in the file. */
  body: 'Powder_Coat_White',
  handles: 'Powder_Coat_-_Rough_Black',
  worktop: 'Iron_-_Cast',
  sink: 'Steel_-_Satin',
  hobGlass: 'Glass_-_Heavy_Color',
  hobBody: 'default',
  legs: 'Powder_Coat_-_Rough_Dark_Grey',
} as const;
/** Inside the sink unit, seen by no one: a bin (with 3.8 MB of textures) and two valves. */
const DROPPED = ['material', 'Paint_-_Enamel_Glossy_Blue', 'Paint_-_Enamel_Glossy_Red'];

interface Finish {
  color?: string;
  /** A texture under public/, laid on in metres (TEXTURE_TILE_M a repeat). */
  texture?: string;
  metallic: number;
  roughness: number;
}

/** What every variant shares: an anthracite worktop, satin steel sink, black glass hob. */
const SHARED: Partial<Record<keyof typeof PARTS, Finish>> = {
  worktop: { color: '#2e2f31', metallic: 0, roughness: 0.45 },
  sink: { color: '#c8cbcd', metallic: 0.5, roughness: 0.3 },
  hobGlass: { color: '#0b0b0c', metallic: 0, roughness: 0.12 },
  hobBody: { color: '#1d1d1f', metallic: 0, roughness: 0.6 },
  legs: { color: '#3a3b3d', metallic: 0.3, roughness: 0.6 },
};

interface KitchenVariant {
  slug: string;
  material: KitchenMaterialSlug;
  title: string;
  body: Finish;
  handles: Finish;
}

const VARIANTS: KitchenVariant[] = [
  {
    slug: 'run-ldsp',
    material: 'kitchen-material-ldsp',
    title: 'Kitchen run, laminated chipboard (LDSP), grey oak, silver handles',
    // A light, cool grey oak — the stock grey floor texture desaturated and lightened
    // (public/textures/kitchen-oak-grey-diffuse.webp): as it was, it read as the veneer's brown.
    body: { texture: 'textures/kitchen-oak-grey-diffuse.webp', metallic: 0, roughness: 0.62 },
    handles: { color: '#c9ccd0', metallic: 0.5, roughness: 0.3 },
  },
  {
    slug: 'run-mdf',
    material: 'kitchen-material-mdf',
    title: 'Kitchen run, painted MDF, matt cashmere, black handles',
    body: { color: '#dcd5c8', metallic: 0, roughness: 0.85 },
    handles: { color: '#1c1c1e', metallic: 0.2, roughness: 0.45 },
  },
  {
    slug: 'run-veneer',
    material: 'kitchen-material-veneer',
    title: 'Kitchen run, natural oak veneer, brass handles',
    body: { texture: 'textures/wood-floor-light-diffuse.webp', metallic: 0, roughness: 0.55 },
    handles: { color: '#b08d57', metallic: 0.5, roughness: 0.3 },
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const variants = only ? VARIANTS.filter((v) => only.includes(v.slug)) : VARIANTS;
  if (variants.length === 0) throw new Error(`nothing matches --only=${only?.join(',')}`);
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const previous = existsSync(manifestPath) ? (JSON.parse(await readFile(manifestPath, 'utf8')) as { models: KitchenManifestModel[] }).models : [];
  const models: KitchenManifestModel[] = [];
  const failed: string[] = [];
  for (const variant of variants) {
    process.stdout.write(`• ${variant.slug} `);
    try {
      const model = await makeVariant(variant);
      models.push(model);
      console.log(`✓ ${model.widthCm}×${model.heightCm}×${model.depthCm} cm · ${model.triangles} tris · ${(model.bytes / 1024).toFixed(0)} KB · ${model.license}`);
    } catch (error) {
      failed.push(`${variant.slug} — ${(error as Error).message}`);
      console.log(`✗ ${(error as Error).message}`);
    }
  }

  const all = VARIANTS.map((v) => models.find((m) => m.slug === v.slug) ?? previous.find((m) => m.slug === v.slug)).filter((m): m is KitchenManifestModel => !!m);
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        note: 'Written by scripts/kitchen-models.ts: one straight run of base units with its worktop per kitchen-maker material (`material` is the product slug), from one CC BY 4.0 source re-textured per material (see credit). Metres, standing on y = 0, centred on x and z, fronts along +z; the studio stretches a run to its measured size per axis.',
        models: all,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`\n${all.length} kitchen runs in manifest · ${path.relative(ROOT, OUT_DIR)}`);
  // The library as the studio downloads it: WebP maps, Draco geometry where that pays.
  await compressModels();
  if (failed.length) {
    console.log(`\n${failed.length} failed:\n${failed.map((f) => `  · ${f}`).join('\n')}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// One variant
// ---------------------------------------------------------------------------

async function makeVariant(variant: KitchenVariant): Promise<KitchenManifestModel> {
  const sourceFile = await fetchSource(CACHE_DIR, SOURCE);
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = newIO();
  const doc = await io.read(sourceFile);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));

  // --- one primitive per material, in world space ------------------------------------------
  for (const prim of listPrimitives(doc)) if (prim.getAttribute('TANGENT')) prim.setAttribute('TANGENT', null);
  // Materials are told apart by name below, so identical ones are not merged (the hob's body, the legs and a valve share one grey).
  await doc.transform(prune(), dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), flatten(), join({ keepNamed: false, keepMeshes: false }), weld(), prune());
  bakeNodeTransforms(doc);
  const byMaterial = (name: string) => listPrimitives(doc).filter((p) => p.getMaterial()?.getName() === name);
  for (const name of Object.values(PARTS)) if (byMaterial(name).length === 0) throw new Error(`the source has no material ${name}`);

  // --- what goes: the unseen parts, and the tap above the worktop ---------------------------
  dropMaterials(doc, DROPPED);
  const worktopTop = Math.max(...byMaterial(PARTS.worktop).map((p) => p.getAttribute('POSITION')!.getMax([])[1]));
  for (const prim of byMaterial(PARTS.sink)) keepTriangles(prim, (centroid) => centroid[1] <= worktopTop + 0.02);
  await doc.transform(prune());
  let b = boundsOf(doc);
  if (b.max[1] > worktopTop + 0.06) throw new Error(`something still stands ${((b.max[1] - worktopTop) * 10).toFixed(1)} cm above the worktop`);

  await simplifyTowards(doc, TARGET_TRIANGLES);

  // --- size and frame (the source is in decimetres; scaled to the run's height) --------------
  b = boundsOf(doc);
  const scale = HEIGHT_M / (b.max[1] - b.min[1]);
  transformPositions(doc, (p) => [p[0] * scale, p[1] * scale, p[2] * scale]);
  b = boundsOf(doc);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  transformPositions(doc, (p) => [p[0] - cx, p[1] - b.min[1], p[2] - cz]);

  // --- the material's finish -----------------------------------------------------------------
  const finishes: Array<[string, Finish]> = [
    [PARTS.body, variant.body],
    [PARTS.handles, variant.handles],
    ...Object.entries(SHARED).map(([part, finish]) => [PARTS[part as keyof typeof PARTS], finish] as [string, Finish]),
  ];
  for (const [name, finish] of finishes) {
    for (const prim of byMaterial(name)) {
      const material = prim.getMaterial()!;
      material.setBaseColorFactor([...(finish.color ? linearColor(finish.color) : [1, 1, 1]), 1] as [number, number, number, number]).setMetallicFactor(finish.metallic).setRoughnessFactor(finish.roughness).setBaseColorTexture(null).setMetallicRoughnessTexture(null).setNormalTexture(null);
      if (finish.texture) {
        const texture = doc.createTexture(path.basename(finish.texture)).setImage(new Uint8Array(await readFile(path.join(ROOT, 'public', finish.texture)))).setMimeType(finish.texture.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
        material.setBaseColorTexture(texture);
        projectUVs(doc, prim, TEXTURE_TILE_M);
      }
    }
  }
  for (const material of doc.getRoot().listMaterials()) material.setName(materialName(variant.slug, material.getName()));
  await doc.transform(prune());
  await compressTextures(doc, { colourPx: 1024, dataPx: 512, quality: 80 });

  const triangles = countTriangles(doc);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const draft = path.join(CACHE_DIR, 'out', `${variant.slug}.glb`);
  await mkdir(path.dirname(draft), { recursive: true });
  await io.write(draft, doc);
  const { size: bytes } = await stat(draft);

  // --- what was written, measured -------------------------------------------------------------
  const written = await newIO().read(draft);
  const wb = boundsOf(written);
  const size = [0, 1, 2].map((k) => wb.max[k] - wb.min[k]);
  const off = (value: number) => Math.abs(value) > FRAME_TOLERANCE_M;
  const mm = (value: number) => `${(value * 1000).toFixed(2)} mm`;
  if (off(wb.min[0] + wb.max[0])) throw new Error(`not centred on x (${mm(wb.min[0])} … ${mm(wb.max[0])})`);
  if (off(wb.min[2] + wb.max[2])) throw new Error(`not centred on z (${mm(wb.min[2])} … ${mm(wb.max[2])})`);
  if (off(wb.min[1])) throw new Error(`does not stand on y = 0 (its foot is at ${mm(wb.min[1])})`);
  if (Math.abs(size[1] - HEIGHT_M) > 0.001) throw new Error(`it is ${mm(size[1])} tall, not ${HEIGHT_M * 1000} mm`);
  if (size[0] < 2 || size[0] > 4 || size[2] < 0.5 || size[2] > 0.75) throw new Error(`${mm(size[0])} long and ${mm(size[2])} deep is not a run of base units`);
  if (triangles > MAX_TRIANGLES) throw new Error(`${triangles} triangles (the cap is ${MAX_TRIANGLES})`);
  if (bytes > MAX_BYTES) throw new Error(`${(bytes / 1024 / 1024).toFixed(2)} MB (the cap is ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB)`);
  for (const material of written.getRoot().listMaterials()) {
    if (hasLitWord(material.getName())) throw new Error(`the studio would light up a material called ${material.getName()}`);
  }
  await copyFile(draft, path.join(OUT_DIR, `${variant.slug}.glb`));
  await rm(draft, { force: true });

  const credit = creditOf(SOURCE, 'the tap and the parts inside the sink unit removed, re-coloured and re-textured, resized and simplified for RenovateGE');
  const cm = (metres: number) => Math.round(metres * 1000) / 10;
  return {
    slug: variant.slug,
    material: variant.material,
    kind: 'kitchen_run',
    url: `/models/kitchens/${variant.slug}.glb`,
    widthCm: cm(size[0]),
    heightCm: cm(size[1]),
    depthCm: cm(size[2]),
    triangles,
    bytes,
    title: variant.title,
    source: SOURCE.type,
    sourceUrl: credit.url,
    author: credit.author,
    license: credit.license,
    credit,
    imageUrl: `/uploads/furniture/kitchen-${variant.slug}.webp`,
  };
}

/** Every primitive in one of these materials gone from its mesh. */
function dropMaterials(doc: Document, names: string[]): void {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (!names.includes(prim.getMaterial()?.getName() ?? '')) continue;
      mesh.removePrimitive(prim);
      prim.dispose();
    }
  }
}

/** Only the triangles whose centre passes `keep`. */
function keepTriangles(prim: Primitive, keep: (centroid: [number, number, number]) => boolean): void {
  const position = prim.getAttribute('POSITION')!.getArray()!;
  const indices = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: position.length / 3 }, (_, i) => i);
  const out: number[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const centroid: [number, number, number] = [0, 1, 2].map((k) => (position[a * 3 + k] + position[b * 3 + k] + position[c * 3 + k]) / 3) as [number, number, number];
    if (keep(centroid)) out.push(a, b, c);
  }
  const accessor = prim.getIndices();
  if (accessor) accessor.setArray(position.length / 3 > 65535 ? Uint32Array.from(out) : Uint16Array.from(out));
}

/**
 * UVs by projecting every vertex on the plane its face looks along (a front on x/y, a side on
 * z/y, a top on x/z), in `tileM` metres a repeat: the grain of a wood texture runs up every door
 * and side, whatever the source's own UVs were, and no texture is stretched on a face.
 */
function projectUVs(doc: Document, prim: Primitive, tileM: number): void {
  const position = prim.getAttribute('POSITION')!.getArray()!;
  const normal = prim.getAttribute('NORMAL')?.getArray();
  const uv = new Float32Array((position.length / 3) * 2);
  for (let v = 0; v < position.length / 3; v++) {
    const [x, y, z] = [position[v * 3], position[v * 3 + 1], position[v * 3 + 2]];
    const [nx, ny, nz] = normal ? [Math.abs(normal[v * 3]), Math.abs(normal[v * 3 + 1]), Math.abs(normal[v * 3 + 2])] : [0, 0, 1];
    const [u, w] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
    uv[v * 2] = u / tileM;
    uv[v * 2 + 1] = 1 - w / tileM;
  }
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer));
}

// Only when run, not when the photo script reads this file's types.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
