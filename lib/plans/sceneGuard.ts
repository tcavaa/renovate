import type { DesignScene, FloorPlan, PlacedItem, SurfaceFinish } from '@/lib/design/types';
import type { PlanFeature } from './plans';

/**
 * The studio's locks on the server (docs/subscriptions.md#where-it-is-enforced): a design save is
 * compared with the design stored, and a change the plan does not allow is named — `catalog`
 * (furniture added, swapped or removed, a floor or a wall laid anew, decor changed, a door's or a
 * window's product swapped) or `moveFurniture` (a piece moved, turned, mirrored or resized).
 * Pure: the route loads the two designs and the project's calculator picks.
 *
 * What changes a scene without the person choosing it is let through, because it happens on
 * every plan:
 *
 * - **Before the flat is laid out** (`progress.generated === false`) anything goes: the
 *   generation, the empty start and the drawing all write the scene whole.
 * - **The designer's check** right after a generation (`generation.reviewed` set for the first
 *   time) replaces and removes pieces and decor.
 * - **The calculator's picks** (`applyPendingPicks`): a piece, a floor or a wall whose product
 *   the project's calculation picked — the calculator itself is open to every plan.
 * - **Structural edits**: a room whose outline changed (a wall moved, a room resized, added or
 *   removed) refits its furniture, finishes and decor; that room is not compared.
 * - **Filling in**: a door or window given a product where it had none (`ensureOpeningProducts`),
 *   or a new product because its kind or size changed; a kitchen's material the studio assigned
 *   itself (`ensureKitchenMaterials` — only one the person chose counts).
 *
 * Not compared at all (open to every plan): sockets, switches, lights, technical points and
 * equipment, the budget's ticks and quantities, the style, the mode, versions kept.
 *
 * What is refused that a person on the plan could not do in the studio either: laying the flat
 * out again over one laid out (a new `generation`), or turning a laid-out flat back into an
 * unlaid one.
 */

export interface StoredDesign {
  plan: FloorPlan | null | undefined;
  scene: DesignScene | null | undefined;
}

export interface SceneAllowance {
  catalog: boolean;
  moveFurniture: boolean;
  /** Product ids the project's calculation picked: they may come in on any plan. */
  picks: ReadonlySet<number>;
}

const EPS = 1e-3;

function isPending(scene: DesignScene): boolean {
  return scene.progress?.generated === false;
}

/** The rooms whose outline is not the same in both plans — added, removed or reshaped. */
function changedRooms(before: FloorPlan, after: FloorPlan): Set<string> {
  const changed = new Set<string>();
  const outline = (plan: FloorPlan) => new Map(plan.rooms.map((r) => [r.id, JSON.stringify(r.polygon)]));
  const b = outline(before);
  const a = outline(after);
  for (const [id, shape] of b) if (a.get(id) !== shape) changed.add(id);
  for (const id of a.keys()) if (!b.has(id)) changed.add(id);
  return changed;
}

function moved(prev: PlacedItem, next: PlacedItem): boolean {
  return (
    prev.roomId !== next.roomId ||
    Math.abs(prev.position.x - next.position.x) > EPS ||
    Math.abs(prev.position.z - next.position.z) > EPS ||
    Math.abs((prev.elevationM ?? 0) - (next.elevationM ?? 0)) > EPS ||
    Math.abs(prev.rotation - next.rotation) > 1e-4 ||
    !!prev.mirrored !== !!next.mirrored ||
    Math.abs(prev.size.width - next.size.width) > EPS ||
    Math.abs(prev.size.depth - next.size.depth) > EPS ||
    Math.abs(prev.size.height - next.size.height) > EPS
  );
}

/** A finish as what it is, not what it costs: the product by its id (prices are the server's anyway). */
function finishKey(finish: SurfaceFinish): string {
  const { product, ...rest } = finish;
  return JSON.stringify({ ...rest, product: product?.productId ?? null });
}

function itemsChange(before: DesignScene, after: DesignScene, changed: Set<string>, roomsAfter: Set<string>, allow: SceneAllowance): PlanFeature | null {
  const prevById = new Map(before.items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const item of after.items) {
    const prev = prevById.get(item.id);
    const productId = item.product?.productId ?? null;
    const picked = productId != null && allow.picks.has(productId);
    if (!prev) {
      if (!allow.catalog && !picked) return 'catalog';
      continue;
    }
    seen.add(item.id);
    if ((prev.product?.productId ?? null) !== productId) {
      // A pick takes the slot's place and is fitted to it: its new pose is part of the pick.
      if (!allow.catalog && !picked) return 'catalog';
      continue;
    }
    if (!allow.catalog && item.kitchenMaterialChosen && (prev.kitchenMaterial?.productId ?? null) !== (item.kitchenMaterial?.productId ?? null)) return 'catalog';
    if (!allow.moveFurniture && !changed.has(prev.roomId) && !changed.has(item.roomId) && moved(prev, item)) return 'moveFurniture';
  }
  if (!allow.catalog) {
    for (const prev of before.items) {
      if (seen.has(prev.id) || changed.has(prev.roomId) || !roomsAfter.has(prev.roomId)) continue;
      return 'catalog';
    }
  }
  return null;
}

