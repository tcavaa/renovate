'use client';

/**
 * Writes a project's calculation to its row — shared by the summary's button, the checkout and
 * the autosave, so all of them send the same payload into the same project. The row exists
 * before the first step (`POST /api/projects/create`); a save never makes one.
 *
 * Saves of a half go out one at a time (`enqueueSave`), each naming the revision its copy was
 * made from (`baseRev`, kept with the content); the server refuses one made from an older
 * revision — the calculation was saved in another tab or on another computer since — with
 * `ProjectChangedError`, unless `force` says the person chose to keep this copy. Each save also
 * carries an id, and names the previous one if its answer never came back: a write that landed
 * unconfirmed is then not mistaken for somebody else's.
 */

import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { boardFinishesFromPicks } from '@/lib/calculator/roomFinishes';
import { CALCULATOR_STEPS } from '@/lib/calculator/steps';
import { activeProjectId } from '@/store/projectScope';
import { markClean } from '@/lib/flow/projectSync';
import { enqueueSave, newSaveId, ProjectChangedError, useSaveProblems } from '@/lib/flow/saveQueue';

export interface SavedRow {
  id: number;
  /** The half's revision on the server after the write. */
  rev: number;
}

export function saveCalculatorProject(options: { draft: boolean; projectId?: number; force?: boolean }): Promise<SavedRow> {
  const id = options.projectId ?? activeProjectId();
  if (id == null) return Promise.reject(new Error('no-project'));
  // Taken now: a store let go of in the meantime (a pruned cache) still holds what is to be written.
  const calcStore = useCalculatorStore.for(id);
  const boardStore = useCalculatorPlanStore.for(id);
  return enqueueSave('calculator', id, async () => {
    // Read when the write goes out, not when it was asked for: the one before may have changed both.
    const prevSaveId = calcStore.getState().pendingSaveId;
    const saveId = newSaveId();
    calcStore.setState({ pendingSaveId: saveId });
    const s = calcStore.getState();
    const board = boardStore.getState();
    if (s.projectId !== id) throw new Error('no-project');
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: id,
        baseRev: s.baseRev ?? 0,
        saveId,
        prevSaveId,
        force: options.force === true,
        homeState: s.homeState,
        rooms: s.rooms,
        selectedProducts: s.selectedProducts,
        selectedFurniture: s.selectedFurniture,
        // What was ticked off the summary and the quantities changed on it, and where the
        // journey is. The estimate is worked out again on the server; these are laid over it.
        edits: { excluded: s.excluded, quantities: s.quantities, choices: s.choices, progress: { step: s.step, calculated: s.calculated, at: s.at, steps: CALCULATOR_STEPS } },
        // The drawing board — walls, doors, windows — so the project reopens as drawn, on any
        // computer; and each room in the floor and walls chosen for it, as the PDF draws it.
        board: { plan: board.plan, floorPlanUrl: board.floorPlanUrl, finishes: boardFinishesFromPicks(board.plan, s.selectedProducts) },
        draft: options.draft,
      }),
    });
    const json = (await res.json().catch(() => null)) as { data: { id: number; rev: number } | null; error: string | null } | null;
    if (res.status === 409 && json?.error === 'PROJECT_CHANGED') throw new ProjectChangedError();
    if (!res.ok || !json || json.error || !json.data) throw new Error(json?.error ?? 'save-failed');
    // Nothing touched the calculation while this was being written: the server has all of it.
    const unchanged = calcStore.getState() === s && boardStore.getState() === board;
    calcStore.setState({ baseRev: json.data.rev, pendingSaveId: null });
    useSaveProblems.getState().report('calculator', id, null);
    if (unchanged) markClean('calculator', id);
    return { id: json.data.id, rev: json.data.rev };
  });
}
