import { describe, expect, it } from 'vitest';
import { colorFamily, colorTally, colorsOfPixels, parseHex, productColorFamilies, productColors, toHex } from '@/lib/design/colors';

describe('colour families', () => {
  it('reads a hex in either length and nothing else', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('C8B79A')).toEqual([200, 183, 154]);
    expect(parseHex('#C8B79')).toBeNull();
    expect(parseHex(null)).toBeNull();
    expect(toHex(200, 183, 154)).toBe('#C8B79A');
  });

  it('names the greys by how light they are', () => {
    expect(colorFamily('#FFFFFF')).toBe('white');
    expect(colorFamily('#FAF8F4')).toBe('white'); // a warm white is still white
    expect(colorFamily('#9A9A9A')).toBe('grey');
    expect(colorFamily('#4A4A48')).toBe('grey');
    expect(colorFamily('#2B2D31')).toBe('black');
  });

  it('calls the woods beige or brown, not orange', () => {
    expect(colorFamily('#C8B79A')).toBe('beige'); // light oak
    expect(colorFamily('#D9C7A8')).toBe('beige'); // linen
    expect(colorFamily('#E9E2D6')).toBe('white'); // an off-white is a white
    expect(colorFamily('#F3CCA8')).toBe('beige'); // a pale peach wood: vivid by HSL, pale to the eye
    expect(colorFamily('#6E4526')).toBe('brown'); // walnut
    expect(colorFamily('#8B4513')).toBe('brown'); // saddle leather
    expect(colorFamily('#9A463D')).toBe('brown'); // cognac
    expect(colorFamily('#B08D57')).toBe('brown'); // brass
    expect(colorFamily('#E8852C')).toBe('orange');
  });

  it('tells the colours apart', () => {
    expect(colorFamily('#C8372D')).toBe('red');
    expect(colorFamily('#F7A39E')).toBe('pink'); // Kenney's sofa
    expect(colorFamily('#F2A7B0')).toBe('pink');
    expect(colorFamily('#EBC83A')).toBe('yellow');
    expect(colorFamily('#4E9A51')).toBe('green');
    expect(colorFamily('#2F5D3A')).toBe('green');
    expect(colorFamily('#3B78C4')).toBe('blue');
    expect(colorFamily('#1F2F4F')).toBe('blue');
    expect(colorFamily('#8B5FBF')).toBe('purple');
  });

  it('knows a product by the colours read off its model, else by its one colour', () => {
    expect(productColors({ colorHex: '#6E4526', specs: { colors: ['#FFFFFF', '#6E4526', 'oak'] } })).toEqual(['#FFFFFF', '#6E4526']);
    expect(productColorFamilies({ colorHex: '#6E4526', specs: { colors: ['#FFFFFF', '#FAF8F4', '#6E4526'] } })).toEqual(['white', 'brown']);
    expect(productColorFamilies({ colorHex: '#6E4526', specs: null })).toEqual(['brown']);
    expect(productColorFamilies({ colorHex: null, specs: { surfaces: ['floor'] } })).toEqual([]);
  });
});

/** Raw pixels: each [hex, how many] run, as RGB (or RGBA with the alpha given). */
function pixels(runs: Array<[string, number, number?]>, channels: 3 | 4 = 3): number[] {
  const out: number[] = [];
  for (const [hex, count, alpha = 255] of runs) {
    const [r, g, b] = parseHex(hex)!;
    for (let i = 0; i < count; i++) out.push(...(channels === 4 ? [r, g, b, alpha] : [r, g, b]));
  }
  return out;
}

describe('reading colours off a texture', () => {
  it('names it by its families, the largest first, each the mean of its pixels', () => {
    // An oak floor under white paint: the whites are one family, and their mean is the colour.
    expect(colorsOfPixels(pixels([['#FFFFFF', 50], ['#F4F4F2', 10], ['#6E4526', 40]]), 3)).toEqual(['#FDFDFD', '#6E4526']);
  });

  it('leaves out a family under an eighth of the image, but never the largest', () => {
    expect(colorsOfPixels(pixels([['#1F1F1F', 90], ['#C8372D', 10]]), 3)).toEqual(['#1F1F1F']);
    // Five colours in equal parts: the first three, the largest first (a tie keeps the order met).
    expect(colorsOfPixels(pixels([['#4E9A51', 20], ['#3B78C4', 20], ['#EBC83A', 20], ['#C8372D', 20], ['#8B5FBF', 20]]), 3)).toHaveLength(3);
  });

  it('reads a chequerboard as its two colours', () => {
    expect(colorsOfPixels(pixels([['#111111', 51], ['#F0F0F0', 49]]), 3)).toEqual(['#111111', '#F0F0F0']);
  });

  it('skips what is transparent in an image with alpha', () => {
    expect(colorsOfPixels(pixels([['#3B78C4', 30], ['#FFFFFF', 70, 0]], 4), 4)).toEqual(['#3B78C4']);
    expect(colorsOfPixels([], 4)).toEqual([]);
  });

  it('weighs what it is given — a model\'s triangles by their area', () => {
    const tally = colorTally();
    tally.add(255, 255, 255, 1);
    tally.add(110, 69, 38, 3);
    tally.add(200, 55, 45, 0); // no area, no say
    expect(tally.colors()).toEqual(['#6E4526', '#FFFFFF']);
  });
});
