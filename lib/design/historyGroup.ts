/**
 * One undo step per slider drag (docs/design-studio/overview.md#generation-versions-and-undo).
 *
 * A range input fires on every tick of a drag, and every tick reached the design store as its
 * own `commit` — a sweep of the rotation slider pushed ~360 snapshots, and with the history at 80
 * deep it pushed out every undo step before it. While a range input is held down, the store's
 * commits share one group: the first records the present, the rest only apply. Arrow keys on a
 * focused slider stay a step each. The listener is on the document, so every slider in the
 * studio, the inspectors and the board takes part without wiring each one.
 */

let held = false;
let generation = 0;

/** The group the next commit belongs to, or null when no slider is held. */
export function historyGroup(): number | null {
  return held ? generation : null;
}

/** For tests and for gestures that are not range inputs: hold the history to one step until released. */
export function holdHistory(): void {
  held = true;
  generation += 1;
}

export function releaseHistory(): void {
  held = false;
}

if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') holdHistory();
    },
    { capture: true, passive: true },
  );
  for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, releaseHistory, { capture: true, passive: true });
}
