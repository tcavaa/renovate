/**
 * Reads the floor a model really covers off its geometry (see `lib/design/footprintMasks`).
 *
 * Looked at from above, every triangle of every mesh is dropped onto a grid laid over the
 * model's bounding box, and a cell any triangle touches is covered. "Touches" is a real
 * triangle-against-square test, not the triangle's own bounding box: a seat cushion is two
 * big triangles, and the box of a triangle running corner to corner of an L covers the very
 * corner that is empty. The answer errs on the covered side — a cell grazed by an armrest
 * is a cell nothing else may stand in — so a mask never lets two pieces through each other.
 */

import * as THREE from 'three';
import { MASK_GRID, maskFromGrid, type MaskRect } from '@/lib/design/footprintMasks';

/** `root` must already stand where the studio puts it: centred on x/z (as `loadModel` leaves it). */
export function footprintMaskOf(root: THREE.Object3D, size: THREE.Vector3): MaskRect[] | null {
  if (size.x < 1e-4 || size.z < 1e-4) return null;
  const n = MASK_GRID;
  const cells: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  let covered = 0;

  root.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  // Into grid units: 0 → n across the width (x) and the depth (z).
  const gx = (x: number) => (x / size.x + 0.5) * n;
  const gz = (z: number) => (z / size.z + 0.5) * n;

  root.traverse((child) => {
    if (covered === n * n || !(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count && covered < n * n; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(child.matrixWorld);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(child.matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(child.matrixWorld);
      const tri: Array<[number, number]> = [
        [gx(a.x), gz(a.z)],
        [gx(b.x), gz(b.z)],
        [gx(c.x), gz(c.z)],
      ];
      const c0 = Math.max(0, Math.floor(Math.min(tri[0][0], tri[1][0], tri[2][0])));
      const c1 = Math.min(n - 1, Math.floor(Math.max(tri[0][0], tri[1][0], tri[2][0])));
      const r0 = Math.max(0, Math.floor(Math.min(tri[0][1], tri[1][1], tri[2][1])));
      const r1 = Math.min(n - 1, Math.floor(Math.max(tri[0][1], tri[1][1], tri[2][1])));
      for (let r = r0; r <= r1; r++) {
        for (let col = c0; col <= c1; col++) {
          if (cells[r][col] || !triangleTouchesCell(tri, col, r)) continue;
          cells[r][col] = true;
          covered++;
        }
      }
    }
  });
  return maskFromGrid(cells);
}

/** Does the triangle overlap the unit square at (column, row)? Separating axes: the square's two, the triangle's three. */
function triangleTouchesCell(tri: Array<[number, number]>, column: number, row: number): boolean {
  // A hair inside the cell, so a triangle lying exactly along a grid line covers one side of it.
  const eps = 1e-6;
  const minX = column + eps;
  const maxX = column + 1 - eps;
  const minZ = row + eps;
  const maxZ = row + 1 - eps;
  const xs = [tri[0][0], tri[1][0], tri[2][0]];
  const zs = [tri[0][1], tri[1][1], tri[2][1]];
  if (Math.max(...xs) < minX || Math.min(...xs) > maxX || Math.max(...zs) < minZ || Math.min(...zs) > maxZ) return false;
  const corners: Array<[number, number]> = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  for (let i = 0; i < 3; i++) {
    const [x0, z0] = tri[i];
    const [x1, z1] = tri[(i + 1) % 3];
    // The edge's normal; a degenerate edge separates nothing.
    const nx = z1 - z0;
    const nz = x0 - x1;
    if (Math.abs(nx) < 1e-12 && Math.abs(nz) < 1e-12) continue;
    const project = (p: [number, number]) => p[0] * nx + p[1] * nz;
    const t = tri.map(project);
    const q = corners.map(project);
    if (Math.max(...t) < Math.min(...q) || Math.min(...t) > Math.max(...q)) return false;
  }
  return true;
}
