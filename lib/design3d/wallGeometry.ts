/**
 * The mesh of one room edge's wall, built face by face.
 *
 * `ExtrudeGeometry` was the first way: a holed rectangle pushed through the wall's
 * thickness. It could not mitre a corner, could not be a different depth along its length,
 * and gave every face but the two lids one material — so the top of a wall took the colour
 * of the room's paper and a shared wall's top was striped in two. Here every face is written
 * out on its own, from the pieces `lib/design/wallPieces` cuts the edge into:
 *
 *   - the **room face**, holed for doors and windows, split into stretches wherever the
 *     person painted part of the wall — a one-metre strip floor to ceiling, or a single
 *     square metre of it — each stretch its own material slot;
 *   - the **reveals** inside the holes, in the wall's own finish;
 *   - the **far face**, in the finish of whoever is on the other side;
 *   - the **top and the ends**, in one neutral "cut" material, so the tops of all the walls
 *     read as one section through the flat whatever is on their faces.
 *
 * Every rectangle on a wall is axis-aligned in (along, up), so faces with holes are laid
 * out as a grid of cells between the breakpoints rather than triangulated — no ear
 * clipping, no holes touching the outline, exact UVs. UVs are in metres on every face, so
 * a texture runs on unbroken from one strip to the next and tiles at its real size.
 *
 * Geometry comes back in world coordinates (the mesh needs no transform), with one group
 * per material slot.
 */

import * as THREE from 'three';
import type { PlanEdge } from '@/lib/design/planGeometry';
import type { WallPiece } from '@/lib/design/wallPieces';

export interface WallHole {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export interface WallFaceSpan {
  from: number;
  to: number;
  /** How far up the wall the stretch reaches; the whole height when absent (a strip). */
  bottom?: number;
  top?: number;
  slot: number;
}

export const WALL_SLOT_BASE = 0;
export const WALL_SLOT_CAP = 1;

export interface WallMeshSpec {
  edge: PlanEdge;
  height: number;
  pieces: WallPiece[];
  holes: WallHole[];
  /**
   * Stretches of the room face with their own material slot; everything else is
   * `WALL_SLOT_BASE`. Where two overlap the later one shows — list strips before patches.
   */
  spans?: WallFaceSpan[];
  /** The material slot of each piece's far face, by piece index; `WALL_SLOT_BASE` when absent. */
  farSlots?: number[];
}

interface Batch {
  positions: number[];
  normals: number[];
  uvs: number[];
}

/** The wall's geometry, one group per slot that has any faces. */
export function buildWallGeometry(spec: WallMeshSpec): THREE.BufferGeometry {
  const { edge, height, pieces } = spec;
  const spans = spec.spans ?? [];
  const batches = new Map<number, Batch>();
  const batch = (slot: number): Batch => {
    let b = batches.get(slot);
    if (!b) {
      b = { positions: [], normals: [], uvs: [] };
      batches.set(slot, b);
    }
    return b;
  };

  /** A point of the wall: `s` metres along the edge, `y` up, `w` back from the room face. */
  const at = (s: number, y: number, w: number): [number, number, number] => [edge.a.x + edge.dir.x * s - edge.inward.x * w, y, edge.a.z + edge.dir.z * s - edge.inward.z * w];

  /** A quad p0 → p1 → p2 → p3, wound to face along `normal` whatever order it was given in. */
  const quad = (slot: number, corners: Array<[number, number, number]>, normal: [number, number, number], uv: Array<[number, number]>) => {
    const [p0, p1, p2] = corners;
    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];
    const facing = (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2];
    const order = facing >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const b = batch(slot);
    for (const i of order) {
      b.positions.push(...corners[i]);
      b.normals.push(...normal);
      b.uvs.push(...uv[i]);
    }
  };

