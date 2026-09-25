import { describe, expect, it } from 'vitest';
import { budgetSections, budgetSummary, priceScene } from '@/lib/design/pricing';
import { tradesNeeded } from '@/lib/design/trades';
import { addOpening } from '@/lib/design/openings';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { DesignScene, ElectricalPoint, FloorPlan, PlanRoom, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type']): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

function plan(): FloorPlan {
  let rooms = [rect('living', 0, 0, 5, 4, 'living_room'), rect('bath', 5.12, 0, 2.5, 2, 'bathroom')];
  rooms = addOpening(rooms, 'living', 'door', 1, 0.12).rooms; // interior door living ↔ bath (wall 1 of living is x = 5)
  rooms = addOpening(rooms, 'living', 'window', 0, 0.12).rooms;
  return {
    rooms,
    metresPerPixel: null,
    bounds: { width: 7.6, depth: 4 },
    source: 'manual',
    wallThicknessM: 0.12,
    technical: { points: [{ id: 't1', kind: 'sewer', roomId: 'bath', position: P(5.3, 0.3), origin: 'existing' }, { id: 't2', kind: 'radiator', roomId: 'living', position: P(2, 0.1), origin: 'existing' }] },
  };
}

const socket = (id: string, origin: ElectricalPoint['origin']): ElectricalPoint => ({ id, roomId: 'living', kind: 'socket_double', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.2, count: 2, origin });
const light: ElectricalPoint = { id: 'l1', roomId: 'living', kind: 'light_ceiling', position: P(2.5, 2), elevationM: 2.7, on: true, origin: 'generated' };

function scene(mode: DesignScene['mode'], electrical: ElectricalPoint[]): DesignScene {
  return { styleId: 'modern', mode, budgetGel: null, items: [], finishes: [], electrical };
}

describe('budget lines', () => {
  it('prices nothing technical in a finished home unless the person added it', () => {
    const cost = priceScene(plan(), scene('design_only', [socket('s1', 'generated'), light]));
    expect(cost.technicalTotal).toBe(0);
    expect(cost.openingsTotal).toBe(0);
    const added = priceScene(plan(), scene('design_only', [socket('s2', 'user')]));
    expect(added.technicalTotal).toBeGreaterThan(0);
    const sockets = added.lines.find((l) => l.key === 'electrical_socket_double')!;
    expect(sockets.qty).toBe(1);
    expect(sockets.section).toBe('electrical');
    expect(added.lines.some((l) => l.section === 'labour' && l.key === 'electric_point')).toBe(true);
  });

  it('prices a door that is a real product at its price, once for both halves', () => {
    const product = { productId: 21, nameKa: 'კარი „Oak“', slug: 'door-oak', brand: null, pricePerUnit: 620, unit: 'piece', qty: 1, totalPrice: 620, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/models/fixtures/door-oak.glb', categorySlug: 'doors', store: null };
    const p = plan();
    const rooms = p.rooms.map((r) => ({ ...r, openings: r.openings.map((o) => (o.kind === 'door' ? { ...o, product, origin: 'user' as const } : o)) }));
    const cost = priceScene({ ...p, rooms }, scene('design_only', []));
    const line = cost.lines.find((l) => l.key === 'product-21')!;
    expect(line).toBeDefined();
    expect(line.qty).toBe(1);
    expect(line.total).toBe(620);
    expect(line.estimated).toBe(false);
    expect(line.name).toBe('კარი „Oak“');
    expect(cost.lines.filter((l) => l.key === 'door')).toHaveLength(0);
    expect(cost.openingsTotal).toBe(620);
  });

  it('prices a fitting that is a real product at its price, not as an estimate', () => {
    const product = { productId: 9, nameKa: 'როზეტი', slug: 'socket', brand: null, pricePerUnit: 30, unit: 'piece', qty: 2, totalPrice: 60, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/models/fixtures/socket-eu.glb', categorySlug: 'sockets-switches', store: null };
    const cost = priceScene(plan(), scene('design_only', [{ ...socket('s1', 'user'), product }, { ...socket('s2', 'user'), product }]));
    const line = cost.lines.find((l) => l.key === 'product-9')!;
    expect(line.estimated).toBe(false);
    expect(line.qty).toBe(4);
    expect(line.total).toBe(120);
    expect(cost.lines.some((l) => l.key === 'electrical_socket_double')).toBe(false);
    // The electrician's work is per point whether the socket is bought or estimated.
    expect(cost.lines.find((l) => l.section === 'labour' && l.key === 'electric_point')!.qty).toBe(2);
  });

  it('counts every point, pipe and opening in a renovation whose works include them', () => {
    const cost = priceScene(plan(), scene('full', [socket('s1', 'generated'), light]), { homeState: 'white_frame', works: ['plumbing', 'electrical', 'doors', 'bathroom_tiling', 'heating'] });
    const sections = budgetSections(cost);
    expect(sections.electrical).toBeGreaterThan(0);
    expect(sections.lighting).toBeGreaterThan(0);
    expect(sections.heating).toBeGreaterThan(0);
    // One interior door (counted once, not per room) and one window by area.
    const doors = cost.lines.filter((l) => l.key === 'door');
    expect(doors).toHaveLength(1);
    const window = cost.lines.find((l) => l.key === 'window')!;
    expect(window.qty).toBeCloseTo(1.4 * 1.4, 2);
    expect(cost.openingsTotal).toBe(Math.round((doors[0].total + window.total) * 100) / 100);
    // Only the ticked works are in the materials and labour.
    expect(cost.lines.some((l) => l.section === 'labour' && l.key === 'bath_tiling')).toBe(true);
    expect(cost.lines.some((l) => l.section === 'labour' && l.key === 'paint_walls')).toBe(false);
    const summary = budgetSummary(cost);
    expect(summary.total).toBe(cost.grandTotal);
    expect(summary.products).toBe(0);
    expect(summary.labour + summary.materials).toBeCloseTo(summary.total, 6);
  });

  it('prices each point once: the phases count the points the plan holds, and the points add no labour of their own', () => {
    const cost = priceScene(plan(), scene('full', [socket('s1', 'generated'), light]), { homeState: 'white_frame', works: ['plumbing', 'electrical', 'doors', 'heating'] });
    const labour = cost.lines.filter((l) => l.section === 'labour');
    const keys = labour.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    const line = (key: string) => cost.lines.find((l) => l.key === key)!;
    // The double socket and the ceiling light: two of the electrician's points, and the white frame's plaster chased for each.
    expect(line('electric_point')).toMatchObject({ qty: 2, unitPrice: 35, total: 70 });
    expect(line('wall_chasing')).toMatchObject({ qty: 2, unitPrice: 5, total: 10 });
    // The sewer: one plumber's point, its pipes bought by the plumbing phase — not a second time as the point's own estimate.
    expect(line('plumbing_install')).toMatchObject({ qty: 1, unitPrice: 80 });
    expect(line('plumbing_pipes')).toMatchObject({ qty: 1, unitPrice: 32.5 });
    expect(cost.lines.some((l) => l.key === 'technical_sewer')).toBe(false);
    // The radiator: hung and piped once, 25 m of pipe; the radiator itself is still its own line.
    expect(line('radiator_mount')).toMatchObject({ qty: 1, unitPrice: 50 });
    expect(line('heating_piping')).toMatchObject({ qty: 1, unitPrice: 50 });
    expect(line('heating_pipe')).toMatchObject({ qty: 25, unitPrice: 3.6 });
    expect(line('technical_radiator').qty).toBe(1);
    // The one interior door, hung once.
    expect(line('door_install')).toMatchObject({ qty: 1, unitPrice: 150 });
  });

  it('prices a point on its own when its phase is not being done, at the team’s rates', () => {
    // A green frame that says it has no wiring: the socket the person added is new work, the electrical phase is not.
    const p = plan();
    const cost = priceScene({ ...p, technical: { ...p.technical!, existing: [] } }, scene('full', [socket('s1', 'user')]), { homeState: 'green_frame' });
    expect(cost.lines.find((l) => l.key === 'electric_point')).toMatchObject({ qty: 1, unitPrice: 35 });
    expect(cost.lines.some((l) => l.key === 'electric_cable')).toBe(false);
    // With the green frame's own defaults the flat is already wired, and the socket costs no labour.
    expect(priceScene(plan(), scene('full', [socket('s1', 'user')]), { homeState: 'green_frame' }).lines.some((l) => l.key === 'electric_point')).toBe(false);
    expect(cost.lines.some((l) => l.key === 'wall_chasing')).toBe(false);
  });

  it('leaves out the phase that would redo what the flat already has', () => {
    const p = plan();
    const had = priceScene({ ...p, technical: { ...p.technical!, existing: ['electrical', 'plumbing', 'heating', 'openings'] } }, scene('full', [socket('s1', 'generated')]), { homeState: 'black_frame' });
    const keys = had.lines.map((l) => l.key);
    for (const key of ['electric_point', 'electric_cable', 'plumbing_install', 'plumbing_pipes', 'heating_piping', 'radiator_mount', 'door_install']) expect(keys).not.toContain(key);
    expect(keys).toContain('plaster_walls');
  });

  it('measures the partitions off the plan’s walls', () => {
    const p = plan();
    const cost = priceScene({ ...p, walls: [
      { id: 'w1', a: P(0, 0), b: P(4, 0), thicknessM: 0.12, origin: 'existing' },
      { id: 'w2', a: P(4, -2), b: P(4, 2), thicknessM: 0.12, origin: 'user', heightM: 3 },
    ] }, scene('full', []), { homeState: 'black_frame', works: ['walls'] });
    // Neither wall bounds a room of this plan, so both stand free: 4 m × 2.7 m and 4 m × 3 m.
    expect(cost.lines.find((l) => l.key === 'wall_build')!.qty).toBeCloseTo(4 * 2.7 + 4 * 3, 2);
  });

  it('prices parquet and a stretch ceiling when the plan chose them', () => {
    const p = plan();
    const cost = priceScene({ ...p, technical: { ...p.technical!, choices: { floor: 'parquet', ceiling: 'barisol' } } }, scene('full', []), { homeState: 'green_frame' });
    const keys = cost.lines.map((l) => l.key);
    expect(keys).toContain('parquet_laying');
    expect(keys).toContain('ceiling_barisol');
    for (const key of ['laminate_laying', 'ceiling_gypsum', 'ceiling_finish', 'ceiling_board']) expect(keys).not.toContain(key);
  });

  it('leaves plumbing out when the plumbing works are not ticked', () => {
    const cost = priceScene(plan(), scene('full', [socket('s1', 'generated')]), { homeState: 'white_frame', works: ['electrical'] });
    const sections = budgetSections(cost);
    expect(sections.plumbing).toBe(0);
    expect(sections.heating).toBe(0);
    expect(sections.electrical).toBeGreaterThan(0);
  });

  it('names the trades the labour needs, biggest first', () => {
    const cost = priceScene(plan(), scene('full', [socket('s1', 'generated'), light]), { homeState: 'white_frame', works: ['plumbing', 'electrical', 'tiling', 'painting'] });
    const trades = tradesNeeded(cost);
    const slugs = trades.map((t) => t.slug);
    expect(slugs).toContain('electrical');
    expect(slugs).toContain('plumbing');
    expect(slugs).toContain('tiling');
    expect(slugs).toContain('painting');
    expect(slugs).not.toContain('carpentry');
    for (let i = 1; i < trades.length; i++) expect(trades[i - 1].total).toBeGreaterThanOrEqual(trades[i].total);
    expect(tradesNeeded({ lines: [] })).toEqual([]);
  });

  it('strips an old renovation out: the lines are in the budget and find their trades', () => {
    const STRIP_OUT = ['demolish_floor', 'demolish_walls', 'demolish_tiles', 'debris_old'];
    // Only the strip-out ticked, so every labour line in the budget is one of its own.
    const cost = priceScene(plan(), scene('full', []), { homeState: 'old_renovation', works: ['strip_out'] });
    const labour = cost.lines.filter((l) => l.section === 'labour').map((l) => l.key);
    expect(labour).toEqual(STRIP_OUT);
    expect(cost.lines.filter((l) => l.section === 'materials')).toEqual([]);

    const trades = tradesNeeded(cost);
    expect(trades.map((t) => t.slug)).toEqual(['plastering']);
    expect(trades[0].lines.map((l) => l.key)).toEqual(STRIP_OUT);

    // The home state alone pre-ticks it; a black frame never has it.
    const byState = (homeState: 'old_renovation' | 'black_frame') =>
      priceScene(plan(), scene('full', []), { homeState }).lines.filter((l) => l.section === 'labour').map((l) => l.key);
    expect(byState('old_renovation')).toEqual(expect.arrayContaining(STRIP_OUT));
    for (const key of STRIP_OUT) expect(byState('black_frame')).not.toContain(key);
  });
});
