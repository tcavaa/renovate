'use client';

/**
 * The rules around the two workspaces (`store/workspace`), in one place:
 *
 *  - **Entering fresh.** Anything that brings the person into the calculator or the studio
 *    from outside their steps — the header, the landing page, a link on the profile — enters
 *    the fresh workspace (`enterFreshWorkspace`). A journey that was saved or ordered since
 *    (`closedProjectId`) is emptied on the way in, so it starts again; the other journey goes
 *    with it when it held the same project.
 *  - **Closing.** An explicit save and an order (which saves first) close the journey they
 *    were made from (`closeAfterSave`), and the other one too when it holds the same project.
 *  - **One draft of each.** When the fresh calculator or the fresh studio lets go of a draft —
 *    started over, a new flat, another draft opened in its place — the server deletes that
 *    draft, unless the other journey is still working on the same row (`watchFreshDrafts`).
 *    The server only ever deletes a *draft*: a saved or ordered project is never touched.
 *  - **Opening from "my projects".** A draft opens in the fresh workspace (it is the person's
 *    draft), after asking when a different draft is in progress there; a saved or ordered
 *    project opens in the project workspace, which is emptied first when it held another one.
 */

import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';
import { useWorkspace, type OpenedProject } from '@/store/workspace';

export type Journey = 'calculator' | 'design';

const calc = () => useCalculatorStore.fresh.getState();
const design = () => useDesignStore.fresh.getState();

function emptyFreshCalculator(): void {
  useCalculatorStore.fresh.getState().reset();
  useCalculatorPlanStore.fresh.getState().reset();
}

function emptyFreshDesign(): void {
  useDesignStore.fresh.getState().reset();
}

let enteredAt = 0;

/**
 * Was the journey just entered from outside its steps (the header, a link elsewhere)? Then its
 * first step hands on to where the person was — the calculator's plan step included, which the
 * first step otherwise leaves open to go back to. Asked once: the answer is used up.
 */
export function takeFreshEntry(): boolean {
  const recent = Date.now() - enteredAt < 4000;
  enteredAt = 0;
  return recent;
}

/** Into the person's own journeys, emptying the ones that were saved or ordered since. */
export function enterFreshWorkspace(): void {
  enteredAt = Date.now();
  useWorkspace.getState().enterFresh();
  const c = calc();
  const d = design();
  const calcClosed = c.closedProjectId != null && c.closedProjectId === c.projectId;
  const designClosed = d.closedProjectId != null && d.closedProjectId === d.projectId;
  if (calcClosed) emptyFreshCalculator();
  if (designClosed) emptyFreshDesign();
  // A drawing board with no calculation behind it is left over from one that was emptied
  // without it: the calculator reads its rooms off the board, so it brought the saved flat
  // straight back — rooms, but no home state and no project. A journey really under way has
  // its home state from the first step, before the board is ever shown.
  const after = calc();
  if (after.projectId == null && !after.homeState) emptyFreshCalculator();
  void dropFinishedProjects();
}

/**
 * The same, for work kept from before the rule existed or closed in another tab: a fresh
 * journey pointing at a project that is no longer a draft (saved, ordered, or deleted) is
 * emptied. Asks the server, so it can only run for a signed-in person; anything else is kept.
 */
async function dropFinishedProjects(): Promise<void> {
  const check = async (id: number | null, stillHolds: () => boolean, empty: () => void) => {
    if (id == null) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) return;
      const json = (await res.json().catch(() => null)) as { data: { status?: string } | null } | null;
      const finished = res.status === 404 || (res.ok && json?.data?.status != null && json.data.status !== 'draft');
      if (finished && stillHolds()) empty();
    } catch {
      // Offline: keep the work.
    }
  };
  const calcId = calc().projectId;
  const designId = design().projectId;
  await Promise.all([
    check(calcId, () => calc().projectId === calcId, emptyFreshCalculator),
    check(designId, () => design().projectId === designId, emptyFreshDesign),
  ]);
}

/**
 * After an explicit save or an order of `projectId` from `journey`: close it, and the other
 * journey too when it holds the same project. Only the fresh workspace closes — an opened
 * project is emptied the next time another one is opened anyway.
 */
export function closeAfterSave(journey: Journey, projectId: number): void {
  if (useWorkspace.getState().kind !== 'fresh') return;
  if (journey === 'calculator' || calc().projectId === projectId) calc().markClosed(projectId);
  if (journey === 'design' || design().projectId === projectId) design().markClosed(projectId);
}

/** Asks the server to delete a project if, and only if, it is still a draft. */
function discardDraft(projectId: number): void {
  void fetch(`/api/projects/${projectId}?onlyDraft=1`, { method: 'DELETE' }).catch(() => undefined);
}

let watching = false;

/**
 * One draft of each: when a fresh journey lets go of the project it was writing into, that
 * project is deleted if it is still a draft — unless the other fresh journey is working on
 * the same row (a calculation carried into 3D and then started over in the calculator keeps
 * the row for the design). Installed once, by the provider in the root layout.
 */
export function watchFreshDrafts(): () => void {
  if (watching) return () => undefined;
  watching = true;
  let calcId = calc().projectId;
  let designId = design().projectId;
  const offCalc = useCalculatorStore.fresh.subscribe((s) => {
    if (calcId != null && s.projectId !== calcId && design().projectId !== calcId) discardDraft(calcId);
    calcId = s.projectId;
  });
  const offDesign = useDesignStore.fresh.subscribe((s) => {
    if (designId != null && s.projectId !== designId && calc().projectId !== designId) discardDraft(designId);
    designId = s.projectId;
  });
  return () => {
    offCalc();
    offDesign();
    watching = false;
  };
}

/**
 * Would opening this draft into the fresh `journey` replace other work there? True when the
 * journey holds work that is not this project and has not been saved or ordered.
 */
export function freshDraftInTheWay(journey: Journey, projectId: number): boolean {
  if (journey === 'calculator') {
    const c = calc();
    const board = useCalculatorPlanStore.fresh.getState();
    const hasWork = c.rooms.length > 0 || (board.plan?.rooms.length ?? 0) > 0 || Object.keys(c.selectedProducts).length > 0;
    return hasWork && c.projectId !== projectId && !(c.closedProjectId != null && c.closedProjectId === c.projectId);
  }
  const d = design();
  const hasWork = (d.plan?.rooms.length ?? 0) > 0 || d.items.length > 0;
  return hasWork && d.projectId !== projectId && !(d.closedProjectId != null && d.closedProjectId === d.projectId);
}

/** Does the fresh `journey` already hold this very project? Then it is simply resumed, not reloaded. */
export function freshHolds(journey: Journey, projectId: number): boolean {
  return (journey === 'calculator' ? calc().projectId : design().projectId) === projectId;
}

/** Into the project workspace for this saved or ordered project, emptied first when it held another. */
export function enterProjectWorkspace(project: OpenedProject): void {
  const ws = useWorkspace.getState();
  if (ws.kind !== 'project' || ws.project?.id !== project.id) {
    useCalculatorStore.project.getState().reset();
    useCalculatorPlanStore.project.getState().reset();
    useDesignStore.project.getState().reset();
  }
  ws.enterProject(project);
}

/** Paths that are the calculator's or the studio's own steps. */
export function isJourneyPath(pathname: string): boolean {
  return /^\/(calculator|design)(\/|$)/.test(pathname);
}