  const inward: [number, number, number] = [edge.inward.x, 0, edge.inward.z];
  const outward: [number, number, number] = [-edge.inward.x, 0, -edge.inward.z];
  const forward: [number, number, number] = [edge.dir.x, 0, edge.dir.z];
  const backward: [number, number, number] = [-edge.dir.x, 0, -edge.dir.z];
  // Later in the list lies on top, like paint: a square metre painted over a strip is what
  // shows. Taking the first match instead hid every patch laid on a strip — the strips are
  // listed first — so the brush seemed not to apply there at all.
  const slotAt = (s: number, y = 0): number => {
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      if (s >= span.from && s <= span.to && y >= (span.bottom ?? 0) && y <= (span.top ?? Infinity)) return span.slot;
    }
    return WALL_SLOT_BASE;
  };

  pieces.forEach((piece, index) => {
    const holes = spec.holes
      .map((h) => ({ ...h, left: Math.max(h.left, piece.from), right: Math.min(h.right, piece.to) }))
      .filter((h) => h.right - h.left > 1e-4 && h.top - h.bottom > 1e-4);
    const inHole = (s: number, y: number) => holes.some((h) => s > h.left && s < h.right && y > h.bottom && y < h.top);
    // The face is cut where a hole starts or ends, and where a painted patch does.
    const ys = breakpoints([0, height, ...holes.flatMap((h) => [h.bottom, h.top]), ...spans.flatMap((s) => [s.bottom ?? 0, s.top ?? height])], 0, height);

    // --- the room face, cell by cell ---
    const nearXs = breakpoints([piece.from, piece.to, ...holes.flatMap((h) => [h.left, h.right]), ...spans.flatMap((s) => [s.from, s.to])], piece.from, piece.to);
    for (let i = 0; i + 1 < nearXs.length; i++) {
      for (let j = 0; j + 1 < ys.length; j++) {
        const [s0, s1, y0, y1] = [nearXs[i], nearXs[i + 1], ys[j], ys[j + 1]];
        if (inHole((s0 + s1) / 2, (y0 + y1) / 2)) continue;
        quad(slotAt((s0 + s1) / 2, (y0 + y1) / 2), [at(s0, y0, 0), at(s1, y0, 0), at(s1, y1, 0), at(s0, y1, 0)], inward, [[s0, y0], [s1, y0], [s1, y1], [s0, y1]]);
      }
    }

    // --- the far face: the same holes, its own ends ---
    const farSlot = spec.farSlots?.[index] ?? WALL_SLOT_BASE;
    const farXs = breakpoints([piece.farFrom, piece.farTo, ...holes.flatMap((h) => [h.left, h.right])], piece.farFrom, piece.farTo);
    for (let i = 0; i + 1 < farXs.length; i++) {
      for (let j = 0; j + 1 < ys.length; j++) {
        const [s0, s1, y0, y1] = [farXs[i], farXs[i + 1], ys[j], ys[j + 1]];
        if (inHole((s0 + s1) / 2, (y0 + y1) / 2)) continue;
        // Mirrored along the wall, so a pattern reads the right way round from the other side.
        quad(farSlot, [at(s0, y0, piece.depth), at(s1, y0, piece.depth), at(s1, y1, piece.depth), at(s0, y1, piece.depth)], outward, [[-s0, y0], [-s1, y0], [-s1, y1], [-s0, y1]]);
      }
    }

    // --- the reveals: the inside of every hole, as deep as this piece ---
    for (const h of holes) {
      const slot = slotAt((h.left + h.right) / 2, (h.bottom + h.top) / 2);
      const original = spec.holes.find((o) => o.bottom === h.bottom && o.top === h.top && o.left <= h.left + 1e-6 && o.right >= h.right - 1e-6);
      // A jamb only where the hole really ends — not where a piece boundary cut it in two.
      if (!original || Math.abs(original.left - h.left) < 1e-6) quad(slot, [at(h.left, h.bottom, 0), at(h.left, h.bottom, piece.depth), at(h.left, h.top, piece.depth), at(h.left, h.top, 0)], forward, [[0, h.bottom], [piece.depth, h.bottom], [piece.depth, h.top], [0, h.top]]);
      if (!original || Math.abs(original.right - h.right) < 1e-6) quad(slot, [at(h.right, h.bottom, 0), at(h.right, h.bottom, piece.depth), at(h.right, h.top, piece.depth), at(h.right, h.top, 0)], backward, [[0, h.bottom], [piece.depth, h.bottom], [piece.depth, h.top], [0, h.top]]);
      if (h.top < height - 1e-4) quad(slot, [at(h.left, h.top, 0), at(h.right, h.top, 0), at(h.right, h.top, piece.depth), at(h.left, h.top, piece.depth)], [0, -1, 0], [[h.left, 0], [h.right, 0], [h.right, piece.depth], [h.left, piece.depth]]);
      if (h.bottom > 1e-4) quad(slot, [at(h.left, h.bottom, 0), at(h.right, h.bottom, 0), at(h.right, h.bottom, piece.depth), at(h.left, h.bottom, piece.depth)], [0, 1, 0], [[h.left, 0], [h.right, 0], [h.right, piece.depth], [h.left, piece.depth]]);
    }

    // --- the top, and the two ends (slanted where the corner is mitred) ---
    quad(WALL_SLOT_CAP, [at(piece.from, height, 0), at(piece.to, height, 0), at(piece.farTo, height, piece.depth), at(piece.farFrom, height, piece.depth)], [0, 1, 0], [[piece.from, 0], [piece.to, 0], [piece.farTo, piece.depth], [piece.farFrom, piece.depth]]);
    const endNormal = (from: number, farFrom: number, sign: 1 | -1): [number, number, number] => {
      // Perpendicular to the end's slant, pointing away from the piece.
      const ds = farFrom - from;
      const length = Math.hypot(ds, piece.depth) || 1;
      const ns = (sign * piece.depth) / length;
      const nw = (-sign * ds) / length;
      return [edge.dir.x * ns - edge.inward.x * nw, 0, edge.dir.z * ns - edge.inward.z * nw];
    };
    quad(WALL_SLOT_CAP, [at(piece.from, 0, 0), at(piece.from, height, 0), at(piece.farFrom, height, piece.depth), at(piece.farFrom, 0, piece.depth)], endNormal(piece.from, piece.farFrom, -1), [[0, 0], [0, height], [piece.depth, height], [piece.depth, 0]]);
    quad(WALL_SLOT_CAP, [at(piece.to, 0, 0), at(piece.to, height, 0), at(piece.farTo, height, piece.depth), at(piece.farTo, 0, piece.depth)], endNormal(piece.to, piece.farTo, 1), [[0, 0], [0, height], [piece.depth, height], [piece.depth, 0]]);
  });

  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const slot of [...batches.keys()].sort((a, b) => a - b)) {
    const b = batches.get(slot)!;
    geometry.addGroup(positions.length / 3, b.positions.length / 3, slot);
    positions.push(...b.positions);
    normals.push(...b.normals);
    uvs.push(...b.uvs);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** The sorted, de-duplicated breakpoints that fall inside [min, max], ends included. */
function breakpoints(values: number[], min: number, max: number): number[] {
  const inside = values.filter((v) => v >= min - 1e-6 && v <= max + 1e-6).map((v) => Math.max(min, Math.min(max, v)));
  inside.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of inside) if (out.length === 0 || v - out[out.length - 1] > 1e-5) out.push(v);
  return out;
}

