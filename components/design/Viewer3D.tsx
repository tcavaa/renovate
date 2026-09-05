'use client';

/**
 * The 3D studio viewport.
 *
 * The scene graph itself is built imperatively by `lib/design3d/buildScene` and mounted here
 * as a single `<primitive>`, rather than being expressed as React components. That is on
 * purpose: a furnished flat is several hundred meshes, and rebuilding a React tree of that
 * size on every product swap would be far slower than regenerating a plain Three.js group.
 *
 * React's job here is the camera, the lights, and turning pointer input into selections and
 * drags.
 *
 * Two camera modes share the scene:
 *   - `orbit` — the doll's-house view, with walls facing the camera cut away
 *   - `walk`  — standing inside at eye height, walls and ceilings intact
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildScene, frameFor, type SceneUserData } from '@/lib/design3d/buildScene';
import { StyleMaterials } from '@/lib/design3d/materials';
import { getStyle } from '@/lib/design/styles';
import {
  buildWalkable,
  findStandingSpot,
  roomAtPoint,
  snapPlacement,
  type SnapResult,
} from '@/lib/design/manipulate';
import type { DesignScene, FloorPlan, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

export type ViewMode = 'orbit' | 'walk';

export interface Viewer3DProps {
  plan: FloorPlan;
  scene: DesignScene;
  focusRoomId?: string | null;
  selectedItemId?: string | null;
  showWalls?: boolean;
  viewMode?: ViewMode;
  onHoverItem?: (item: PlacedItem | null, screen: { x: number; y: number } | null) => void;
  onSelectItem?: (itemId: string | null) => void;
  /** A click on a room's floor or wall — the studio opens the finish picker for it. */
  onSelectSurface?: (selection: { roomId: string; surface: 'floor' | 'wall' } | null) => void;
  /** Commits a drag. `roomId` is set when the item was dragged into a different room. */
  onPlaceItem?: (itemId: string, position: Vec2, rotation: number, roomId: string) => void;
  className?: string;
}

