import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { plainGlass } from '@/lib/design3d/glass';

/**
 * A transmissive part made three render the whole flat a second time every frame (measured at
 * about half of the GPU frame); the loader turns it into plain transparency instead.
 */
describe('plainGlass', () => {
  it('turns transmission into see-through glass that does not write depth', () => {
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05 });
    const frame = new THREE.MeshStandardMaterial();
    const clock = new THREE.Group();
    clock.add(new THREE.Mesh(new THREE.BoxGeometry(), frame), new THREE.Mesh(new THREE.BoxGeometry(), glass));

    expect(plainGlass(clock)).toBe(1);
    expect(glass.transmission).toBe(0);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeCloseTo(0.3, 6);
    expect(glass.depthWrite).toBe(false);
    expect(glass.roughness).toBeCloseTo(0.05, 6);
    // What was not glass is left alone.
    expect(frame.transparent).toBe(false);
    expect(frame.depthWrite).toBe(true);
  });

  it('keeps a partly transmissive part more solid, and changes a shared material once', () => {
    const crystal = new THREE.MeshPhysicalMaterial({ transmission: 0.7 });
    const chandelier = new THREE.Group();
    chandelier.add(new THREE.Mesh(new THREE.SphereGeometry(), crystal), new THREE.Mesh(new THREE.SphereGeometry(), [crystal, new THREE.MeshStandardMaterial()]));

    expect(plainGlass(chandelier)).toBe(1);
    expect(crystal.opacity).toBeCloseTo(1 - 0.7 * 0.7, 6);
    // Nothing left to change the second time.
    expect(plainGlass(chandelier)).toBe(0);
  });

  it('leaves a model with no glass untouched', () => {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({ clearcoat: 1 }));
    expect(plainGlass(chair)).toBe(0);
    expect((chair.material as THREE.MeshPhysicalMaterial).transparent).toBe(false);
  });
});
