import { describe, expect, it } from 'vitest';
import { anchorsFor, defaultWorksForHomeState, effectivePhases, phasesForWorks, technicalAnchors, technicalSuggestions, WORK_ITEMS, WORK_STAGES, worksForStage } from '@/lib/design/technical';
import { addOpening } from '@/lib/design/openings';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { FloorPlan, PlacedItem, PlanRoom, TechnicalPoint, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type']): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)], heightM: 2.6, areaM2: 0, perimeterM: 0, openings: [] });

const item = (id: string, roomId: string, slot: PlacedItem['slot'], x: number, z: number): PlacedItem => ({
  id,
  roomId,
  slot,
  kind: slot,
  position: P(x, z),
  elevationM: 0,
  rotation: 0,
  size: { width: 0.6, depth: 0.6, height: 0.8 },
  product: null,
});

const point = (id: string, kind: TechnicalPoint['kind'], x: number, z: number, roomId: string | null = null): TechnicalPoint => ({ id, kind, roomId, position: P(x, z), origin: 'existing' });

describe('works and phases', () => {
  it('pre-ticks the works a home state implies and maps them back to phases', () => {
    const white = defaultWorksForHomeState('white_frame');
    expect(white).toContain('tiling');
    expect(white).not.toContain('demolition');
    expect(phasesForWorks(['plumbing', 'tiling'])).toEqual([2, 9]);
    expect(effectivePhases('green_frame')).toEqual([17]);
    expect(effectivePhases('green_frame', ['screed', 'painting'])).toEqual([6, 13]);
    expect(new Set(WORK_ITEMS.map((w) => w.key)).size).toBe(WORK_ITEMS.length);
  });

  it('starts an old renovation with the strip-out, and no other home state with it', () => {
    const old = defaultWorksForHomeState('old_renovation');
    expect(old[0]).toBe('strip_out');
    // Everything a black frame needs comes after it.
    expect(old.slice(1)).toEqual(defaultWorksForHomeState('black_frame'));
    for (const state of ['black_frame', 'white_frame', 'green_frame'] as const) {
      expect(defaultWorksForHomeState(state)).not.toContain('strip_out');
    }
    expect(phasesForWorks(['strip_out'])).toEqual([0]);
    expect(effectivePhases('old_renovation')[0]).toBe(0);
    // Unticking the strip-out on the checklist takes phase 0 out of the estimate.
    expect(effectivePhases('old_renovation', ['demolition', 'painting'])).toEqual([1, 13]);
    expect(effectivePhases('white_frame', ['strip_out', 'painting'])).toEqual([0, 13]);
  });

  it('offers the strip-out as the first stage of the checklist, and every work in exactly one stage', () => {
    expect(WORK_STAGES.map((s) => s.homeState)).toEqual(['old_renovation', 'black_frame', 'white_frame', 'green_frame']);
    expect(worksForStage(WORK_STAGES[0]).map((w) => w.key)).toEqual(['strip_out']);
    const staged = WORK_STAGES.flatMap((s) => worksForStage(s).map((w) => w.key));
    expect(staged).toEqual(WORK_ITEMS.map((w) => w.key));
  });
});

describe('anchors and suggestions', () => {
  const bath = rect('bath', 0, 0, 2.5, 2, 'bathroom');
  const plan: FloorPlan = {
    rooms: [bath, rect('hall', 2.62, 0, 3, 2, 'hallway')],
    metresPerPixel: null,
    bounds: { width: 5.6, depth: 2 },
    source: 'manual',
    wallThicknessM: 0.12,
    technical: { points: [point('s', 'sewer', 0.3, 0.3), point('w', 'water_supply', 0.5, 0.05), point('r', 'radiator', 1, 0.05, 'bath')] },
  };

  it('attributes points to the room they are in and lists what each archetype wants', () => {
    const anchors = technicalAnchors(plan);
    expect(anchors.bath).toHaveLength(3);
    expect(anchors.hall).toBeUndefined();
    expect(anchorsFor('toilet', anchors.bath).map((a) => a.kind)).toEqual(['sewer']);
    expect(anchorsFor('sink', anchors.bath).map((a) => a.kind).sort()).toEqual(['sewer', 'water_supply']);
    expect(anchorsFor('bed_double', anchors.bath)).toEqual([]);
  });

  it('flags a toilet far from the sewer, a radiator on an interior wall and a bathroom without an extractor', () => {
    const suggestions = technicalSuggestions(plan, [item('t', 'bath', 'toilet', 2.2, 1.7), item('k', 'bath', 'sink', 0.6, 0.4)]);
    const codes = suggestions.map((s) => s.code);
    expect(codes).toContain('far_from_sewer');
    expect(codes).toContain('no_extractor');
    expect(codes).not.toContain('far_from_water');
    // The radiator sits on the top wall, which has no exterior window: not an exterior wall.
    expect(codes).toContain('radiator_not_exterior');
  });

  it('is quiet when the fixtures are where the pipes are and the wall has a window', () => {
    const withWindow = addOpening(plan.rooms, 'bath', 'window', 0, 0.12).rooms;
    const quiet: FloorPlan = { ...plan, rooms: withWindow, technical: { points: [...plan.technical!.points, point('x', 'extractor', 1.2, 1.95, 'bath')] } };
    const suggestions = technicalSuggestions(quiet, [item('t', 'bath', 'toilet', 0.6, 0.5)]);
    expect(suggestions.map((s) => s.code)).toEqual([]);
  });
});
