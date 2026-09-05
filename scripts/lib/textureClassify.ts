/**
 * Working out what each texture map in an archive is *for*.
 *
 * The partner archives ship their maps loose — `divan Industrial-004.jpg`, `fabric1.jpg`,
 * `2b2b71175522.jpg` — and the .mtl files that should say which is the albedo and which the
 * normal reference none of them. So each map is classified from its own pixels:
 *
 *   - a **normal map** is overwhelmingly blue (the flat normal is RGB 128,128,255)
 *   - a **roughness / gloss / mask** map is grey — near-zero saturation
 *   - anything else colourful is an **albedo**
 *
 * Filenames are used as a tie-breaker (`_n`, `_normal`, `_gloss`, `_diff`, `albedo`...), and a
 * per-model override can pin any decision the statistics get wrong. The point of doing it by
 * pixels rather than by name is the next partner drop: nobody names their maps consistently.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export type MapRole = 'albedo' | 'normal' | 'roughness' | 'gloss' | 'ignore';

export interface ClassifiedMap {
  file: string;
  role: MapRole;
  width: number;
  height: number;
  /** Why it landed where it did — printed in the conversion log so a wrong call is visible. */
  reason: string;
}

interface Stats {
  width: number;
  height: number;
  r: number;
  g: number;
  b: number;
  /** Mean of (max channel − min channel): 0 for pure grey. */
  saturation: number;
  /** Luminance statistics of the outer 8% ring and of the middle, for spotting renders. */
  borderMean: number;
  borderStd: number;
  centreMean: number;
}

