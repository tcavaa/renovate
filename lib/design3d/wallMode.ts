/**
 * How the 3D view shows the walls — the top bar's walls menu, the way a life-sim game's
 * "walls up / cutaway / down" works.
 *
 *   - `up`: every wall at its full height.
 *   - `cutaway` (the default): a wall between the camera and its room is taken away — and the
 *     windows and doors in it, and its mouldings, so nothing hangs in the air where it stood.
 *   - `cutawayLow`: the same walls drop to a low stub (`WALL_STUB_M`) instead of vanishing,
 *     so the rooms keep their outline from every side.
 *   - `down`: every wall a low stub; no doors, windows or cornices. Taking the walls away
 *     whole left white strips where they had stood — the floor stops at the wall's face —
 *     so a wall that is "hidden" keeps its foot.
 *
 * Every part of the shell that stands with a wall is tagged with what it is (`WallPartKind`);
 * the viewer asks `wallPartVisible` for each part, each frame the camera moves, and nothing is
 * rebuilt when the mode changes.
 */

export type WallMode = 'up' | 'cutaway' | 'cutawayLow' | 'down';

/** The menu's order: the default second, the two that lower the walls together. */
export const WALL_MODES: readonly WallMode[] = ['up', 'cutaway', 'cutawayLow', 'down'];

export const DEFAULT_WALL_MODE: WallMode = 'cutaway';

/** How high a lowered wall still stands, in metres: above a skirting board, below every window sill. */
export const WALL_STUB_M = 0.25;

/**
 * What a part of the shell is, for the walls mode: the wall at full height, its low stub, a
 * skirting board, a cornice, a door / window / railing in it, or a beam overhead (no wall of
 * its own; it goes when the walls go down).
 */
export type WallPartKind = 'wall' | 'stub' | 'skirting' | 'cornice' | 'opening' | 'beam';

/**
 * Whether a part shows. `facing`: the camera stands on the wall's outward side, so the wall is
 * between it and its room. `exterior`: an opening to the outside — one into another room (an
 * interior door, a window onto a balcony) stays in a cutaway, since one half of a shared wall
 * always stands.
 */
export function wallPartVisible(mode: WallMode, kind: WallPartKind, facing: boolean, exterior = true): boolean {
  switch (kind) {
    case 'wall':
      return mode === 'up' || (mode !== 'down' && !facing);
    case 'stub':
      return mode === 'down' || (mode === 'cutawayLow' && facing);
    case 'skirting':
      return mode !== 'cutaway' || !facing;
    case 'cornice':
      return mode === 'up' || (mode !== 'down' && !facing);
    case 'opening':
      return mode === 'up' || (mode !== 'down' && (!exterior || !facing));
    case 'beam':
      return mode !== 'down';
  }
}

/**
 * The camera is on the wall's outward side, past a small margin: measured from the middle of
 * the wall's room face along its outward normal.
 */
export function cameraFacesWall(outward: { x: number; z: number }, mid: { x: number; z: number }, camera: { x: number; z: number }): boolean {
  return outward.x * (camera.x - mid.x) + outward.z * (camera.z - mid.z) > 0.35;
}
