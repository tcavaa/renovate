/**
 * What the home already has, and so must not be paid for again.
 *
 * A green frame is a flat that is finished: the floor is laid, the walls are painted, the
 * doors are hung and the sockets are in. Pricing it from the scene charged for all of it
 * anyway, because the scene describes the *whole* flat and has no way of knowing which
 * parts of it were already standing when the person arrived.
 *
 * So the technical step asks. Each tick is one thing the flat already has, and the budget
 * leaves it out — the lines, the baskets and the totals alike. A green frame starts with
 * everything ticked, because that is what a green frame means; every other condition starts
 * with nothing ticked and the phases decide as before. The list is stored on the plan
 * (`plan.technical.existing`) so it travels with the project and is saved with it.
 */

import type { HomeState } from '@/lib/calculator/types';
import type { FloorPlan, SurfaceFinish } from './types';

export const EXISTING_KEYS = ['floor', 'wall', 'ceiling', 'trim', 'openings', 'electrical', 'lighting', 'plumbing', 'heating', 'climate'] as const;
export type ExistingKey = (typeof EXISTING_KEYS)[number];

/** The finish surfaces each tick covers; the other keys cover budget sections instead. */
const SURFACES: Partial<Record<ExistingKey, Array<SurfaceFinish['surface']>>> = {
  floor: ['floor'],
  wall: ['wall'],
  ceiling: ['ceiling'],
  trim: ['skirting', 'cornice'],
};

/** What a flat in this condition already has, before the person says otherwise. */
export function defaultExistingForHomeState(homeState: HomeState | null | undefined): ExistingKey[] {
  return homeState === 'green_frame' ? [...EXISTING_KEYS] : [];
}

/** The ticks in force: the person's own list when they have made one, the default otherwise. */
export function effectiveExisting(plan: FloorPlan | null | undefined, homeState: HomeState | null | undefined): ExistingKey[] {
  const stored = plan?.technical?.existing;
  return stored ? (stored.filter((k) => (EXISTING_KEYS as readonly string[]).includes(k)) as ExistingKey[]) : defaultExistingForHomeState(homeState);
}

/** A reader over the ticks — the shape the pricing engine takes. */
export interface AlreadyHave {
  has: (key: ExistingKey) => boolean;
  /** True when a finish on this surface is already there and must not be charged for. */
  surface: (surface: SurfaceFinish['surface']) => boolean;
}

export function alreadyHave(keys: readonly string[] | null | undefined): AlreadyHave {
  const set = new Set(keys ?? []);
  return {
    has: (key) => set.has(key),
    surface: (surface) => EXISTING_KEYS.some((key) => set.has(key) && (SURFACES[key] ?? []).includes(surface)),
  };
}

/** Nothing is already there — the reader a design-only project and every unticked flat gets. */
export const HAVE_NOTHING: AlreadyHave = alreadyHave([]);
