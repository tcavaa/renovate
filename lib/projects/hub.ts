import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { calculatorProgress, designProgress, projectKind, type CalculatorProgress, type ProjectKind } from '@/lib/projects/saved';
import type { HomeState, Room } from '@/lib/calculator/types';
import type { DesignMode, DesignProgress, FloorPlan } from '@/lib/design/types';

/**
 * One of the person's projects as the hubs list it (`/calculator`, `/design`): enough to draw
 * its card, place it in the right hub, say where it stands and offer the way into either
 * journey — and nothing else. Serialisable, and small: the design's scene is read for its
 * progress and nothing more, and the kept versions are never read.
 */
export interface HubProject extends ProjectKind {
  id: number;
  name: string;
  status: 'draft' | 'saved' | 'submitted';
  /** The row's last write (ms): the hubs list the most recently changed first. */
  updatedAt: number;
  /** The calculator has written its half (`selectedProducts IS NOT NULL`). */
  calculatorStarted: boolean;
  /** The calculation has what a 3D design is made from: a home state and rooms. */
  calculationReady: boolean;
  homeState: HomeState | null;
  mode: DesignMode;
  totalM2: number;
  /** The project's figure; null when there is none worth showing yet (the profile's rule). */
  totalCost: number | null;
  calculatorProgress: CalculatorProgress;
  designProgress: DesignProgress;
  /** Rooms on the 3D design's plan — what a calculation can be started from. */
  planRooms: number;
  /** What the card's drawing is made from: the design's plan, the calculator's board, the typed rooms. */
  thumbnail: { plan: FloorPlan | null; boardPlan: FloorPlan | null; rooms: Room[] };
}

/** mysql2 hands a JSON expression back parsed; a string is read in case a driver does not. */
function json<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Every one of the user's projects, most recently changed first. The hub filters them by
 * journey; the whole list is also what tells the browser which of its caches belong to
 * projects that are gone (`pruneCaches`).
 */
export async function loadHubProjects(userId: number): Promise<HubProject[]> {
  const rows = await db
    .select({
      id: projects.id,
      nameKa: projects.nameKa,
      status: projects.status,
      updatedAt: projects.updatedAt,
      homeState: projects.homeState,
      mode: projects.mode,
      totalM2: projects.totalM2,
      totalCost: projects.totalCost,
      rooms: projects.rooms,
      selectedProducts: projects.selectedProducts,
      selectedFurniture: projects.selectedFurniture,
      calculatorEdits: projects.calculatorEdits,
      plan: projects.plan,
      // Of the calculator's board only its drawing; of the scene only what `designProgress`
      // reads — the scene carries every placed product's snapshot and can be large.
      boardPlan: sql<unknown>`json_extract(${projects.calculatorBoard}, '$.plan')`,
      hasScene: sql<number>`(${projects.scene} is not null)`,
      sceneProgress: sql<unknown>`json_extract(${projects.scene}, '$.progress')`,
      sceneItems: sql<number | null>`json_length(${projects.scene}, '$.items')`,
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt), desc(projects.id));

  return rows.map((p) => {
    const progress = json<DesignProgress>(p.sceneProgress);
    // The scene as far as `projectKind` and `designProgress` look at it: its progress, and how
    // many pieces stand in it (a draft saved before progress was recorded is judged by that).
    const scene = Number(p.hasScene) ? { progress: progress ?? undefined, items: { length: Number(p.sceneItems ?? 0) } } : null;
    const row = { ...p, scene };
    const kind = projectKind(row);
    const rooms = (Array.isArray(p.rooms) ? p.rooms : []) as Room[];
    const plan = json<FloorPlan>(p.plan);
    // A project with nothing finished yet — a calculation left before it was calculated, a
    // design before it was generated — has no figure worth showing (as on the profile).
    const calculatorDone = p.selectedProducts != null && !kind.calculatorPending;
    const designDone = kind.hasDesign && !kind.designPending;
    const unfinished = !calculatorDone && !designDone && (kind.calculatorPending || kind.designPending);
    return {
      id: p.id,
      name: p.nameKa ?? '',
      status: (p.status ?? 'draft') as HubProject['status'],
      updatedAt: new Date(p.updatedAt).getTime(),
      ...kind,
      calculatorStarted: p.selectedProducts != null,
      calculationReady: p.homeState != null && rooms.length > 0,
      homeState: (p.homeState as HomeState | null) ?? null,
      mode: p.mode,
      totalM2: Number(p.totalM2),
      totalCost: p.totalCost != null && !unfinished ? Number(p.totalCost) : null,
      calculatorProgress: calculatorProgress(row),
      designProgress: designProgress(row),
      planRooms: plan?.rooms?.length ?? 0,
      thumbnail: { plan, boardPlan: json<FloorPlan>(p.boardPlan), rooms },
    };
  });
}
