import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clearGlazing, plainGlass } from '@/lib/design3d/glass';

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

/**
 * Window and glazed-door models that carry their glass as an opaque material named "Glass"
 * (the fixtures' "Nordic" and "Grid") drew every window as a grey board.
 */
describe('clearGlazing', () => {
  it('makes an opaque pane see-through and stops it casting a shadow', () => {
    const pane = new THREE.MeshStandardMaterial({ name: 'Glass', roughness: 0.6 });
    const frame = new THREE.MeshStandardMaterial({ name: 'White' });
    const opening = new THREE.Group();
    const paneMesh = new THREE.Mesh(new THREE.BoxGeometry(), pane);
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(), frame);
    paneMesh.castShadow = frameMesh.castShadow = true;
    opening.add(frameMesh, paneMesh);

    expect(clearGlazing(opening)).toBe(1);
    expect(pane.transparent).toBe(true);
    expect(pane.opacity).toBeLessThan(0.3);
    expect(pane.depthWrite).toBe(false);
    expect(pane.roughness).toBeCloseTo(0.05, 6);
    expect(paneMesh.castShadow).toBe(false);
    // The frame is not glass.
    expect(frame.transparent).toBe(false);
    expect(frameMesh.castShadow).toBe(true);
  });

  it('changes a shared pane once and leaves glass that is already clear alone', () => {
    const pane = new THREE.MeshStandardMaterial({ name: 'window_glass' });
    const clear = new THREE.MeshStandardMaterial({ name: 'Glass.001', transparent: true, opacity: 0.4 });
    const opening = new THREE.Group();
    opening.add(new THREE.Mesh(new THREE.BoxGeometry(), pane), new THREE.Mesh(new THREE.BoxGeometry(), pane), new THREE.Mesh(new THREE.BoxGeometry(), clear));

    expect(clearGlazing(opening)).toBe(1);
    expect(clear.opacity).toBeCloseTo(0.4, 6);
    expect(clearGlazing(opening)).toBe(0);
  });
});
