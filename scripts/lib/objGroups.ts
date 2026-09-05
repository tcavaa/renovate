/**
 * Splitting a Wavefront OBJ by its `g`/`o` groups.
 *
 * The partner archives are 3ds Max *scenes*, not products: an OBJ routinely holds the whole
 * range — two MECCANICA chairs side by side, four CAYDEN tables at different extensions, nine
 * Ferm Living pendants in a row — plus colour-swatch cubes, shadow-catcher planes and the odd
 * vase left on a table. Converting the file as-is gives geometry 3 m wide and 13 cm tall.
 *
 * This measures every group and rewrites the OBJ with only the chosen ones, renumbering the
 * vertices so the output is self-contained. Pure string processing — no geometry library.
 */

import { readFile, writeFile } from 'node:fs/promises';

export interface ObjGroup {
  name: string;
  faces: number;
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

export interface GroupSelection {
  /** Keep only groups whose name matches. Applied before `exclude`. */
  include?: RegExp;
  /** Drop groups whose name matches. */
  exclude?: RegExp;
}

/** Measures each group's face count and bounding box. */
export async function readGroups(objPath: string): Promise<ObjGroup[]> {
  const text = await readFile(objPath, 'utf8');
  const vertices: number[][] = [];
  const groups = new Map<string, ObjGroup>();
  let current = 'default';

  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      vertices.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    } else if (line.startsWith('g ') || line.startsWith('o ')) {
      current = line.slice(2).trim() || 'default';
    } else if (line.startsWith('f ')) {
      let group = groups.get(current);
      if (!group) {
        group = {
          name: current,
          faces: 0,
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
          size: [0, 0, 0],
        };
        groups.set(current, group);
      }
      group.faces++;
      for (const token of line.split(/\s+/).slice(1)) {
        const index = Number(token.split('/')[0]);
        const v = index > 0 ? vertices[index - 1] : vertices[vertices.length + index];
        if (!v) continue;
        for (let k = 0; k < 3; k++) {
          if (v[k] < group.min[k]) group.min[k] = v[k];
          if (v[k] > group.max[k]) group.max[k] = v[k];
        }
      }
    }
  }

  for (const group of groups.values()) {
    group.size = [
      group.max[0] - group.min[0],
      group.max[1] - group.min[1],
      group.max[2] - group.min[2],
    ];
  }
  return [...groups.values()];
}

/**
 * Decides which groups make up *one* product.
 *
 * With an explicit selection, that wins. Otherwise the rule is: keep the largest group and
 * everything that touches it, drop everything else. That alone separates a chair from the
 * swatch cubes floating beside it and from the shadow plane under it, and it keeps a bed's
 * pillows and duvet because they sit on the bed.
 *
 *   - A group flatter than 1.5% of the product in one axis is a shadow-catcher plane.
 *   - A group not touching the main body (allowing a 6% margin) is a separate object —
 *     a swatch, a second chair, a vase.
 */
export function chooseGroups(groups: ObjGroup[], selection: GroupSelection = {}): ObjGroup[] {
  let pool = groups;
  if (selection.include) pool = pool.filter((g) => selection.include!.test(g.name));
  if (selection.exclude) pool = pool.filter((g) => !selection.exclude!.test(g.name));
  if (pool.length === 0) return [];
  if (selection.include) return pool; // an explicit pick is taken as given

  const main = pool.reduce((best, g) => (volume(g) > volume(best) ? g : best), pool[0]);
  const largest = Math.max(...main.size);
  const margin = largest * 0.06;

  return pool.filter((g) => {
    if (g === main) return true;
    const thinnest = Math.min(...g.size);
    if (thinnest < largest * 0.015) return false; // shadow plane
    return boxesTouch(g, main, margin);
  });
}

function volume(g: ObjGroup): number {
  // A flat plane has zero volume; give it a sliver so the largest is still well-defined.
  return Math.max(g.size[0], 1e-6) * Math.max(g.size[1], 1e-6) * Math.max(g.size[2], 1e-6);
}

function boxesTouch(a: ObjGroup, b: ObjGroup, margin: number): boolean {
  for (let k = 0; k < 3; k++) {
    if (a.max[k] < b.min[k] - margin || a.min[k] > b.max[k] + margin) return false;
  }
  return true;
}

/**
 * Writes a copy of the OBJ containing only the chosen groups.
 *
 * Vertices, texture coordinates and normals are renumbered to just those the kept faces use.
 * Leaving unreferenced vertices in place would not be wrong, but they would be measured by
 * everything downstream — including the orientation search, which is exactly the thing the
 * split is trying to make reliable.
 */
export async function writeFilteredObj(
  objPath: string,
  outPath: string,
  keep: ObjGroup[]
): Promise<void> {
  const text = await readFile(objPath, 'utf8');
  const keepNames = new Set(keep.map((g) => g.name));

  const v: string[] = [];
  const vt: string[] = [];
  const vn: string[] = [];
  const faces: string[] = [];
  let current = 'default';

  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) v.push(line);
    else if (line.startsWith('vt ')) vt.push(line);
    else if (line.startsWith('vn ')) vn.push(line);
    else if (line.startsWith('g ') || line.startsWith('o ')) current = line.slice(2).trim() || 'default';
    else if (line.startsWith('f ') && keepNames.has(current)) faces.push(line);
  }

  const vMap = new Map<number, number>();
  const vtMap = new Map<number, number>();
  const vnMap = new Map<number, number>();

  const remap = (map: Map<number, number>, total: number, raw: string): string => {
    if (raw === '') return '';
    const index = Number(raw);
    const absolute = index > 0 ? index : total + index + 1;
    let next = map.get(absolute);
    if (next === undefined) {
      next = map.size + 1;
      map.set(absolute, next);
    }
    return String(next);
  };

  const rewritten = faces.map((line) => {
    const tokens = line.split(/\s+/).slice(1);
    const mapped = tokens.map((token) => {
      const [pv = '', pt = '', pn = ''] = token.split('/');
      const parts = [remap(vMap, v.length, pv), remap(vtMap, vt.length, pt), remap(vnMap, vn.length, pn)];
      // Trim trailing empty slots so "1//" becomes "1", matching what the source had.
      while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
      return parts.join('/');
    });
    return `f ${mapped.join(' ')}`;
  });

  const pick = (lines: string[], map: Map<number, number>) => {
    const ordered: string[] = new Array(map.size);
    for (const [absolute, next] of map) ordered[next - 1] = lines[absolute - 1];
    return ordered;
  };

  const out = [
    '# filtered by scripts/lib/objGroups.ts',
    ...pick(v, vMap),
    ...pick(vt, vtMap),
    ...pick(vn, vnMap),
    'g product',
    ...rewritten,
    '',
  ].join('\n');

  await writeFile(outPath, out, 'utf8');
}
