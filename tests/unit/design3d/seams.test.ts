import { describe, expect, it } from 'vitest';
import { seamFaults } from '@/lib/design3d/seams';

/** A size × size RGBA image from a grey value per pixel. */
function image(size: number, grey: (x: number, y: number) => number): number[] {
  const out: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const g = grey(x, y);
    out.push(g, g, g, 255);
  }
  return out;
}

describe('the seams of a texture', () => {
  it('finds a pattern that does not meet itself across and mirrors that axis only', () => {
    // A photo crop shading from dark at its left to light at its right: every repeat a hard break.
    const faults = seamFaults(image(64, (x) => 40 + x * 3), 64);
    expect(faults.mirrorS).toBe(true);
    expect(faults.mirrorT).toBe(false);
  });

  it('leaves a checkerboard whose squares end at the edge alone (it tiles; mirrored it would not)', () => {
    expect(seamFaults(image(64, (x, y) => (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? 60 : 200), 64)).toEqual({ mirrorS: false, mirrorT: false, border: 0 });
  });

  it('leaves a texture that tiles alone', () => {
    const tiles = seamFaults(image(64, (x, y) => (Math.floor((x + 8) / 16) + Math.floor((y + 8) / 16)) % 2 === 0 ? 60 : 200), 64);
    expect(tiles).toEqual({ mirrorS: false, mirrorT: false, border: 0 });
  });
});
