/**
 * The whole-flat check (`lib/design/sceneAudit` → `auditScene`) for the scenes unit tests build:
 * what no rule allows in them — pieces in each other or through a wall, in a door's way, in a
 * shower's tray, joinery built into one, a piece arranged off one that is not there — the same
 * things `generationInvariants.test.ts` holds whole flats to, on a hand-built room.
 */

import { auditScene, issueMetric, type SceneIssueCode } from '../../lib/design/sceneAudit';
import type { DecorPiece, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom } from '../../lib/design/types';

/**
 * What the check counts that is not a defect of the scene: what a room ends without and a dining
 * table in the sitting group (measures of the composition), the app's own rule checks (warnings a person may accept) and what the save route would refuse
 * of a plan a test built by hand with only the fields it needs.
 */
const NOT_DEFECTS: ReadonlySet<SceneIssueCode> = new Set<SceneIssueCode>(['missing', 'clustered', 'sofa_tv_off_axis', 'rule', 'unsaveable']);

/** A plan of the rooms alone, as a test builds one. */
export function planOf(rooms: readonly PlanRoom[]): FloorPlan {
  return { rooms: [...rooms], metresPerPixel: null, bounds: { width: 20, depth: 20 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.7 };
}

/**
 * The defects the whole-flat check finds in a scene, as `metric room: what` — empty when there
 * are none. `allow` names the metrics (`issueMetric`) a test means to keep, e.g. `basin_in_air`
 * where the room has nowhere to put a basin but in the air.
 */
export function sceneDefects(
  scene: { plan: FloorPlan | readonly PlanRoom[]; items: readonly PlacedItem[]; decor?: readonly DecorPiece[]; electrical?: readonly ElectricalPoint[] },
  allow: readonly string[] = []
): string[] {
  const plan = Array.isArray(scene.plan) ? planOf(scene.plan as readonly PlanRoom[]) : (scene.plan as FloorPlan);
  return auditScene({ plan, items: [...scene.items], decor: scene.decor, electrical: scene.electrical })
    .filter((issue) => !NOT_DEFECTS.has(issue.code) && !allow.includes(issueMetric(issue)) && !allow.includes(issue.code))
    .map((issue) => `${issueMetric(issue)} ${issue.roomId ?? 'flat'}: ${issue.what}`);
}
