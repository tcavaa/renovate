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
  'versionsSerial',
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
 * One string that changes whenever any saved field does. The design's kept versions count by
 * `versionsSerial`, which only a person's change to them bumps — their arrival from the server
 * (`loadDesignVersions`) is not an edit to write back; without a serial they count by id and
 * name (their content never changes under an id).
 */
export function autosaveSignature(fields: Record<string, unknown>): string {
  const { versions, ...rest } = fields;
  if ('versionsSerial' in fields) return JSON.stringify(rest);
  return JSON.stringify(Array.isArray(versions) ? { ...rest, versions: versions.map((v: { id?: unknown; name?: unknown }) => [v.id, v.name]) } : fields);
}
