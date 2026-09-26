'use client';

import { create } from 'zustand';
import type { ProjectHalf } from '@/lib/flow/projectSync';

/**
 * One write at a time per half of a project. The autosave, the summary's "save", the checkout,
 * a photo and a booking all save the same half; each save names the revision it was made from
 * (`lib/flow/projectSync`), so two in flight at once would have the second refused as out of
 * date by the first. They go out one after another instead, each reading the revision the one
 * before it left.
 */
const chains = new Map<string, Promise<unknown>>();

export function enqueueSave<T>(half: ProjectHalf, id: number, run: () => Promise<T>): Promise<T> {
  const key = `${half}:${id}`;
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  chains.set(key, next);
  return next;
}

/** An id for one save (`projects.calculator_save_id` / `design_save_id`). */
export function newSaveId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** The server refused a save made from an older revision: the half was saved elsewhere since. */
export class ProjectChangedError extends Error {
  constructor() {
    super('PROJECT_CHANGED');
    this.name = 'ProjectChangedError';
  }
}

export type SaveProblem = 'conflict' | 'error' | 'unknown-product' | 'gone';

interface SaveProblemsState {
  /** By `<half>:<id>`: why the last save of that half did not go through. */
  problems: Record<string, SaveProblem>;
  report: (half: ProjectHalf, id: number, problem: SaveProblem | null) => void;
}

/** What the project's banner (`ProjectGate`) says about saves that did not go through. Not persisted. */
export const useSaveProblems = create<SaveProblemsState>()((set) => ({
  problems: {},
  report: (half, id, problem) =>
    set((s) => {
      const key = `${half}:${id}`;
      if ((s.problems[key] ?? null) === problem) return s;
      const problems = { ...s.problems };
      if (problem) problems[key] = problem;
      else delete problems[key];
      return { problems };
    }),
}));

/** Sorts a failed save into what the banner can say about it. */
export function problemOf(error: unknown): SaveProblem {
  if (error instanceof ProjectChangedError) return 'conflict';
  // The project was deleted (in another tab, on another computer): there is nothing to save into.
  if (error instanceof Error && (error.message === 'PROJECT_NOT_FOUND' || error.message === 'no-project')) return 'gone';
  if (error instanceof Error && /^Unknown product/.test(error.message)) return 'unknown-product';
  return 'error';
}
