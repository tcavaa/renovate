'use client';

/**
 * Which copy of the calculator's and the studio's work the pages are looking at.
 *
 * There are two, each in its own localStorage keys:
 *
 *  - **fresh** — the person's own journey, what the header's "calculator" and "design" open:
 *    their one draft of each, or nothing. A save or an order closes it (`closedProjectId`),
 *    and the next time it is entered from outside the steps it starts again.
 *  - **project** — a saved or ordered project opened from "my projects". Opening another one
 *    replaces it; it is always loaded from the server, and leaving it for the header's
 *    calculator never shows it there.
 *
 * A draft opened from "my projects" goes into the fresh copy: it *is* the person's draft.
 *
 * The switch is kept per tab (sessionStorage), so a reload inside an opened project stays in
 * it and a new tab starts fresh. Every store hook the pages use (`useCalculatorStore`,
 * `useDesignStore`, `useCalculatorPlanStore`) is a `workspaceStore`: it reads and writes the
 * copy the switch points at, and re-renders when the switch moves.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type WorkspaceKind = 'fresh' | 'project';

/** What the bar over an opened project says about it. */
export interface OpenedProject {
  id: number;
  name: string;
  status: 'draft' | 'saved' | 'submitted';
}

interface WorkspaceState {
  kind: WorkspaceKind;
  project: OpenedProject | null;
  enterFresh: () => void;
  enterProject: (project: OpenedProject) => void;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      kind: 'fresh',
      project: null,
      enterFresh: () => set({ kind: 'fresh', project: null }),
      enterProject: (project) => set({ kind: 'project', project }),
    }),
    {
      name: 'renovate-workspace',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ kind: s.kind, project: s.project }),
    }
  )
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = UseBoundStore<StoreApi<any>>;

/**
 * One hook over the two copies of a store. Called as a hook it subscribes to the switch and
 * then to the copy it points at (the same two hooks in the same order whichever copy that is),
 * so a component re-renders when either changes; `getState` / `setState` / `subscribe` reach
 * the copy in force at the moment they are called. `fresh` and `project` are the copies
 * themselves, for what has to address one of them by name.
 */
export function workspaceStore<S extends AnyStore>(fresh: S, project: S): S & { fresh: S; project: S } {
  const active = (): S => (useWorkspace.getState().kind === 'project' ? project : fresh);
  const hook = ((selector?: (state: unknown) => unknown) => {
    const kind = useWorkspace((w) => w.kind);
    const store = kind === 'project' ? project : fresh;
    return selector ? store(selector) : store();
  }) as unknown as S;
  return Object.assign(hook, {
    getState: () => active().getState(),
    getInitialState: () => active().getInitialState(),
    setState: ((...args: Parameters<S['setState']>) => (active().setState as (...a: unknown[]) => void)(...args)) as S['setState'],
    subscribe: ((listener: Parameters<S['subscribe']>[0]) => active().subscribe(listener)) as S['subscribe'],
    fresh,
    project,
  });
}
