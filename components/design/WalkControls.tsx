'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildWalkable, findStandingSpot } from '@/lib/design/manipulate';
import type { FloorPlan, PlacedItem, Vec2 } from '@/lib/design/types';

const EYE_HEIGHT_M = 1.62;
const WALK_SPEED = 2.4;
const RUN_SPEED = 4.4;
const LOOK_SENSITIVITY = 0.0032;
const PITCH_LIMIT = Math.PI / 2 - 0.08;
const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

// Scratch object, so the per-frame work allocates nothing.
const walkEuler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * First-person controls for standing inside the flat.
 *
 * Deliberately not pointer-lock: a web page that swallows the cursor the moment you click is
 * hostile. Drag to look, WASD or the arrow keys to walk, shift to hurry.
 *
 * Movement is deliberately unclipped — walls and furniture do not stop the viewer. The
 * walkable area is only used to choose a sensible starting spot inside the focused room.
 */
export function WalkControls({
  plan,
  focusRoomId,
  items,
}: {
  plan: FloorPlan;
  focusRoomId: string | null;
  items: PlacedItem[];
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(-0.05);
  const keys = useRef(new Set<string>());
  const looking = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const walkable = useMemo(() => buildWalkable(plan), [plan]);

  /**
   * The furniture is needed to pick a spot clear of it, but only at the moment we enter a
   * room — held in a ref rather than a dependency so that swapping a product, which changes
   * `items`, does not teleport the viewer back to the doorway mid-walk.
   */
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Drop the camera into the focused room — or the largest one — when walk mode starts.
  useEffect(() => {
    const room =
      plan.rooms.find((r) => r.id === focusRoomId) ??
      [...plan.rooms].sort((a, b) => b.areaM2 - a.areaM2)[0];
    if (!room) return;

    const spot = findStandingSpot(room, itemsRef.current, walkable);
    camera.position.set(spot.position.x, EYE_HEIGHT_M, spot.position.z);

    // Look back into the room. If we happened to land dead centre there is nothing to face,
    // so fall back to the middle of the flat.
    const target =
      Math.hypot(spot.lookAt.x - spot.position.x, spot.lookAt.z - spot.position.z) > 0.4
        ? spot.lookAt
        : flatCentre(plan);

    yaw.current = Math.atan2(target.x - spot.position.x, target.z - spot.position.z) + Math.PI;
    pitch.current = -0.04;

    if (camera instanceof THREE.PerspectiveCamera) {
      // A wider lens indoors, or a normal room reads like a corridor.
      camera.fov = 70;
      camera.updateProjectionMatrix();
    }
  }, [plan, focusRoomId, camera, walkable]);

  useEffect(() => {
    const canvas = gl.domElement;
    const pressedKeys = keys.current;

    const onDown = (event: PointerEvent) => {
      looking.current = true;
      lastPointer.current = { x: event.clientX, y: event.clientY };
    };
    const onMove = (event: PointerEvent) => {
      if (!looking.current) return;
      const dx = event.clientX - lastPointer.current.x;
      const dy = event.clientY - lastPointer.current.y;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      yaw.current -= dx * LOOK_SENSITIVITY;
      pitch.current = clamp(pitch.current - dy * LOOK_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
    };
    const onUp = () => {
      looking.current = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      pressedKeys.add(key);
      if (WALK_KEYS.has(key)) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => pressedKeys.delete(event.key.toLowerCase());
    const onBlur = () => pressedKeys.clear();

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      // Leaving walk mode with a key held would otherwise keep the camera drifting.
      pressedKeys.clear();
    };
  }, [gl]);

  useFrame((_, delta) => {
    const pressed = keys.current;
    const forward =
      (pressed.has('w') || pressed.has('arrowup') ? 1 : 0) -
      (pressed.has('s') || pressed.has('arrowdown') ? 1 : 0);
    const strafe =
      (pressed.has('d') || pressed.has('arrowright') ? 1 : 0) -
      (pressed.has('a') || pressed.has('arrowleft') ? 1 : 0);

    if (forward !== 0 || strafe !== 0) {
      const speed = (pressed.has('shift') ? RUN_SPEED : WALK_SPEED) * Math.min(delta, 0.05);
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);

      // No collision on purpose: the viewer walks straight through walls and furniture. A
      // design tool wants to be explored, not navigated, and getting stuck in a doorway or
      // behind a sofa reads as a bug every time. `walkable` still picks the starting spot.
      camera.position.x += -sin * forward * speed + cos * strafe * speed;
      camera.position.z += -cos * forward * speed - sin * strafe * speed;
    }

    camera.position.y = EYE_HEIGHT_M;
    walkEuler.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(walkEuler);
  });

  return null;
}

/** A dim light that follows the camera, so nothing indoors is ever pitch black. */
export function Headlamp({ color }: { color: string }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });
  return <pointLight ref={ref} intensity={2.2} distance={7} decay={1.6} color={color} />;
}

function flatCentre(plan: FloorPlan): Vec2 {
  const points = plan.rooms.flatMap((room) => room.polygon);
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
