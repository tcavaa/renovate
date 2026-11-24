import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { generateScene } from '@/lib/design/generateScene';
import { matchProducts } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { ESSENTIALS } from '@/lib/design/sceneAudit';
import { STYLE_IDS } from '@/lib/design/styles';
import { ensureWalls } from '@/lib/design/walls';
import { designSceneSchema, floorPlanSchema } from '@/lib/validations/design.schema';
import type { FloorPlan, Opening, PlanRoom, SlotKind, Vec2 } from '@/lib/design/types';
import { fixtureCatalog, fixtureProducts, fixtureProductsFor } from '../../helpers/generationFixtures';
import { sceneDefects } from '../../helpers/sceneChecks';

/**
 * Every room type the program knows, laid out and furnished from the real catalogue
 * (tests/fixtures/generation) on hand-built rooms — an L-shaped living room, rooms with windows,
 * the front door in a hall, doors on long walls and short ones — and held to what `generationInvariants.test.ts` holds whole flats
 * to: nothing in another piece, through a wall, in a door's way or a shower's tray, no joinery
 * built into one, nothing arranged off a piece that is not there, a flat the save route takes.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
type Hole = Omit<Opening, 'id' | 'roomId'>;
const door = (wallIndex: number, t = 0.5, widthM = 0.8, exterior = false): Hole => ({ kind: 'door', wallIndex, t, widthM, heightM: 2.05, sillM: 0, exterior });
const window = (wallIndex: number, t = 0.5, widthM = 1.2): Hole => ({ kind: 'window', wallIndex, t, widthM, heightM: 1.4, sillM: 0.9, exterior: true });
const rect = (w: number, d: number): Vec2[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];
function room(type: PlanRoom['type'], polygon: Vec2[], openings: Hole[]): PlanRoom {
  return refreshRoom({ id: 'r', type, name: type, polygon, heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `r-o${i}`, roomId: 'r' })) });
}
const planOf = (r: PlanRoom): FloorPlan => ensureWalls({ rooms: [r], metresPerPixel: null, bounds: { width: 8, depth: 8 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 });

interface Case {
  name: string;
  room: PlanRoom;
  /** Essentials (`ESSENTIALS`) the room may end without, and why. */
  mayLack?: SlotKind[];
  /** Defects (`issueMetric`) the whole flat may keep, and why — each in the roadmap. */
  allow?: string[];
}

/** A room of each type, of a size the program furnishes in full. Wall 0 runs along z = 0; a rectangle's walls go round 0–3. */
const CASES: Case[] = [
  { name: 'a bedroom with a window', room: room('bedroom', rect(4, 3.6), [door(2, 0.8), window(0)]) },
  { name: 'a living room with two windows', room: room('living_room', rect(5.4, 4.2), [door(2, 0.85), window(0, 0.3), window(0, 0.75)]) },
  // An L: 6 m along wall 0, 3 m deep there, 3.5 m wide and 5.5 m deep on its west side — a three-seat
  // by its proportions (arms 3 and 3.5 m wide), the dining table in the west arm. Its door is towards
  // the arm's corner: in the middle of the end wall the matcher's last pass stood a dining chair 1 cm
  // into the door's floor where no chair of the set kept clear of it (its last pass, `fitPasses`, keeps
  // the room's pieces without testing a door's way).
  // Laid out as two functions (decision 3.3, the dining zone at one end), its TV unit narrows to 1.2 m
  // while the screen the sofa's distance asks for stays 1.45 m, and a floor lamp product larger than its
  // slot grows beside the unit's end under the screen: the matcher does not test a floor piece against
  // the TV hung over it (roadmap: a floor lamp under a TV wider than its unit).
  { name: 'an L-shaped living room', room: room('living_room', [P(0, 0), P(6, 0), P(6, 3), P(3.5, 3), P(3.5, 5.5), P(0, 5.5)], [door(4, 0.3), window(0, 0.5, 1.5), window(5, 0.5)]), allow: ['hung_into_floor'] },
  { name: 'a kitchen with a window', room: room('kitchen', rect(3.6, 3), [door(2, 0.8), window(0)]) },
  { name: 'a bathroom', room: room('bathroom', rect(2.6, 2.4), [door(2, 0.75, 0.7)]) },
  // The window on the basin's likeliest wall: which of the mirror and the window gives way is the owner's.
  { name: 'a bathroom with a window', room: room('bathroom', rect(3.2, 2.2), [door(2, 0.8, 0.7), window(0, 0.5, 0.6)]), mayLack: ['mirror'] },
  { name: 'a toilet', room: room('toilet', rect(1.5, 1.9), [door(3, 0.75, 0.7)]) },
  { name: 'a hall with the front door', room: room('hallway', rect(4, 1.8), [door(3, 0.5, 0.9, true), door(1)]) },
  // A balcony of 2.2 m: its compact table and two chairs, and planters (Nini, decision 3.6).
  { name: 'a balcony', room: room('balcony', rect(5, 2.2), [door(0, 0.3), window(2, 0.5, 2)]) },
  { name: 'a storage room', room: room('storage', rect(1.8, 1.5), [door(2)]) },
  { name: 'a closet', room: room('closet', rect(2.2, 1.8), [door(2)]) },
  { name: 'an office with a window', room: room('office', rect(3.4, 3), [door(2, 0.8), window(0)]) },
  { name: 'a studio with two windows', room: room('studio', rect(7, 4.5), [door(2, 0.9), window(0, 0.25), window(0, 0.7)]) },
];

