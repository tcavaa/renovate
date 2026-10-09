'use client';

/**
 * Writes a project's 3D design to its row — the one place the design save is assembled, so the
 * summary's button, the autosave, a photo request and the brigade booking all send the same
 * thing into the same project. The row exists before the first step; the calculation, when the
 * project has one, is saved by the calculator into the same row.
 *
 * Saves of a half go out one at a time (`enqueueSave`), each naming the revision its copy was
 * made from (`baseRev`, kept with the content); the server refuses one made from an older
 * revision with `ProjectChangedError`, unless `force` says the person chose to keep this copy.
 * Each save also carries an id, and names the previous one if its answer never came back.
 */

import { useDesignStore } from '@/store/designStore';
import { activeProjectId } from '@/store/projectScope';
import { markClean } from '@/lib/flow/projectSync';
import { enqueueSave, newSaveId, ProjectChangedError, useSaveProblems } from '@/lib/flow/saveQueue';
import type { SavedRow } from '@/lib/calculator/saveProject';
import type { DesignVersion } from '@/lib/design/types';

/**
 * The kept versions each store last had confirmed by the server. They run to megabytes (0.7 MB at
 * ten items and twelve versions, 6.4 MB at 600) and change only when one is kept, restored,
 * renamed or deleted, so a save carries them only once they have arrived (`versionsLoaded` —
 * the empty placeholder is never sent over the saved ones) and when they differ from the last
 * confirmed; the route keeps the row's when a save names none.
 */
const versionsConfirmed = new WeakMap<object, unknown>();

/**
 * Fetches a project's kept versions into its design store (`GET /api/projects/[id]/versions`),
 * once: the step page's payload and the browser's copy leave them out. What arrives is what the
 * server has, so the next save does not send it back.
 */
export function loadDesignVersions(projectId: number): Promise<void> {
  const store = useDesignStore.for(projectId);
  if (store.getState().versionsLoaded) return Promise.resolve();
  // One request for every caller while it is on its way (React runs a mounting effect twice in development).
  const waiting = versionsInFlight.get(projectId);
  if (waiting) return waiting;
  const request = (async () => {
    const res = await fetch(`/api/projects/${projectId}/versions`, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as { data: { versions: DesignVersion[] } | null } | null;
    if (!res.ok || !json?.data) throw new Error('versions-unavailable');
    store.getState().receiveVersions(projectId, json.data.versions);
    if (store.getState().versionsLoaded) versionsConfirmed.set(store, store.getState().versions);
  })().finally(() => versionsInFlight.delete(projectId));
  versionsInFlight.set(projectId, request);
  return request;
}

const versionsInFlight = new Map<number, Promise<void>>();

export function saveDesign(options: { draft: boolean; projectId?: number; force?: boolean }): Promise<SavedRow> {
  const id = options.projectId ?? activeProjectId();
  if (id == null) return Promise.reject(new Error('no-project'));
  // Taken now: a store let go of in the meantime (a pruned cache) still holds what is to be written.
  const store = useDesignStore.for(id);
  return enqueueSave('design', id, async () => {
    const prevSaveId = store.getState().pendingSaveId;
    const saveId = newSaveId();
    store.setState({ pendingSaveId: saveId });
    const s = store.getState();
    if (s.projectId !== id) throw new Error('no-project');
    if (!s.plan) throw new Error('no-plan');
    const res = await fetch('/api/design/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: id,
        baseRev: s.baseRev ?? 0,
        saveId,
        prevSaveId,
        force: options.force === true,
        // Only what the studio itself chose: the calculation owns the home state when the
        // project has one, and a design-only project has none.
        homeState: s.homeState,
        plan: s.plan,
        scene: s.scene(),
        floorPlanUrl: s.floorPlanUrl,
        draft: options.draft,
        ...(!s.versionsLoaded || versionsConfirmed.get(store) === s.versions ? {} : { versions: s.versions }),
      }),
    });
    const json = (await res.json().catch(() => null)) as { data: { id: number; rev: number } | null; error: string | null } | null;
    if (res.status === 409 && json?.error === 'PROJECT_CHANGED') throw new ProjectChangedError();
    if (!res.ok || !json || json.error || !json.data) throw new Error(json?.error ?? 'save-failed');
    // Nothing touched the design while this was being written: the server has all of it.
    const unchanged = store.getState() === s;
    if (s.versionsLoaded) versionsConfirmed.set(store, s.versions);
    store.setState({ baseRev: json.data.rev, pendingSaveId: null });
    useSaveProblems.getState().report('design', id, null);
    if (unchanged) markClean('design', id);
    return { id: json.data.id, rev: json.data.rev };
  });
}
