import { describe, expect, it } from 'vitest';
import { assignCells, boundaryRuns, roomAnchor, wallsFromRuns } from '@/lib/design/planGrid';
import { bareRuns, gapsAlong, inkFromGray, wallBandNear, type InkImage } from '@/lib/design/planInk';

describe('assignCells', () => {
  // Lines at 0, 2, 3, 5 m both ways: a 3 × 3 grid of cells.
  const lines = [0, 2, 3, 5];

  it('gives a cell two rooms claim to the smaller one', () => {
    const grid = assignCells(lines, lines, [
      { parts: [{ x0: 0, x1: 3, y0: 0, y1: 3 }] }, // the whole grid
      { parts: [{ x0: 0, x1: 1, y0: 0, y1: 1 }] }, // its top-left cell
    ]);
    expect(grid.owner[0]).toBe(1);
    expect(grid.owner[1]).toBe(0);
  });

  it('fills a cell shut in by rooms from the neighbour it shares most with, and leaves the outside alone', () => {
    const grid = assignCells(lines, lines, [
      { parts: [{ x0: 0, x1: 3, y0: 0, y1: 1 }, { x0: 0, x1: 1, y0: 1, y1: 3 }] }, // an L along the top and left
      { parts: [{ x0: 1, x1: 3, y0: 2, y1: 3 }, { x0: 2, x1: 3, y0: 1, y1: 2 }] }, // an L along the bottom and right
    ]);
    // The centre cell (1 m wide, shut in) goes to a neighbour; nothing is outside.
    expect(grid.owner[4]).toBeGreaterThanOrEqual(0);
    expect([...grid.owner].every((o) => o >= 0)).toBe(true);
  });

  it('keeps a room in one piece', () => {
    const grid = assignCells(lines, lines, [
      { parts: [{ x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 2, x1: 3, y0: 2, y1: 3 }] }, // two corners, apart
    ]);
    expect([...grid.owner].filter((o) => o === 0)).toHaveLength(1);
  });

  it('anchors a room on its largest cell', () => {
    const grid = assignCells(lines, lines, [{ parts: [{ x0: 0, x1: 3, y0: 0, y1: 3 }] }]);
    expect(roomAnchor(grid, 0)).toEqual({ x: 1, z: 1 });
  });
});

describe('boundaryRuns and wallsFromRuns', () => {
  it('walls every boundary once, and makes the stretch the caller names open a room separator', () => {
    const grid = assignCells([0, 4, 8], [0, 3], [
      { parts: [{ x0: 0, x1: 1, y0: 0, y1: 1 }] },
      { parts: [{ x0: 1, x1: 2, y0: 0, y1: 1 }] },
    ]);
    const runs = boundaryRuns(grid);
    // Two rooms side by side: the outline is six runs, plus the one between them.
    expect(runs).toHaveLength(7);
    const between = runs.find((r) => r.a === 0 && r.b === 1)!;
    expect(between.orientation).toBe('v');
    expect(between.at).toBe(4);

    const walls = wallsFromRuns(runs, () => 0.2, (run) => (run === between ? [[1, 3]] : []));
    const separators = walls.filter((w) => w.separator);
    expect(separators).toHaveLength(1);
    expect(separators[0].thicknessM).toBe(0);
    expect(separators[0].a).toEqual({ x: 4, z: 1 });
    // The rest of that line is still wall.
    expect(walls.some((w) => !w.separator && w.a.x === 4 && w.b.x === 4)).toBe(true);
  });
});

/** A 100 × 100 px drawing: an 6 px wall across at y = 47…52 with a doorway and a window in it. */
function wall(): InkImage {
  const width = 100;
  const height = 100;
  const gray = new Uint8Array(width * height).fill(255);
  for (let y = 47; y <= 52; y++) for (let x = 0; x < width; x++) gray[y * width + x] = 0;
  for (let y = 47; y <= 52; y++) for (let x = 20; x <= 35; x++) gray[y * width + x] = 255; // doorway
  for (let y = 47; y <= 52; y++) for (let x = 60; x <= 79; x++) gray[y * width + x] = y === 47 || y === 52 ? 0 : 255; // window
  return inkFromGray(gray, width, height);
}

describe('planInk', () => {
  it('finds the wall band near a box side, its centre and its thickness', () => {
    const band = wallBandNear(wall(), { orientation: 'h', at: 0.46, from: 0, to: 1 })!;
    expect(band.centre).toBeCloseTo(0.5, 2);
    expect(band.thickness).toBeCloseTo(0.06, 2);
  });

  it('tells a doorway from a window in a solid wall', () => {
    const gaps = gapsAlong(wall(), { orientation: 'h', at: 0.5, from: 0, to: 1 }, 0.06, 0.05)!;
    expect(gaps).toHaveLength(2);
    expect(gaps[0].kind).toBe('empty');
    expect(gaps[0].from).toBeCloseTo(0.2, 1);
    expect(gaps[1].kind).toBe('glazed');
    expect(gaps[1].to).toBeCloseTo(0.8, 1);
  });

  it('sees open floor where a line has no ink', () => {
    const ink = wall();
    expect(bareRuns(ink, { orientation: 'h', at: 0.2, from: 0, to: 1 }, 0.02, 0.5)).toHaveLength(1);
    expect(bareRuns(ink, { orientation: 'h', at: 0.5, from: 0, to: 1 }, 0.02, 0.5)).toHaveLength(0);
  });
});

describe('a drawing in light lines on a dark ground', () => {
  it('finds the same ink as the usual way round', () => {
    const width = 60;
    const height = 40;
    const light = new Uint8Array(width * height).fill(240);
    for (let x = 5; x < 55; x++) for (let y = 10; y < 14; y++) light[y * width + x] = 20; // a wall
    const darkGround = light.map((v) => 255 - v);
    expect(Array.from(inkFromGray(darkGround, width, height).dark)).toEqual(Array.from(inkFromGray(light, width, height).dark));
    expect(inkFromGray(light, width, height).dark[12 * width + 30]).toBe(1);
  });
});
