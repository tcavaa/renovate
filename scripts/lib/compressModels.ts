/**
 * The last step of every model pipeline, and `pnpm models:compress` on its own: each model in
 * `public/models` written as the studio should download it —
 *
 * - **textures as WebP** at quality 80, at the size they have (colour maps capped at 2048 px,
 *   data maps at 1024, as for uploads). Textures were 75 % of the models' bytes, and the
 *   1024-pixel JPEGs come to about half as WebP;
 * - **geometry as Draco** where that pays: at least `DRACO_MIN_GEOMETRY_BYTES` of it, and at
 *   least 16 KB saved against the meshopt it had. Measured on the partner and stock models, Draco
 *   geometry is about 40 % of meshopt's as served (the production host does not compress GLBs).
 *   Small pieces — sockets, Kenney's furniture — keep meshopt, which the browser decodes
 *   without a worker round trip;
 * - **glass as plain transparency** (`plainGlassMaterials`, the upload recipe's): a material
 *   with `KHR_materials_transmission` would make three render the whole flat twice a frame.
 *
 * A file that has both already is not even decoded (its JSON says so), so running this again is
 * quick and changes nothing; a result no smaller than the file is not written. The manifests'
 * `bytes` follow the files.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compressTextures, DRACO_MIN_GEOMETRY_BYTES, modelIO, toDraco } from './gltfPipeline';
import { plainGlassMaterials } from '../../lib/uploads/glbOptimize';

const ROOT = path.join(process.cwd(), 'public', 'models');
/** The upload recipe's quality (`WEBP_QUALITY` in lib/uploads/glbOptimize.ts). */
const QUALITY = 80;
const COLOUR_PX = 2048;
const DATA_PX = 1024;
/** Draco has to save at least this much to be worth a decoder round trip in the browser. */
const DRACO_MIN_SAVING_BYTES = 16 * 1024;

export interface CompressOptions {
  /** Only these models: file names without `.glb`. */
  only?: string[] | null;
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface CompressSummary {
  files: number;
  changed: number;
  bytesBefore: number;
  bytesAfter: number;
  manifestEntries: number;
}

async function glbFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await glbFiles(full)));
    else if (entry.name.endsWith('.glb')) out.push(full);
  }
  return out.sort();
}

/** What a GLB's JSON says about it, without decoding anything. */
function describe(bytes: Uint8Array): { allWebp: boolean; draco: boolean; glass: boolean; geometryBytes: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    images?: Array<{ mimeType?: string; bufferView?: number }>;
    bufferViews?: Array<{ byteLength: number }>;
    extensionsUsed?: string[];
  };
  const images = json.images ?? [];
  const imageBytes = images.reduce((sum, image) => sum + (image.bufferView != null ? (json.bufferViews?.[image.bufferView]?.byteLength ?? 0) : 0), 0);
  return {
    allWebp: images.every((image) => image.mimeType === 'image/webp'),
    draco: (json.extensionsUsed ?? []).includes('KHR_draco_mesh_compression'),
    glass: (json.extensionsUsed ?? []).includes('KHR_materials_transmission'),
    geometryBytes: bytes.byteLength - 20 - jsonLength - imageBytes,
  };
}

/** `bytes` of every manifest entry whose `url` is one of the rewritten files. */
async function updateManifests(sizes: Map<string, number>, dryRun: boolean): Promise<number> {
  let updated = 0;
  const manifests = (await readdir(ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ROOT, entry.name, 'manifest.json'))
    .concat(path.join(ROOT, 'manifest.json'));
  for (const file of manifests) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const data = JSON.parse(text) as unknown;
    let changed = false;
    const visit = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === 'object') {
        const entry = node as Record<string, unknown>;
        if (typeof entry.url === 'string' && typeof entry.bytes === 'number' && sizes.has(entry.url) && entry.bytes !== sizes.get(entry.url)) {
          entry.bytes = sizes.get(entry.url);
          changed = true;
          updated++;
        }
        Object.values(entry).forEach(visit);
      }
    };
    visit(data);
    if (changed && !dryRun) await writeFile(file, JSON.stringify(data, null, 2) + (text.endsWith('\n') ? '\n' : ''));
  }
  return updated;
}

export async function compressModels(options: CompressOptions = {}): Promise<CompressSummary> {
  const log = options.log ?? ((line: string) => console.log(line));
  const io = await modelIO();
  const files = (await glbFiles(ROOT)).filter((file) => !options.only || options.only.includes(path.basename(file, '.glb')));
  const sizes = new Map<string, number>();
  const summary: CompressSummary = { files: files.length, changed: 0, bytesBefore: 0, bytesAfter: 0, manifestEntries: 0 };
  for (const file of files) {
    const name = path.relative(ROOT, file).split(path.sep).join('/');
    const bytes = new Uint8Array(await readFile(file));
    const facts = describe(bytes);
    const wantWebp = !facts.allWebp;
    const wantDraco = !facts.draco && facts.geometryBytes >= DRACO_MIN_GEOMETRY_BYTES;
    if (!wantWebp && !wantDraco && !facts.glass) continue;

    const doc = await io.readBinary(bytes);
    if (wantWebp) await compressTextures(doc, { colourPx: COLOUR_PX, dataPx: DATA_PX, quality: QUALITY });
    const glass = facts.glass && plainGlassMaterials(doc) > 0;
    let best = wantWebp || glass ? await io.writeBinary(doc) : bytes;
    let how = [wantWebp ? 'webp' : '', glass ? 'glass' : ''].filter(Boolean).join(' + ');
    if (wantDraco) {
      await toDraco(doc);
      const withDraco = await io.writeBinary(doc);
      if (best.byteLength - withDraco.byteLength >= DRACO_MIN_SAVING_BYTES) {
        best = withDraco;
        how = how ? `${how} + draco` : 'draco';
      }
    }
    // Plain glass is worth writing even when the file does not shrink; anything else has to.
    if (best === bytes || (!glass && best.byteLength >= bytes.byteLength)) continue;
    summary.changed++;
    summary.bytesBefore += bytes.byteLength;
    summary.bytesAfter += best.byteLength;
    sizes.set(`/models/${name}`, best.byteLength);
    log(`  ${options.dryRun ? 'would ' : ''}${how.padEnd(12)} ${name}: ${(bytes.byteLength / 1024).toFixed(0)} KB → ${(best.byteLength / 1024).toFixed(0)} KB`);
    if (!options.dryRun) await writeFile(file, best);
  }
  summary.manifestEntries = await updateManifests(sizes, !!options.dryRun);
  const mb = (n: number) => (n / 1e6).toFixed(1);
  log(`${options.dryRun ? '[dry run] ' : ''}${summary.changed} of ${summary.files} models compressed: ${mb(summary.bytesBefore)} MB → ${mb(summary.bytesAfter)} MB; ${summary.manifestEntries} manifest entries ${options.dryRun ? 'would be ' : ''}updated`);
  return summary;
}
