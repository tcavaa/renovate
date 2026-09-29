import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, projectRenders, projects } from '@/lib/db/schema';
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
    .where(eq(projects.userId, userId));
  // Most recently changed first — sorted here, not by MySQL. No index gives that order, and a
  // sort carries every column the select reads through the server's sort buffer: the scene and
  // the board whole, for the expressions above. A project with a furnished design passed the
  // 256 KB default and the hubs failed with "Out of sort memory". A person has a few dozen rows.
  rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id);

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

/** A photo taken in the studio, and the realistic render made from it, as the hubs' "renders" list them. */
export interface HubRender {
  id: number;
  projectId: number;
  projectName: string;
  sourceUrl: string;
  /** Filled in once the render is made; until then the photo is what there is. */
  renderUrl: string | null;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  roomName: string | null;
  /** When it was taken (ms). */
  createdAt: number;
}

/**
 * Every render of the user's projects, newest first — the hubs' second list, whichever product
 * it is opened from (renders are taken in the studio; a project's own page lists its own,
 * `ProjectRenders`). Small columns only, so the sort never carries a plan or a scene.
 */
export async function loadHubRenders(userId: number): Promise<HubRender[]> {
  const rows = await db
    .select({
      id: projectRenders.id,
      projectId: projectRenders.projectId,
      projectName: projects.nameKa,
      sourceUrl: projectRenders.sourceUrl,
      renderUrl: projectRenders.renderUrl,
      status: projectRenders.status,
      roomName: projectRenders.roomName,
      createdAt: projectRenders.createdAt,
    })
    .from(projectRenders)
    .innerJoin(projects, eq(projects.id, projectRenders.projectId))
    .where(eq(projects.userId, userId))
    .orderBy(desc(projectRenders.createdAt))
    .limit(300);
  return rows.map((r) => ({ ...r, projectName: r.projectName ?? '', createdAt: new Date(r.createdAt).getTime() }));
}

/** A project of the user's that has orders, as the hubs' "orders" group them: newest order first. */
export interface HubOrderProject {
  id: number;
  name: string;
  /** When its latest order was placed (ms). */
  lastOrderAt: number;
}

/** The user's projects with orders on them, the one ordered from most recently first. */
export async function loadHubOrderProjects(userId: number): Promise<HubOrderProject[]> {
  const rows = await db
    .select({ id: orders.projectId, name: projects.nameKa, createdAt: orders.createdAt })
    .from(orders)
    .innerJoin(projects, eq(projects.id, orders.projectId))
    .where(eq(projects.userId, userId));
  const byProject = new Map<number, HubOrderProject>();
  for (const row of rows) {
    if (row.id == null) continue;
    const at = new Date(row.createdAt).getTime();
    const known = byProject.get(row.id);
    if (!known || at > known.lastOrderAt) byProject.set(row.id, { id: row.id, name: row.name ?? '', lastOrderAt: at });
  }
  return [...byProject.values()].sort((a, b) => b.lastOrderAt - a.lastOrderAt);
}