function finishesChange(before: DesignScene, after: DesignScene, changed: Set<string>, allow: SceneAllowance): boolean {
  const counts = new Map<string, number>();
  for (const f of before.finishes) if (!changed.has(f.roomId)) counts.set(finishKey(f), (counts.get(finishKey(f)) ?? 0) + 1);
  /** The room and surface a calculator pick was laid on in this save: what it covered is replaced, not removed. */
  const pickedSurfaces = new Set<string>();
  for (const f of after.finishes) {
    if (changed.has(f.roomId)) continue;
    const key = finishKey(f);
    const left = counts.get(key) ?? 0;
    if (left > 0) {
      counts.set(key, left - 1);
      continue;
    }
    const productId = f.product?.productId;
    if (productId == null || !allow.picks.has(productId)) return true;
    pickedSurfaces.add(`${f.roomId}|${f.surface}`);
  }
  // What is left was taken off: only under a pick laid on the same surface.
  for (const f of before.finishes) {
    if (changed.has(f.roomId)) continue;
    const key = finishKey(f);
    if ((counts.get(key) ?? 0) > 0) {
      if (!pickedSurfaces.has(`${f.roomId}|${f.surface}`)) return true;
      counts.set(key, (counts.get(key) ?? 0) - 1);
    }
  }
  return false;
}

function decorChange(before: DesignScene, after: DesignScene, changed: Set<string>, roomsAfter: Set<string>): boolean {
  // What a piece is made of and how it is set; where it is fitted follows its room and anchor.
  const key = (d: NonNullable<DesignScene['decor']>[number]) =>
    JSON.stringify({
      family: d.family,
      params: d.params,
      materials: Object.entries(d.materials)
        .map(([slot, m]) => [slot, m?.product?.productId ?? null, (m as { colorHex?: string } | undefined)?.colorHex ?? null])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    });
  const prevById = new Map((before.decor ?? []).map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (const piece of after.decor ?? []) {
    if (changed.has(piece.roomId)) continue;
    const prev = prevById.get(piece.id);
    if (!prev || key(prev) !== key(piece)) return true;
    seen.add(piece.id);
  }
  for (const prev of before.decor ?? []) {
    if (!seen.has(prev.id) && !changed.has(prev.roomId) && roomsAfter.has(prev.roomId)) return true;
  }
  return false;
}

function openingsChange(before: FloorPlan, after: FloorPlan, allow: SceneAllowance): boolean {
  const prev = new Map(before.rooms.flatMap((r) => r.openings.map((o) => [`${r.id}:${o.id}`, o] as const)));
  for (const room of after.rooms) {
    for (const opening of room.openings) {
      const was = prev.get(`${room.id}:${opening.id}`);
      const from = was?.product?.productId ?? null;
      const to = opening.product?.productId ?? null;
      // A new opening, one given its first product, or one re-fitted for a new kind or size.
      if (!was || from == null || from === to) continue;
      if (was.kind !== opening.kind || Math.abs((was.widthM ?? 0) - (opening.widthM ?? 0)) > EPS || Math.abs((was.heightM ?? 0) - (opening.heightM ?? 0)) > EPS) continue;
      if (to != null && allow.picks.has(to)) continue;
      return true;
    }
  }
  return false;
}

/** What the plan does not allow in this save, or null when it is all allowed. */
export function refusedSceneChange(stored: StoredDesign, next: { plan: FloorPlan; scene: DesignScene }, allow: SceneAllowance): PlanFeature | null {
  if (allow.catalog && allow.moveFurniture) return null;
  const before = stored.scene;
  const beforePlan = stored.plan;
  // Nothing laid out to compare with: the flat is still being made.
  if (!before || !beforePlan || !Array.isArray(before.items) || isPending(before)) return null;
  const after = next.scene;
  if (isPending(after)) return 'catalog';
  if ((before.generation?.at ?? null) !== (after.generation?.at ?? null)) return 'catalog';

  const changed = changedRooms(beforePlan, next.plan);
  const roomsAfter = new Set(next.plan.rooms.map((r) => r.id));
  // The designer's check, once, right after the generation: its fixes are the generation's.
  const reviewing = before.generation?.reviewed == null && after.generation?.reviewed != null;
  if (!reviewing) {
    const items = itemsChange(before, after, changed, roomsAfter, allow);
    if (items) return items;
    if (!allow.catalog && decorChange(before, after, changed, roomsAfter)) return 'catalog';
  }
  if (!allow.catalog && finishesChange(before, after, changed, allow)) return 'catalog';
  if (!allow.catalog && openingsChange(beforePlan, next.plan, allow)) return 'catalog';
  return null;
}

/** The product ids a project's calculation picked (`selectedProducts`, `selectedFurniture`). */
export function calculatorPickIds(selectedProducts: unknown, selectedFurniture: unknown): Set<number> {
  const ids = new Set<number>();
  const add = (v: unknown) => {
    const id = (v as { productId?: unknown } | null)?.productId;
    if (typeof id === 'number') ids.add(id);
  };
  if (selectedProducts && typeof selectedProducts === 'object') Object.values(selectedProducts).forEach(add);
  if (selectedFurniture && typeof selectedFurniture === 'object') for (const list of Object.values(selectedFurniture)) if (Array.isArray(list)) list.forEach(add);
  return ids;
}
