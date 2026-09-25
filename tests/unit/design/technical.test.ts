import { describe, expect, it } from 'vitest';
import { AC_CEILING_GAP_M, AC_MIN_ELEVATION_M, AC_UNIT_HEIGHT_M, anchorsFor, defaultWorksForHomeState, effectivePhases, normalizeWorks, phasesForWorks, technicalAnchors, technicalElevation, technicalSuggestions, TECHNICAL_KINDS, WORK_ITEMS, WORK_STAGES, worksForStage } from '@/lib/design/technical';
import { DEFAULT_WALL_HEIGHT_M } from '@/lib/design/walls';
import { HOME_STATES } from '@/lib/calculator/constants';
import { HOME_STATE_VALUES } from '@/lib/calculator/types';
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
    expect(white).toContain('bathroom_tiling');
    expect(white).not.toContain('walls');
    expect(white).not.toContain('plastering');
    expect(phasesForWorks(['plumbing', 'bathroom_tiling'])).toEqual([7, 9]);
    expect(effectivePhases('green_frame')).toEqual([6, 9, 10, 11, 12, 14]);
    expect(effectivePhases('green_frame', ['screed', 'painting'])).toEqual([3, 6]);
    expect(new Set(WORK_ITEMS.map((w) => w.key)).size).toBe(WORK_ITEMS.length);
    for (const state of HOME_STATE_VALUES) expect(phasesForWorks(defaultWorksForHomeState(state))).toEqual(HOME_STATES[state].includedPhases);
  });

  it('reads a list saved under the old works in today’s keys', () => {
    expect(normalizeWorks(['tiling', 'doors_windows', 'electrical_finish', 'electrical', 'insulation', 'furniture'])).toEqual(['electrical', 'bathroom_tiling', 'kitchen_tiling', 'doors']);
    // A list that names nothing that still exists is the home state's.
    expect(effectivePhases('green_frame', ['furniture'])).toEqual(HOME_STATES.green_frame.includedPhases);
  });

  it('starts an old renovation with the strip-out, and no other home state with it', () => {
    const old = defaultWorksForHomeState('old_renovation');
    expect(old[0]).toBe('strip_out');
    // Everything a black frame needs comes after it, but building the walls and the new build's rubbish.
    expect(old.slice(1)).toEqual(defaultWorksForHomeState('black_frame').filter((w) => w !== 'walls' && w !== 'debris'));
    for (const state of ['black_frame', 'white_frame', 'green_frame'] as const) {
      expect(defaultWorksForHomeState(state)).not.toContain('strip_out');
    }
    expect(phasesForWorks(['strip_out'])).toEqual([0]);
    expect(effectivePhases('old_renovation')[0]).toBe(0);
    // Unticking the strip-out on the checklist takes phase 0 out of the estimate.
    expect(effectivePhases('old_renovation', ['walls', 'painting'])).toEqual([1, 6]);
    expect(effectivePhases('white_frame', ['strip_out', 'painting'])).toEqual([0, 6]);
  });

  it('offers the strip-out as the first stage of the checklist, and every work in exactly one stage', () => {
    expect(WORK_STAGES.map((s) => s.homeState)).toEqual(['old_renovation', 'black_frame', 'white_frame', 'green_frame']);
    expect(worksForStage(WORK_STAGES[0]).map((w) => w.key)).toEqual(['strip_out']);
    const staged = WORK_STAGES.flatMap((s) => worksForStage(s).map((w) => w.key));
    expect([...staged].sort()).toEqual(WORK_ITEMS.map((w) => w.key).sort());
    expect(new Set(staged).size).toBe(staged.length);
    // Each stage is what one home state needs and the next one does not.
    const needs = (state: (typeof HOME_STATE_VALUES)[number]) => new Set(defaultWorksForHomeState(state));
    expect(worksForStage(WORK_STAGES[3]).map((w) => w.key)).toEqual([...needs('green_frame')]);
    expect(worksForStage(WORK_STAGES[2]).map((w) => w.key)).toEqual([...needs('white_frame')].filter((w) => !needs('green_frame').has(w)));
    expect(worksForStage(WORK_STAGES[1]).map((w) => w.key)).toEqual([...needs('black_frame')].filter((w) => !needs('white_frame').has(w)));
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

describe('how high a technical point sits', () => {
  it('leaves every kind but the air conditioner at its one usual height', () => {
    const low = { heightM: 2.4 };
    const tall = { heightM: 3.4 };
    for (const kind of ['water_supply', 'sewer', 'electrical_panel', 'radiator', 'extractor', 'boiler'] as const) {
      expect(technicalElevation(kind, low)).toBe(TECHNICAL_KINDS[kind].defaultElevationM);
      expect(technicalElevation(kind, tall)).toBe(TECHNICAL_KINDS[kind].defaultElevationM);
    }
  });

  it('hangs an air conditioner the same hand’s width under the ceiling whatever the room’s height', () => {
    for (const heightM of [2.5, 2.8, 3.2, 3.6]) {
      const bottom = technicalElevation('ac_unit', { heightM });
      // The gap the fitter leaves is above the unit, so it is measured from its top.
      expect(heightM - (bottom + AC_UNIT_HEIGHT_M)).toBeCloseTo(AC_CEILING_GAP_M, 5);
    }
  });

  it('does not bring the unit down to head height in a room with a low ceiling', () => {
    expect(technicalElevation('ac_unit', { heightM: 2.0 })).toBe(AC_MIN_ELEVATION_M);
  });

  it('falls back to the standard wall height when the point belongs to no room', () => {
    expect(technicalElevation('ac_unit', null)).toBe(technicalElevation('ac_unit', { heightM: DEFAULT_WALL_HEIGHT_M }));
  });
});