export function Viewer3D(props: Viewer3DProps) {
  const style = getStyle(props.scene.styleId);

  return (
    <div className={props.className}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 48, near: 0.05, far: 200 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={() => {
          props.onSelectItem?.(null);
          props.onSelectSurface?.(null);
        }}
      >
        <color attach="background" args={[style.lighting.ambient]} />
        <fog attach="fog" args={[style.lighting.ambient, 34, 90]} />
        <Suspense fallback={null}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Scratch objects, so the per-frame work allocates nothing.
const tempVector = new THREE.Vector3();
const tempVector2 = new THREE.Vector3();
const tempVector3 = new THREE.Vector3();
const dragRaycaster = new THREE.Raycaster();
const dragNdc = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragHit = new THREE.Vector3();
const walkEuler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Distance the pointer must travel before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 5;

interface DragState {
  itemId: string;
  item: PlacedItem;
  wrapper: THREE.Object3D;
  /** Offset from the pointer's floor position to the item's origin, so it doesn't jump. */
  grab: Vec2;
  startX: number;
  startY: number;
  moved: boolean;
  result: SnapResult | null;
  room: PlanRoom;
}

function SceneContent({
  plan,
  scene,
  focusRoomId = null,
  selectedItemId = null,
  showWalls = true,
  viewMode = 'orbit',
  onHoverItem,
  onSelectItem,
  onSelectSurface,
  onPlaceItem,
}: Viewer3DProps) {
  const style = getStyle(scene.styleId);
  const { camera, gl } = useThree();
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const walking = viewMode === 'walk';

  // One material factory per style; disposed when the style changes or the viewer unmounts.
  const materials = useMemo(() => new StyleMaterials(style), [style]);
  useEffect(() => () => materials.dispose(), [materials]);

  const group = useMemo(
    () =>
      buildScene(plan, scene, style, materials, {
        // Inside the flat you want the walls and the ceiling; from outside you want to see in.
        showWalls: walking ? true : showWalls,
        showCeiling: walking,
        onlyRoomId: walking ? null : focusRoomId,
      }),
    [plan, scene, style, materials, showWalls, walking, focusRoomId]
  );

  // Three.js does not free GPU buffers on its own — drop the old geometry when rebuilding.
  useEffect(() => {
    return () => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
    };
  }, [group]);

  const itemsById = useMemo(
    () => new Map(scene.items.map((item) => [item.id, item])),
    [scene.items]
  );

  // -------------------------------------------------------------------------
  // Selection outlines
  // -------------------------------------------------------------------------

  /**
   * Selection is shown with an outline box rather than by tinting the item's material.
   *
   * Materials are shared between every item that uses the same colour and finish, so
   * highlighting through them would light up *both* nightstands when you hovered one.
   */
  const outlines = useMemo(() => ({ hover: makeOutline(), active: makeOutline() }), []);
  useEffect(() => {
    const { hover, active } = outlines;
    return () => {
      for (const line of [hover, active]) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
    };
  }, [outlines]);

  useEffect(() => {
    if (dragging) return; // the drag loop drives the outline itself
    applyOutline(outlines.active, selectedItemId ? itemsById.get(selectedItemId) : null, 0xe85d26);
    applyOutline(
      outlines.hover,
      hoveredId && hoveredId !== selectedItemId ? itemsById.get(hoveredId) : null,
      0xf5a623
    );
  }, [outlines, selectedItemId, hoveredId, itemsById, dragging]);

  // -------------------------------------------------------------------------
  // Camera framing
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (walking) return;
    const { position, target } = frameFor(plan, focusRoomId);
    camera.position.set(...position);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 48;
      camera.updateProjectionMatrix();
    }
    const orbit = orbitRef.current;
    if (orbit) {
      orbit.target.set(...target);
      orbit.update();
    } else {
      camera.lookAt(...target);
    }
  }, [plan, focusRoomId, camera, walking]);

  // -------------------------------------------------------------------------
  // Doll's-house cutaway
  // -------------------------------------------------------------------------

  /**
   * Hide any wall the camera is on the outward side of.
   *
   * From outside this is the doll's-house cutaway. From *inside* it does something equally
   * necessary: adjacent rooms each extrude their own wall into the gap between them, so the
   * partition exists twice and the two coplanar faces z-fight into black patches. The room
   * you are standing in is on the inward side of its own wall and on the outward side of its
   * neighbour's, so the same rule keeps exactly one of them.
   */
  useFrame(() => {
    group.traverse((child) => {
      const data = child.userData as SceneUserData;
      if (data?.surface !== 'wall' || !data.outward) return;

      const world = child.getWorldPosition(tempVector3);
      const toCamera = tempVector
        .set(camera.position.x, 0, camera.position.z)
        .sub(tempVector2.set(world.x, 0, world.z));

      // > 0 means the camera sits on the outward side, so this wall is in the way.
      const facing = data.outward.x * toCamera.x + data.outward.z * toCamera.z;
      child.visible = facing <= 0.35;
    });
  });

  // -------------------------------------------------------------------------
  // Pointer picking
  // -------------------------------------------------------------------------

  /**
   * Resolves the nearest thing under the pointer.
   *
   * R3F calls a handler once for *every* object the ray passes through, nearest first, so
   * without stopping propagation the last call — the wall behind the sofa — would be the one
   * that stuck.
   */
  const pick = (event: ThreeEvent<PointerEvent>): SceneUserData | null => {
    event.stopPropagation();
    const data = event.object.userData as SceneUserData | undefined;
    return data?.pickKind ? data : null;
  };

  const dragRef = useRef<DragState | null>(null);
  /** A press on a floor or wall; becomes a surface selection if the pointer does not travel. */
  const surfacePressRef = useRef<{ roomId: string; surface: 'floor' | 'wall'; x: number; y: number } | null>(null);

  /** Converts a screen position into a point on the horizontal plane at `planeY`. */
  const floorPoint = useCallback(
    (clientX: number, clientY: number, planeY: number): Vec2 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      dragNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      dragRaycaster.setFromCamera(dragNdc, camera);
      dragPlane.constant = -planeY;
      const hit = dragRaycaster.ray.intersectPlane(dragPlane, dragHit);
      return hit ? { x: hit.x, z: hit.z } : null;
    },
    [camera, gl]
  );

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    if (dragRef.current?.moved) return; // the drag loop owns the pointer

    const data = pick(event);
    const itemId = data?.pickKind === 'item' ? (data.itemId ?? null) : null;

    if (itemId !== hoveredId) {
      setHoveredId(itemId);
      gl.domElement.style.cursor = itemId && !walking ? 'grab' : 'default';
      const item = itemId ? (itemsById.get(itemId) ?? null) : null;
      onHoverItem?.(item, item ? { x: event.clientX, y: event.clientY } : null);
    } else if (itemId) {
      onHoverItem?.(itemsById.get(itemId) ?? null, { x: event.clientX, y: event.clientY });
    }
  };

  const handleOut = () => {
    if (dragRef.current?.moved) return;
    setHoveredId(null);
    gl.domElement.style.cursor = 'default';
    onHoverItem?.(null, null);
  };

  /**
   * A press starts a *potential* drag.
   *
   * Whether it becomes a drag or a selection is decided on release, by how far the pointer
   * travelled. OrbitControls captures the pointer so waiting for a click event is not
   * reliable, and committing to a drag immediately would make the scene impossible to orbit.
   */
  const handleDown = (event: ThreeEvent<PointerEvent>) => {
    const data = pick(event);
    const itemId = data?.pickKind === 'item' ? data.itemId : null;
    if (!itemId) {
      dragRef.current = null;
      surfacePressRef.current =
        data?.pickKind === 'surface' && data.roomId && (data.surface === 'floor' || data.surface === 'wall')
          ? { roomId: data.roomId, surface: data.surface, x: event.clientX, y: event.clientY }
          : null;
      return;
    }
    surfacePressRef.current = null;

    const item = itemsById.get(itemId);
    const wrapper = group.getObjectByName(`item-${itemId}`);
    const room = plan.rooms.find((r) => r.id === item?.roomId);
    if (!item || !wrapper || !room) {
      dragRef.current = null;
      return;
    }

    const ground = floorPoint(event.clientX, event.clientY, item.elevationM);
    dragRef.current = {
      itemId,
      item,
      wrapper,
      room,
      grab: ground
        ? { x: item.position.x - ground.x, z: item.position.z - ground.z }
        : { x: 0, z: 0 },
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      result: null,
    };
  };

  /**
   * The drag itself runs on native listeners rather than R3F events.
   *
   * The moment you drag faster than the object follows, the pointer leaves its geometry and
   * R3F stops delivering moves for it. Listening on the canvas keeps the drag alive wherever
   * the pointer goes.
   */
  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Inside the flat, dragging the view takes priority over dragging furniture.
      if (walking) return;

      const travel =
        Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
      if (!drag.moved) {
        if (travel < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        setDragging(true);
        // Stop the camera orbiting while a piece of furniture is in hand.
        const orbit = orbitRef.current;
        if (orbit) orbit.enabled = false;
        canvas.style.cursor = 'grabbing';
        onHoverItem?.(null, null);
      }

      const ground = floorPoint(event.clientX, event.clientY, drag.item.elevationM);
      if (!ground) return;

      const desired = { x: ground.x + drag.grab.x, z: ground.z + drag.grab.z };
      // Dragging into a neighbouring room re-homes the item there.
      const room = roomAtPoint(plan.rooms, desired) ?? drag.room;
      drag.room = room;

      const result = snapPlacement(
        room,
        drag.item,
        { position: desired, rotation: drag.item.rotation },
        scene.items
      );
      drag.result = result;

      drag.wrapper.position.set(result.position.x, drag.item.elevationM, result.position.z);
      drag.wrapper.rotation.y = result.rotation;

      applyOutline(
        outlines.active,
        { ...drag.item, position: result.position, rotation: result.rotation },
        result.valid ? 0x22c55e : 0xef4444
      );
      outlines.hover.visible = false;
    };

    const onPointerUp = (event: PointerEvent) => {
      // A tap on a floor or wall with no travel is a selection; a drag is orbiting.
      const press = surfacePressRef.current;
      surfacePressRef.current = null;
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6) {
        onSelectSurface?.({ roomId: press.roomId, surface: press.surface });
      }

      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      const orbit = orbitRef.current;
      if (orbit) orbit.enabled = true;
      canvas.style.cursor = 'default';

      if (!drag.moved) {
        onSelectItem?.(drag.itemId);
        return;
      }

      setDragging(false);

      if (drag.result?.valid) {
        onPlaceItem?.(drag.itemId, drag.result.position, drag.result.rotation, drag.room.id);
        onSelectItem?.(drag.itemId);
      } else {
        // Refused: put it back where it came from rather than leave it overlapping.
        drag.wrapper.position.set(
          drag.item.position.x,
          drag.item.elevationM,
          drag.item.position.z
        );
        drag.wrapper.rotation.y = drag.item.rotation;
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [
    gl,
    walking,
    plan.rooms,
    scene.items,
    floorPoint,
    outlines,
    onPlaceItem,
    onSelectItem,
    onSelectSurface,
    onHoverItem,
  ]);

  return (
    <>
      <hemisphereLight
        args={[style.lighting.ambient, '#8A8078', style.lighting.ambientIntensity]}
      />
      <directionalLight
        castShadow
        position={[12, 18, 8]}
        intensity={style.lighting.sunIntensity}
        color={style.lighting.sun}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={70}
        shadow-bias={-0.0005}
      />
      {/* A soft fill from the opposite side keeps interiors from going flat black. */}
      <directionalLight position={[-10, 9, -8]} intensity={0.35} color={style.lighting.lamp} />
      {/*
        Standing inside, sunlight through the windows alone leaves the far side of a room
        black, so walk mode adds flat fill plus a soft light that travels with the viewer.
      */}
      {walking && (
        <>
          <ambientLight intensity={0.6} color={style.lighting.ambient} />
          <Headlamp color={style.lighting.lamp} />
        </>
      )}

      {/*
        The handlers live on a group React itself created, not on the <primitive>. R3F only
        registers objects it constructed in its interaction list, so events put directly on a
        <primitive> wrapping a foreign object never fire.
      */}
      <group onPointerMove={handleMove} onPointerOut={handleOut} onPointerDown={handleDown}>
        <primitive object={group} />
      </group>

      <primitive object={outlines.active} />
      <primitive object={outlines.hover} />

      {walking ? (
        <WalkControls plan={plan} focusRoomId={focusRoomId} items={scene.items} />
      ) : (
        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={1.6}
          maxDistance={60}
          // Stop the camera dropping below the floor.
          maxPolarAngle={Math.PI / 2 - 0.04}
          panSpeed={0.8}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Walk-through camera
// ---------------------------------------------------------------------------

const EYE_HEIGHT_M = 1.62;
const WALK_SPEED = 2.4;
const RUN_SPEED = 4.4;
const LOOK_SENSITIVITY = 0.0032;
const PITCH_LIMIT = Math.PI / 2 - 0.08;
const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/**
 * First-person controls for standing inside the flat.
 *
 * Deliberately not pointer-lock: a web page that swallows the cursor the moment you click is
 * hostile. Drag to look, WASD or the arrow keys to walk, shift to hurry.
 *
 * Movement is deliberately unclipped — walls and furniture do not stop the viewer. The
 * walkable area is only used to choose a sensible starting spot inside the focused room.
 */
function WalkControls({
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

      const steps: Vec2[] = [
        { x: -sin * forward * speed, z: -cos * forward * speed },
        { x: cos * strafe * speed, z: -sin * strafe * speed },
      ];
      // No collision on purpose: the viewer walks straight through walls and furniture. A
      // design tool wants to be explored, not navigated, and getting stuck in a doorway or
      // behind a sofa reads as a bug every time. `walkable` still picks the starting spot.
      for (const step of steps) {
        camera.position.x += step.x;
        camera.position.z += step.z;
      }
    }

    camera.position.y = EYE_HEIGHT_M;
    walkEuler.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(walkEuler);
  });

  return null;
}

/** A dim light that follows the camera, so nothing indoors is ever pitch black. */
function Headlamp({ color }: { color: string }) {
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

// ---------------------------------------------------------------------------
// Outline helper
// ---------------------------------------------------------------------------

/** A unit wireframe box, scaled and moved to whatever needs highlighting. */
function makeOutline(): THREE.LineSegments {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const material = new THREE.LineBasicMaterial({
    color: 0xe85d26,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.visible = false;
  // Drawn last and without depth testing, so the outline is never hidden by the item itself.
  line.renderOrder = 999;
  return line;
}

function applyOutline(
  line: THREE.LineSegments,
  item: PlacedItem | null | undefined,
  color: number
): void {
  if (!item) {
    line.visible = false;
    return;
  }
  const pad = 0.03;
  line.visible = true;
  line.position.set(item.position.x, item.elevationM + item.size.height / 2, item.position.z);
  line.rotation.y = item.rotation;
  line.scale.set(item.size.width + pad, item.size.height + pad, item.size.depth + pad);
  (line.material as THREE.LineBasicMaterial).color.setHex(color);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
