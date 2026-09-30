import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { alongX, instanced } from '@/lib/design3d/instancing';
import { disposeOwnedGeometry } from '@/lib/design3d/buildScene';

/**
 * A radiator's sections, a double socket's plates and a railing's modules are one instanced run
 * per mesh of their model instead of a clone per copy — a draw call per mesh, not per copy.
 */

/** A two-part model whose parts carry node transforms, like a compressed GLB's quantised nodes. */
function sectionModel() {
  const geometry = new THREE.BoxGeometry(0.08, 0.6, 0.1);
  const material = new THREE.MeshStandardMaterial();
  const body = new THREE.Mesh(geometry, material);
  body.position.set(0.01, 0.3, 0);
  body.scale.set(2, 1, 1);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.1), new THREE.MeshStandardMaterial());
  cap.position.y = 0.61;
  const node = new THREE.Group();
  node.position.z = 0.05;
  node.add(body, cap);
  const model = new THREE.Group();
  model.add(node);
  return { model, body, cap, geometry, material };
}

describe('instanced', () => {
  it('draws each mesh of the model once for all the copies, sharing its geometry and material', () => {
    const { model, geometry, material } = sectionModel();
    const run = instanced(model, [alongX(-0.08), alongX(0), alongX(0.08)]);
    const meshes = run.children as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(2);
    expect(meshes.every((m) => m instanceof THREE.InstancedMesh && m.count === 3)).toBe(true);
    expect(meshes[0].geometry).toBe(geometry);
    expect(meshes[0].material).toBe(material);
  });

  it('keeps the model’s own node transforms under each placement', () => {
    const { model } = sectionModel();
    const run = instanced(model, [alongX(0), alongX(1)]);
    const body = run.children[0] as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    body.getMatrixAt(1, matrix);
    matrix.decompose(position, new THREE.Quaternion(), scale);
    // One metre along, plus the body's own offset inside its node, plus the node's.
    expect(position.x).toBeCloseTo(1.01, 6);
    expect(position.y).toBeCloseTo(0.3, 6);
    expect(position.z).toBeCloseTo(0.05, 6);
    expect(scale.x).toBeCloseTo(2, 6);
  });

  it('bounds the whole run, so the camera does not cull copies far from the first', () => {
    const { model } = sectionModel();
    const run = instanced(model, Array.from({ length: 10 }, (_, i) => alongX(i)));
    const box = (run.children[0] as THREE.InstancedMesh).boundingBox!;
    expect(box.max.x - box.min.x).toBeGreaterThan(9);
  });

  it('frees only the instance buffers with its group, never the shared geometry', () => {
    const { model, geometry } = sectionModel();
    const group = new THREE.Group();
    group.add(instanced(model, [alongX(0), alongX(0.08)]));
    const geometryDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed);
    const instancesDisposed = vi.fn();
    (group.children[0].children[0] as THREE.InstancedMesh).addEventListener('dispose', instancesDisposed);

    disposeOwnedGeometry(group);
    expect(instancesDisposed).toHaveBeenCalled();
    expect(geometryDisposed).not.toHaveBeenCalled();
  });

  it('makes nothing of no placements', () => {
    expect(instanced(sectionModel().model, []).children).toHaveLength(0);
  });
});