/**
 * A moulding — a skirting board along the floor or a cornice under the ceiling — swept
 * along a stretch of a wall. `profile` is the moulding's cross-section as a closed outline
 * in (out from the wall, up) metres, starting and ending on the wall (out = 0); `startCut`
 * and `endCut` are how far the run gives way per metre it stands out from the wall — 1 at
 * a square inside corner, where the two boards meet on the diagonal, −1 at an outside
 * corner, 0 at a door.
 */
export function buildMouldingGeometry(edge: PlanEdge, from: number, to: number, baseY: number, profile: Array<[number, number]>, startCut: number, endCut: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const point = (s: number, out: number, y: number): [number, number, number] => [edge.a.x + edge.dir.x * s + edge.inward.x * out, baseY + y, edge.a.z + edge.dir.z * s + edge.inward.z * out];
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number], normal: [number, number, number], ua: [number, number], ub: [number, number], uc: [number, number]) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const facing = (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2];
    const ordered = facing >= 0 ? [a, b, c] : [a, c, b];
    const orderedUv = facing >= 0 ? [ua, ub, uc] : [ua, uc, ub];
    ordered.forEach((p, i) => {
      positions.push(...p);
      normals.push(...normal);
      uvs.push(...orderedUv[i]);
    });
  };

  // The faces of the sweep: one quad per side of the profile that is not the wall itself.
  let run = 0;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [o0, y0] = profile[i];
    const [o1, y1] = profile[i + 1];
    const side = Math.hypot(o1 - o0, y1 - y0);
    if (side < 1e-6) continue;
    // Out of the profile: the outline runs up the wall side last, so its outside is to the right of travel.
    const no = (y1 - y0) / side;
    const ny = -(o1 - o0) / side;
    const normal: [number, number, number] = [edge.inward.x * no, ny, edge.inward.z * no];
    const a = point(from + startCut * o0, o0, y0);
    const b = point(to - endCut * o0, o0, y0);
    const c = point(to - endCut * o1, o1, y1);
    const d = point(from + startCut * o1, o1, y1);
    tri(a, b, c, normal, [from, run], [to, run], [to, run + side]);
    tri(a, c, d, normal, [from, run], [to, run + side], [from, run + side]);
    run += side;
  }
  // The two ends, as fans about the corner the moulding sits in (where the wall meets the
  // floor or the ceiling) — every point of a moulding's outline can be seen from there, a
  // hollow cornice's included. Seen where a board stops at a door.
  const hub = profile.reduce((best, p, i) => (Math.hypot(p[0], p[1]) < Math.hypot(profile[best][0], profile[best][1]) ? i : best), 0);
  const ring = [...profile.slice(hub), ...profile.slice(0, hub)];
  const end = (s: number, cut: number, normal: [number, number, number]) => {
    const [o0, y0] = ring[0];
    for (let i = 1; i + 1 < ring.length; i++) {
      const [o1, y1] = ring[i];
      const [o2, y2] = ring[i + 1];
      tri(point(s + cut * o0, o0, y0), point(s + cut * o1, o1, y1), point(s + cut * o2, o2, y2), normal, [o0, y0], [o1, y1], [o2, y2]);
    }
  };
  end(from, startCut, [-edge.dir.x, 0, -edge.dir.z]);
  end(to, -endCut, [edge.dir.x, 0, edge.dir.z]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