export async function classifyMaps(files: string[]): Promise<ClassifiedMap[]> {
  const out: ClassifiedMap[] = [];
  for (const file of files) {
    try {
      out.push(await classifyOne(file));
    } catch (error) {
      out.push({
        file,
        role: 'ignore',
        width: 0,
        height: 0,
        reason: `unreadable: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return out;
}

async function classifyOne(file: string): Promise<ClassifiedMap> {
  const name = path.basename(file).toLowerCase();

  // Names that are unambiguous on their own.
  if (/preview|render|picture|screenshot|web1|_zoom|thumbnail/.test(name)) {
    return { file, role: 'ignore', width: 0, height: 0, reason: 'named as a preview' };
  }
  if (/mask|_id\b|_id\.|height|disp|refl|_ao\b|_ao\.|occlusion/.test(name)) {
    return { file, role: 'ignore', width: 0, height: 0, reason: 'named as a map we do not use' };
  }

  const stats = await imageStats(file);
  const byName = roleFromName(name);

  // A product render has a flat studio background around a subject that is nothing like it;
  // a texture is the same stuff edge to edge. Wrapping a render around a model is the single
  // most visible way this can go wrong, so it is checked before anything else.
  if (stats.borderStd < 7 && Math.abs(stats.centreMean - stats.borderMean) > 22) {
    return { file, role: 'ignore', width: stats.width, height: stats.height, reason: 'flat background around a subject — a product render, not a texture' };
  }

  const byPixels = roleFromPixels(stats);

  // Pixels decide, names confirm — a file called `_n.jpg` that is not blue is not a normal map.
  let role: MapRole = byPixels;
  let reason = `pixels: rgb(${stats.r.toFixed(0)},${stats.g.toFixed(0)},${stats.b.toFixed(0)}) sat=${stats.saturation.toFixed(0)}`;

  if (byName && byName === byPixels) {
    reason += `, name agrees`;
  } else if (byName === 'normal' && byPixels !== 'normal') {
    reason += `, name says normal but it is not blue — kept as ${byPixels}`;
  } else if (byName === 'albedo' && byPixels === 'roughness') {
    // Grey fabric, grey plaster: a colour map with no colour in it. The name is the only tell.
    role = 'albedo';
    reason += `, but the name says it is a colour map`;
  } else if (byName && byPixels === 'albedo' && (byName === 'roughness' || byName === 'gloss')) {
    // A grey-ish map with a little colour cast is still a roughness map if it says so.
    if (stats.saturation < 30) {
      role = byName;
      reason += `, name says ${byName} and it is nearly grey`;
    }
  }

  return { file, role, width: stats.width, height: stats.height, reason };
}

function roleFromName(name: string): MapRole | null {
  if (/normal|_nrm|_n\.|_n_|nrm\.|bump|_b\./.test(name)) return 'normal';
  if (/rough|_r\./.test(name)) return 'roughness';
  if (/gloss|_g\./.test(name)) return 'gloss';
  if (/albedo|diffuse|basecolor|base_color|_d\.|_diff|_dif\b|_dif\.|color\.|colour/.test(name))
    return 'albedo';
  // Named after a material with no map-role suffix: "Gray Fabrik.jpg", "oak_natural.jpg".
  if (/fabric|fabrik|cloth|leather|linen|velvet|plaid|wool|denim|oak|walnut|wood|veneer|rattan|bambo|marble|travertine|stone|concrete|plaster|brick/.test(name))
    return 'albedo';
  return null;
}

function roleFromPixels(s: Stats): MapRole {
  // A flat tangent-space normal averages (128,128,255), but real ones drift — the NODE sofa's
  // is (98,146,240) — so the test is "blue far above both other channels", nothing about r≈g.
  const blueDominant = s.b > 180 && s.b - Math.max(s.r, s.g) > 60;
  if (blueDominant) return 'normal';
  if (s.saturation < 14) return 'roughness';
  return 'albedo';
}

/** Decodes a JPEG or PNG and samples it coarsely — a 4K map does not need every pixel read. */
async function imageStats(file: string): Promise<Stats> {
  const buffer = await readFile(file);
  const ext = path.extname(file).toLowerCase();

  let width: number;
  let height: number;
  let data: Uint8Array;

  if (ext === '.png') {
    const png = PNG.sync.read(buffer);
    width = png.width;
    height = png.height;
    data = png.data;
  } else if (ext === '.jpg' || ext === '.jpeg') {
    const decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 1024 });
    width = decoded.width;
    height = decoded.height;
    data = decoded.data;
  } else {
    throw new Error(`unsupported image type ${ext}`);
  }

  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4096)));
  let r = 0;
  let g = 0;
  let b = 0;
  let saturation = 0;
  let count = 0;
  const border: number[] = [];
  const centre: number[] = [];
  const ring = 0.08;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      r += pr;
      g += pg;
      b += pb;
      saturation += Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
      count++;
      const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
      const fx = x / width;
      const fy = y / height;
      if (fx < ring || fx > 1 - ring || fy < ring || fy > 1 - ring) border.push(lum);
      else if (fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7) centre.push(lum);
    }
  }

  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const borderMean = mean(border);
  const borderStd = Math.sqrt(mean(border.map((v) => (v - borderMean) ** 2)));

  return {
    width,
    height,
    r: r / count,
    g: g / count,
    b: b / count,
    saturation: saturation / count,
    borderMean,
    borderStd,
    centreMean: mean(centre),
  };
}

/**
 * Picks one map per role for a model.
 *
 * Several albedos usually means colour variants of the same fabric; the largest is taken as
 * the canonical one. Gloss is inverted roughness, so it fills in when no roughness map exists.
 */
export function pickMaps(classified: ClassifiedMap[]): {
  albedo?: string;
  normal?: string;
  roughness?: string;
  /** True when the roughness slot was filled from a gloss map and needs inverting. */
  roughnessIsGloss: boolean;
} {
  const largest = (role: MapRole) =>
    classified
      .filter((m) => m.role === role)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0]?.file;

  const roughness = largest('roughness');
  const gloss = largest('gloss');

  return {
    albedo: largest('albedo'),
    normal: largest('normal'),
    roughness: roughness ?? gloss,
    roughnessIsGloss: !roughness && !!gloss,
  };
}
