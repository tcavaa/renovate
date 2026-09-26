/**
 * Whose wall a hit on a wall face is, for the finishes brush and for hanging a piece.
 *
 * A wall is built by each room from its own side (`buildScene`), so the mesh a ray hits
 * belongs to one room — but the face it hits need not. The room face (and the top, and the
 * reveals of its openings) is the room's own. The far face, which the camera only meets from
 * the other side, belongs to the room standing behind that stretch of the wall
 * (`wallFrame.behind`), so the wall that gets painted is always the one that was looked at.
 *
 * The far face of a stretch with no room behind it is the outside of the flat: nobody's wall,
 * and null. It used to fall back to the room's own wall, so a brush on the outside of the
 * flat painted the room inside it. Pure, so it is tested without a renderer.
 */

import type { SceneUserData } from './buildScene';

export interface WallSide {
  roomId: string;
  wallIndex: number | undefined;
}

type Flat = { x: number; z: number };

export function wallSideAt(data: Pick<SceneUserData, 'roomId' | 'wallIndex' | 'outward' | 'wallFrame'>, point: Flat, normal: Flat | null): WallSide | null {
  const own = { roomId: data.roomId, wallIndex: data.wallIndex };
  const frame = data.wallFrame;
  if (!frame || !data.outward || !normal) return own;
  // Facing into the room, up (the top) or along the wall (a reveal): the room's own.
  if (normal.x * data.outward.x + normal.z * data.outward.z < 0.5) return own;
  // A far face is mitred, so it runs on past the corners; a hit there belongs to the stretch
  // at that end.
  const along = (point.x - frame.a.x) * frame.dir.x + (point.z - frame.a.z) * frame.dir.z;
  const s = Math.max(0, Math.min(frame.length, along));
  const behind = frame.behind.find((b) => s >= b.from - 1e-3 && s <= b.to + 1e-3);
  return behind ? { roomId: behind.roomId, wallIndex: behind.wallIndex } : null;
}
