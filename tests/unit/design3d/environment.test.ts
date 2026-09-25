import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGround, skyTexture } from '@/lib/design3d/environment';
import { DAYLIGHT_HOURS, lightingForHour } from '@/lib/design3d/daylight';
import { getStyle } from '@/lib/design/styles';

/** The world the flat stands in: a sky that follows the hour, and a ruled ground under it. */

const style = getStyle('scandinavian');

const bytesOf = (hex: string): number[] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

describe('the sky', () => {
  it('is the haze at the horizon and below it, and the colour overhead straight up', () => {
    const sky = skyTexture('#4F90EC', '#DCE8F5');
    const { data, height } = sky.image as { data: Uint8Array; height: number };
    const row = (r: number) => Array.from(data.slice(r * 4, r * 4 + 3));
    expect(row(0)).toEqual(bytesOf('#DCE8F5'));
    expect(row(height / 2 - 1)).toEqual(bytesOf('#DCE8F5'));
    expect(row(height - 1)).toEqual(bytesOf('#4F90EC'));
    // It deepens steadily on the way up: the red goes out of it and never comes back.
    for (let r = height / 2; r < height; r++) expect(row(r)[0]).toBeLessThanOrEqual(row(r - 1)[0]);
    expect(sky.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(sky.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('follows the hour, and the fog is always the horizon colour', () => {
    const noon = lightingForHour(DAYLIGHT_HOURS.noon, style);
    const evening = lightingForHour(DAYLIGHT_HOURS.evening, style);
    const night = lightingForHour(DAYLIGHT_HOURS.night, style);
    for (const light of [noon, evening, night]) expect(light.background).toBe(light.skyHorizon);
    const [r, , b] = bytesOf(noon.skyTop);
    expect(b).toBeGreaterThan(r);
    const glow = bytesOf(evening.skyHorizon);
    expect(glow[0]).toBeGreaterThan(glow[2]);
    const sum = (hex: string) => bytesOf(hex).reduce((a, c) => a + c, 0);
    expect(sum(night.skyTop)).toBeLessThan(sum(noon.skyTop) / 4);
  });
});

describe('the ground', () => {
  it('lies under the floors, takes the flat’s shadow and can never be picked', () => {
    const ground = buildGround();
    expect(ground.position.y).toBeLessThan(0);
    expect(ground.receiveShadow).toBe(true);
    const down = new THREE.Raycaster(new THREE.Vector3(1, 10, 1), new THREE.Vector3(0, -1, 0));
    expect(down.intersectObject(ground)).toEqual([]);
  });
});
