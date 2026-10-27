import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVariantMaterials } from '@/lib/design3d/variantMaterials';

/** A sofa: a leather seat on wooden legs, as a GLB's materials are named. */
function sofa(leather = new THREE.MeshStandardMaterial({ name: 'Leather', color: '#8A6A50', roughness: 0.8 }), wood = new THREE.MeshStandardMaterial({ name: 'Wood', color: '#5A3A24' })) {
  const root = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(), leather);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(), wood);
  root.add(seat, legs);
  return { root, seat, legs, leather, wood };
}

const black = { id: 'black', slots: [{ material: 'Leather', colorHex: '#111111', keepTexture: false, roughness: 0.3 }] };

describe('a material variant on a model', () => {
  it('changes the parts it names and leaves the rest as the file has them', () => {
    const variants = createVariantMaterials();
    const { root, seat, legs, leather, wood } = sofa();
    variants.apply(root, black);
    const dressed = seat.material as THREE.MeshStandardMaterial;
    expect(dressed).not.toBe(leather);
    expect(dressed.name).toBe('Leather');
    expect(`#${dressed.color.getHexString()}`).toBe('#111111');
    expect(dressed.roughness).toBe(0.3);
    expect(legs.material).toBe(wood);
    // The file's own material is never changed: every other clone of the model still wears it.
    expect(`#${leather.color.getHexString()}`).toBe('#8a6a50');
  });

  it('puts the file’s own materials back', () => {
    const variants = createVariantMaterials();
    const { root, seat, leather } = sofa();
    variants.apply(root, black);
    variants.apply(root, null);
    expect(seat.material).toBe(leather);
  });

  it('makes one copy per look, however many pieces wear it', () => {
    const variants = createVariantMaterials();
    const leather = new THREE.MeshStandardMaterial({ name: 'Leather' });
    const a = sofa(leather);
    const b = sofa(leather);
    variants.apply(a.root, black);
    variants.apply(b.root, black);
    expect(a.seat.material).toBe(b.seat.material);
    variants.apply(b.root, { id: 'white', slots: [{ material: 'Leather', colorHex: '#F2F0EC' }] });
    expect(a.seat.material).not.toBe(b.seat.material);
  });

  it('keeps a textured part’s texture under the colour when its picture cannot be read', () => {
    const variants = createVariantMaterials();
    const map = new THREE.Texture();
    const { root, seat } = sofa(new THREE.MeshStandardMaterial({ name: 'Leather', map }));
    variants.apply(root, { id: 'tint', slots: [{ material: 'Leather', colorHex: '#224466' }] });
    const dressed = seat.material as THREE.MeshStandardMaterial;
    expect(dressed.map).toBe(map);
    expect(`#${dressed.color.getHexString()}`).toBe('#224466');
    // …and drops it when asked for a plain colour.
    variants.apply(root, { id: 'plain', slots: [{ material: 'Leather', colorHex: '#224466', keepTexture: false }] });
    expect((seat.material as THREE.MeshStandardMaterial).map).toBeNull();
  });

  it('dresses a mesh with several materials part by part', () => {
    const variants = createVariantMaterials();
    const leather = new THREE.MeshStandardMaterial({ name: 'Leather' });
    const wood = new THREE.MeshStandardMaterial({ name: 'Wood' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [leather, wood]);
    variants.apply(mesh, black);
    const [first, second] = mesh.material as THREE.Material[];
    expect(first).not.toBe(leather);
    expect(second).toBe(wood);
  });
});