describe('every room type, generated from the real catalogue', () => {
  const catalog = fixtureCatalog();

  it('covers every room type the program knows', () => {
    const types = new Set(CASES.map((c) => c.room.type));
    expect([...types].sort()).toEqual(['balcony', 'bathroom', 'bedroom', 'closet', 'hallway', 'kitchen', 'living_room', 'office', 'storage', 'studio', 'toilet']);
  });

  for (const { name, room: r, mayLack = [], allow = [] } of CASES) {
    it(`furnishes ${name} whole, in every style: nothing in another piece, a wall, a door's way or a tray`, () => {
      const plan = planOf(r);
      for (const styleId of STYLE_IDS) {
        for (const seed of [1, 2]) {
          const at = `${styleId}, seed ${seed}`;
          const scene = generateScene({ plan, styleId, budgetGel: null, catalog, proposal: null, finishes: [], electrical: [], seed, at: '2026-11-18T00:00:00.000Z', aiCount: 0 });
          expect(sceneDefects(scene, allow), at).toEqual([]);
          const slots = new Set(scene.items.filter((i) => i.roomId === r.id).map((i) => i.slot));
          const built = scene.decor.some((d) => d.id === `decor-${r.id}-wardrobe-wall`);
          for (const group of ESSENTIALS[r.type] ?? []) {
            if (group.every((slot) => mayLack.includes(slot))) continue;
            expect(group.some((slot) => slots.has(slot)) || (group.includes('wardrobe') && built), `${group.join('/')} (${at})`).toBe(true);
          }
          // The save route takes it.
          expect(floorPlanSchema.safeParse(scene.plan).success, at).toBe(true);
          const saved = designSceneSchema.safeParse({ styleId, mode: 'full', budgetGel: null, items: scene.items, finishes: scene.finishes, decor: scene.decor, electrical: scene.electrical, generation: scene.generation });
          expect(saved.success ? [] : saved.error.issues.map((i) => i.path.join('.')), at).toEqual([]);
        }
      }
    });
  }

  for (const { name, room: r } of CASES) {
    it(`lays out and matches ${name} with the style's real products clear of each other, the walls and the door's way`, () => {
      for (const styleId of STYLE_IDS) {
        const matched = matchProducts(layoutRoom(r, { styleId }), fixtureProductsFor(r.type, styleId), { styleId, rooms: [r] }).filter((i) => i.product);
        expect(matched.length, styleId).toBeGreaterThan(0);
        // A countertop basin is lifted to washing height here and stands on the vanity the bathroom
        // pass builds after the matcher (the whole-flat test above holds it to standing on something).
        // A studio's compact two-seat table (its kitchen half's table at any size — decision 3.4) may find
        // no product of the style's 70 cm in this pool; generation then takes its chairs too (`withoutOrphans`).
        expect(sceneDefects({ plan: [r], items: matched }, ['basin_in_air', 'orphan:dining_chair:no_dining_table']), styleId).toEqual([]);
      }
    });
  }
});

describe('real products by kind (tests/helpers/generationFixtures)', () => {
  it('gives the style\'s own where it has some, every one of the kind where it has none, at the catalogue\'s sizes', () => {
    const all = fixtureProducts('sofa_3seat');
    expect(all.length).toBeGreaterThan(5);
    expect(all.every((p) => p.model3dKind === 'sofa_3seat' && !!p.model3dUrl)).toBe(true);
    const own = fixtureProducts('sofa_3seat', 'scandinavian');
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((p) => Array.isArray(p.styleTags) && p.styleTags.includes('scandinavian'))).toBe(true);
    // Sizes spread as the catalogue's do, not one slot's.
    expect(new Set(all.map((p) => p.widthCm)).size).toBeGreaterThan(3);
  });
});
