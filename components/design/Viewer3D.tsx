'use client';

/**
 * The 3D studio viewport.
 *
 * The scene graph itself is built imperatively by `lib/design3d/buildScene` and mounted here
 * as `<primitive>`s, rather than being expressed as React components. That is on purpose: a
 * furnished flat is several hundred meshes, and rebuilding a React tree of that size on every
 * product swap would be far slower than reconciling a plain Three.js group.
 *
 * React's job here is the camera, the lights, and turning pointer input into selections and
 * drags.
 *
 * Two camera modes share the scene:
 *   - `orbit` — the doll's-house view, with walls facing the camera cut away
 *   - `walk`  — standing inside at eye height, walls and ceilings intact
 */

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  HIDDEN_LAYER,
  OPENING_SLAB_NAME,
  buildRoomShells,
  disposeOwnedGeometry,
  frameFor,
  syncPlacedItems,
  visibleRoomIds,
  type SceneUserData,
} from '@/lib/design3d/buildScene';
import { edgeOf, projectToEdge } from '@/lib/design/openings';
import { pointOnEdge } from '@/lib/design/planGeometry';
import { applyOutline, disposeOutline, makeOutline } from '@/lib/design3d/outline';
import { StyleMaterials } from '@/lib/design3d/materials';
import { getStyle } from '@/lib/design/styles';
import { isPlacementValid, roomAtPoint, snapPlacement, type SnapResult } from '@/lib/design/manipulate';
import type { DesignScene, FloorPlan, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';
import { Headlamp, WalkControls } from './WalkControls';

export type ViewMode = 'orbit' | 'walk';
/** What the pointer edits: furniture (the default) or the doors and windows. */
export type EditMode = 'furniture' | 'openings';

/** Camera actions the studio's overlay buttons call. */
export interface ViewerApi {
  /** Multiplies the camera's distance to its target; < 1 zooms in. */
  zoom: (factor: number) => void;
  /** Frames the whole flat (or the focused room) again. */
  reset: () => void;
  /** Where the item riding on the pointer would land right now, or null when nothing is carried. */
  carryPose: () => { position: Vec2; rotation: number; roomId: string } | null;
}

export interface Viewer3DProps {
  plan: FloorPlan;
  scene: DesignScene;
  focusRoomId?: string | null;
  selectedItemId?: string | null;
  showWalls?: boolean;
  viewMode?: ViewMode;
  editMode?: EditMode;
  /** An item that follows the pointer until it is clicked down — see `designStore.beginAdd`. */
  carryingItemId?: string | null;
  /** The carried item was clicked down somewhere it fits and is placed. */
  onCarryPlaced?: (itemId: string) => void;
  selectedOpeningId?: string | null;
  /** An opening was dragged along its wall to a new `t`. */
  onMoveOpening?: (roomId: string, openingId: string, t: number) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onHoverItem?: (item: PlacedItem | null, screen: { x: number; y: number } | null) => void;
  onSelectItem?: (itemId: string | null) => void;
  /** A click on a room's floor or wall — the studio opens the finish picker for it. */
  onSelectSurface?: (selection: { roomId: string; surface: 'floor' | 'wall' } | null) => void;
  /** Commits a drag. `roomId` is set when the item was dragged into a different room. */
  onPlaceItem?: (itemId: string, position: Vec2, rotation: number, roomId: string) => void;
  /** Receives the camera API once the scene is up; `null` on unmount. */
  onApi?: (api: ViewerApi | null) => void;
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

/** Distance the pointer must travel before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 5;

interface OpeningDragState {
  room: PlanRoom;
  opening: PlanRoom['openings'][number];
  edge: NonNullable<ReturnType<typeof edgeOf>>;
  trim: THREE.Object3D;
  startX: number;
  startY: number;
  moved: boolean;
  t: number;
}

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

type Callbacks = Pick<Viewer3DProps, 'onHoverItem' | 'onSelectItem' | 'onSelectSurface' | 'onPlaceItem' | 'onMoveOpening' | 'onSelectOpening' | 'onCarryPlaced'>;

function SceneContent({
  plan,
  scene,
  focusRoomId = null,
  selectedItemId = null,
  showWalls = true,
  viewMode = 'orbit',
  editMode = 'furniture',
  carryingItemId = null,
  onCarryPlaced,
  selectedOpeningId = null,
  onHoverItem,
  onSelectItem,
  onSelectSurface,
  onPlaceItem,
  onMoveOpening,
  onSelectOpening,
  onApi,
}: Viewer3DProps) {
  const style = getStyle(scene.styleId);
  const { camera, gl } = useThree();
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const walking = viewMode === 'walk';

  /**
   * The parent's callbacks, always current, without being dependencies. The drag listeners
   * below are expensive to re-subscribe, and a parent that passes a fresh arrow function on
   * every render would otherwise re-subscribe them on every render.
   */
  const callbacks = useRef<Callbacks>({});
  callbacks.current = { onHoverItem, onSelectItem, onSelectSurface, onPlaceItem, onMoveOpening, onSelectOpening, onCarryPlaced };
  const editingOpenings = editMode === 'openings';

  // One material factory per style; disposed when the style changes or the viewer unmounts.
  const materials = useMemo(() => new StyleMaterials(style), [style]);
  useEffect(() => () => materials.dispose(), [materials]);

  const shellOptions = useMemo(
    () => ({
      // Inside the flat you want the walls and the ceiling; from outside you want to see in.
      showWalls: walking ? true : showWalls,
      showCeiling: walking,
      onlyRoomId: walking ? null : focusRoomId,
    }),
    [walking, showWalls, focusRoomId]
  );

  // The room shells change only with the plan, the finishes or the style — not with furniture.
  const shell = useMemo(
    () => buildRoomShells(plan, scene.finishes, style, materials, shellOptions),
    [plan, scene.finishes, style, materials, shellOptions]
  );
  useEffect(() => () => disposeOwnedGeometry(shell), [shell]);

  // In openings mode every door and window wears its translucent slab — the handle to
  // grab — and the selected one is a shade stronger. Off the mode they leave the raycast
  // layer entirely, so they can never sit between the pointer and a sofa.
  useEffect(() => {
    shell.traverse((child) => {
      if (child.name !== OPENING_SLAB_NAME || !(child instanceof THREE.Mesh)) return;
      const data = child.parent?.userData as SceneUserData | undefined;
      const selected = !!selectedOpeningId && data?.openingId === selectedOpeningId;
      child.layers.set(editingOpenings ? 0 : HIDDEN_LAYER);
      (child.material as THREE.MeshBasicMaterial).opacity = selected ? 0.55 : 0.28;
    });
  }, [shell, editingOpenings, selectedOpeningId]);

  // The furniture lives in one long-lived group that is reconciled against the item list.
  const itemsGroup = useMemo(() => {
    const group = new THREE.Group();
    group.name = 'items';
    return group;
  }, []);
  useLayoutEffect(() => {
    syncPlacedItems(itemsGroup, scene.items, visibleRoomIds(plan, shellOptions));
  }, [itemsGroup, scene.items, plan, shellOptions]);

  const itemsById = useMemo(
    () => new Map(scene.items.map((item) => [item.id, item])),
    [scene.items]
  );

  // -------------------------------------------------------------------------
  // Selection outlines
  // -------------------------------------------------------------------------

  const outlines = useMemo(() => ({ hover: makeOutline(), active: makeOutline() }), []);
  useEffect(() => {
    const { hover, active } = outlines;
    return () => {
      disposeOutline(hover);
      disposeOutline(active);
    };
  }, [outlines]);

  useEffect(() => {
    if (dragging || carryingItemId) return; // the drag and carry loops drive the outline themselves
    const selected = selectedItemId ? itemsById.get(selectedItemId) : null;
    // A turn that left the piece overlapping something is shown in red until it is dragged
    // somewhere it fits — the same colour a refused drop uses, so it reads as one rule.
    const room = selected ? plan.rooms.find((r) => r.id === selected.roomId) : undefined;
    const fits = !selected || !room || isPlacementValid(room, selected, scene.items);
    applyOutline(outlines.active, selected ?? null, fits ? 0xe85d26 : 0xef4444);
    applyOutline(
      outlines.hover,
      hoveredId && hoveredId !== selectedItemId ? itemsById.get(hoveredId) : null,
      0xf5a623
    );
  }, [outlines, selectedItemId, hoveredId, itemsById, dragging, carryingItemId, plan.rooms, scene.items]);

  /**
   * Carrying: an item just added rides on the pointer. The camera stays put (orbit off), the
   * outline says whether the spot under the pointer fits, and a click sets it down only when
   * it does. Starts by showing where the item is now, so a click without moving still lands.
   */
  useEffect(() => {
    const canvas = gl.domElement;
    if (!carryingItemId) {
      carryRef.current = null;
      return;
    }
    const item = itemsById.get(carryingItemId);
    const room = plan.rooms.find((r) => r.id === item?.roomId);
    if (!item || !room) {
      carryRef.current = null;
      return;
    }
    const initial = snapPlacement(room, item, { position: item.position, rotation: item.rotation }, scene.items);
    carryRef.current = { itemId: carryingItemId, room, result: initial };
    applyOutline(outlines.active, { ...item, position: initial.position, rotation: initial.rotation }, initial.valid ? 0x22c55e : 0xef4444);
    outlines.hover.visible = false;
    const orbit = orbitRef.current;
    if (orbit) orbit.enabled = false;
    canvas.style.cursor = 'crosshair';
    return () => {
      if (orbit) orbit.enabled = true;
      canvas.style.cursor = 'default';
    };
  }, [carryingItemId, itemsById, plan.rooms, scene.items, outlines, gl]);

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

  // The overlay's zoom and frame buttons drive the camera through this.
  useEffect(() => {
    if (!onApi) return;
    const api: ViewerApi = {
      zoom: (factor) => {
        const orbit = orbitRef.current;
        if (!orbit) return;
        const target = orbit.target;
        camera.position.sub(target).multiplyScalar(factor).add(target);
        orbit.update();
      },
      reset: () => {
        const { position, target } = frameFor(plan, focusRoomId);
        camera.position.set(...position);
        const orbit = orbitRef.current;
        if (orbit) {
          orbit.target.set(...target);
          orbit.update();
        }
      },
      carryPose: () => {
        const carry = carryRef.current;
        return carry?.result ? { position: carry.result.position, rotation: carry.result.rotation, roomId: carry.room.id } : null;
      },
    };
    onApi(api);
    return () => onApi(null);
  }, [onApi, camera, plan, focusRoomId]);

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
    shell.traverse((child) => {
      const data = child.userData as SceneUserData;
      if (data?.surface !== 'wall' || !data.outward) return;

      const world = child.getWorldPosition(tempVector3);
      const toCamera = tempVector
        .set(camera.position.x, 0, camera.position.z)
        .sub(tempVector2.set(world.x, 0, world.z));

      // > 0 means the camera sits on the outward side, so this wall is in the way.
      const facing = data.outward.x * toCamera.x + data.outward.z * toCamera.z;
      const visible = facing <= 0.35;
      child.visible = visible;
      // A cut-away wall must not catch the pointer either: the raycaster ignores this layer,
      // so the furniture behind it stays clickable.
      child.layers.set(visible ? 0 : HIDDEN_LAYER);
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
  /** The item riding on the pointer, where it would land, and the press that may set it down. */
  const carryRef = useRef<{ itemId: string; room: PlanRoom; result: SnapResult | null; pressX?: number; pressY?: number } | null>(null);
  /** Moves the carried item to a screen point; set by the pointer effect, called from R3F handlers too. */
  const carryUpdateRef = useRef<((clientX: number, clientY: number) => void) | null>(null);
  const openingDragRef = useRef<OpeningDragState | null>(null);
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
    if (carryRef.current) return; // the carried item owns the pointer
    if (dragRef.current?.moved) return; // the drag loop owns the pointer

    const data = pick(event);
    if (editingOpenings) {
      gl.domElement.style.cursor = data?.pickKind === 'opening' ? 'ew-resize' : 'default';
      if (hoveredId) {
        setHoveredId(null);
        onHoverItem?.(null, null);
      }
      return;
    }
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
    if (carryRef.current || dragRef.current?.moved) return;
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
    if (carryRef.current) {
      // A press while carrying is a candidate "set it down here"; decided on release.
      carryRef.current.pressX = event.clientX;
      carryRef.current.pressY = event.clientY;
      carryUpdateRef.current?.(event.clientX, event.clientY);
      dragRef.current = null;
      surfacePressRef.current = null;
      return;
    }
    const data = pick(event);
    if (editingOpenings) {
      dragRef.current = null;
      surfacePressRef.current = null;
      if (data?.pickKind !== 'opening' || !data.openingId) {
        openingDragRef.current = null;
        return;
      }
      const room = plan.rooms.find((r) => r.id === data.roomId);
      const opening = room?.openings.find((o) => o.id === data.openingId);
      const trim = shell.getObjectByName(`opening-${data.openingId}`);
      if (!room || !opening || !trim) return;
      const edge = edgeOf(room, opening.wallIndex);
      if (!edge) return;
      openingDragRef.current = { room, opening, edge, trim, startX: event.clientX, startY: event.clientY, moved: false, t: opening.t };
      return;
    }
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
    const wrapper = itemsGroup.getObjectByName(`item-${itemId}`);
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
      grab: ground ? { x: item.position.x - ground.x, z: item.position.z - ground.z } : { x: 0, z: 0 },
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

    carryUpdateRef.current = (clientX, clientY) => {
      const carry = carryRef.current;
      if (!carry) return;
      const item = scene.items.find((i) => i.id === carry.itemId);
      const wrapper = itemsGroup.getObjectByName(`item-${carry.itemId}`);
      if (!item || !wrapper) return;
      const ground = floorPoint(clientX, clientY, item.elevationM);
      if (!ground) return;
      // Carrying into a neighbouring room re-homes the item there, like a drag does.
      const room = roomAtPoint(plan.rooms, ground) ?? carry.room;
      carry.room = room;
      const result = snapPlacement(room, item, { position: ground, rotation: item.rotation }, scene.items);
      carry.result = result;
      wrapper.position.set(result.position.x, item.elevationM, result.position.z);
      wrapper.rotation.y = result.rotation;
      applyOutline(outlines.active, { ...item, position: result.position, rotation: result.rotation }, result.valid ? 0x22c55e : 0xef4444);
      outlines.hover.visible = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (carryRef.current && !walking) {
        carryUpdateRef.current?.(event.clientX, event.clientY);
        return;
      }
      const od = openingDragRef.current;
      if (od) {
        if (walking) return;
        const travel = Math.abs(event.clientX - od.startX) + Math.abs(event.clientY - od.startY);
        if (!od.moved) {
          if (travel < DRAG_THRESHOLD_PX) return;
          od.moved = true;
          const orbit = orbitRef.current;
          if (orbit) orbit.enabled = false;
          canvas.style.cursor = 'ew-resize';
        }
        const ground = floorPoint(event.clientX, event.clientY, 0);
        if (!ground) return;
        const t = projectToEdge(od.edge, ground, od.opening.widthM);
        od.t = t;
        // Slide the whole trim (frame, leaf, slab) along the wall as a live preview; the
        // wall's hole follows when the plan commits on release.
        const from = pointOnEdge(od.edge, od.opening.t);
        const to = pointOnEdge(od.edge, t);
        od.trim.position.set(to.x - from.x, 0, to.z - from.z);
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      // Inside the flat, dragging the view takes priority over dragging furniture.
      if (walking) return;

      const travel = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
      if (!drag.moved) {
        if (travel < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        setDragging(true);
        // Stop the camera orbiting while a piece of furniture is in hand.
        const orbit = orbitRef.current;
        if (orbit) orbit.enabled = false;
        canvas.style.cursor = 'grabbing';
        callbacks.current.onHoverItem?.(null, null);
      }

      const ground = floorPoint(event.clientX, event.clientY, drag.item.elevationM);
      if (!ground) return;

      const desired = { x: ground.x + drag.grab.x, z: ground.z + drag.grab.z };
      // Dragging into a neighbouring room re-homes the item there.
      const room = roomAtPoint(plan.rooms, desired) ?? drag.room;
      drag.room = room;

      const result = snapPlacement(room, drag.item, { position: desired, rotation: drag.item.rotation }, scene.items);
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
      const { onSelectSurface, onSelectItem, onPlaceItem, onMoveOpening, onSelectOpening, onCarryPlaced } = callbacks.current;

      const carry = carryRef.current;
      if (carry) {
        const tapped = carry.pressX != null && carry.pressY != null && Math.hypot(event.clientX - carry.pressX, event.clientY - carry.pressY) < 6;
        carry.pressX = undefined;
        carry.pressY = undefined;
        // Only a tap sets the item down, and only where it fits; anywhere else it stays on the pointer.
        if (tapped && carry.result?.valid) {
          onPlaceItem?.(carry.itemId, carry.result.position, carry.result.rotation, carry.room.id);
          onCarryPlaced?.(carry.itemId);
        }
        return;
      }

      const od = openingDragRef.current;
      openingDragRef.current = null;
      if (od) {
        const orbit = orbitRef.current;
        if (orbit) orbit.enabled = true;
        canvas.style.cursor = 'default';
        onSelectOpening?.(od.opening.id);
        if (od.moved && Math.abs(od.t - od.opening.t) > 1e-4) onMoveOpening?.(od.room.id, od.opening.id, od.t);
        else od.trim.position.set(0, 0, 0);
        return;
      }

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
        drag.wrapper.position.set(drag.item.position.x, drag.item.elevationM, drag.item.position.z);
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
  }, [gl, walking, plan.rooms, scene.items, floorPoint, outlines, itemsGroup]);

  // Leaving openings mode drops any preview offset a cancelled drag may have left behind.
  useEffect(() => {
    if (editingOpenings) return;
    openingDragRef.current = null;
  }, [editingOpenings]);

  return (
    <>
      <hemisphereLight args={[style.lighting.ambient, '#8A8078', style.lighting.ambientIntensity]} />
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
        The handlers live on a group React itself created, not on the <primitive>s. R3F only
        registers objects it constructed in its interaction list, so events put directly on a
        <primitive> wrapping a foreign object never fire.
      */}
      <group onPointerMove={handleMove} onPointerOut={handleOut} onPointerDown={handleDown}>
        <primitive object={shell} />
        <primitive object={itemsGroup} />
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
