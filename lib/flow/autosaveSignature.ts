/**
 * What the autosave watches (docs/project-flow.md#autosave-hooksuseautosavets): the store fields
 * each half's save sends, by name, and the signature made of them. The save helpers
 * (`lib/calculator/saveProject.ts`, `lib/design/saveDesign.ts`) and these lists must agree —
 * a field the save sends and the signature leaves out is changed, sent with the next save of
 * something else, and lost if no other change follows (the calculator's board sockets were).
 * `tests/unit/flow/autosaveSignature.test.ts` reads what the saves actually send and fails on a
 * field missing here.
 */

/** The calculator store's fields its save sends (the home state, rooms, picks, edits, the journey). */
export const CALCULATOR_SAVED = ['homeState', 'rooms', 'selectedProducts', 'selectedFurniture', 'excluded', 'quantities', 'choices', 'step', 'calculated', 'at'] as const;

/** The calculator's drawing board fields its save sends. */
export const BOARD_SAVED = ['plan', 'floorPlanUrl', 'electrical'] as const;

/** The design store's fields its save sends: the plan, the scene (`scene()`), the versions. */
export const DESIGN_SAVED = [
  'homeState',
  'plan',
  'floorPlanUrl',
  'versions',
  'styleId',
  'mode',
  'budgetGel',
  'items',
  'finishes',
  'electrical',
  'styleProfile',
  'excluded',
  'quantities',
  'step',
  'generated',
  'planFromCalculator',
  'at',
  'modeChosen',
  'emptyStart',
] as const;

/** The named fields of a store's state, for `useShallow`. */
export function pickFields<S extends object, K extends keyof S>(state: S, keys: readonly K[]): Pick<S, K> {
  const out = {} as Pick<S, K>;
  for (const key of keys) out[key] = state[key];
  return out;
}

/**
 * One string that changes whenever any saved field does. Kept versions count by id and name —
 * their content never changes under an id, and writing them all out on every edit would cost
 * as much as the save.
 */
export function autosaveSignature(fields: Record<string, unknown>): string {
  const versions = fields.versions;
  const light = Array.isArray(versions) ? { ...fields, versions: versions.map((v: { id?: unknown; name?: unknown }) => [v.id, v.name]) } : fields;
  return JSON.stringify(light);
}
