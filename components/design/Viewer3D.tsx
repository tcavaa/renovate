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
  buildElectrical,
  buildRadiators,
  buildRoomShells,
  disposeOwnedGeometry,
  frameFor,
  syncPlacedItems,
  visibleRoomIds,
  type SceneUserData,
} from '@/lib/design3d/buildScene';
import { buildFitting, lightsFrom } from '@/lib/design3d/buildStructure';
import { ELECTRICAL_KINDS, placeElectrical, wallSpotNear } from '@/lib/design/electrical';
import { wallForEdge, wallLength, wallNormal, wallHeightFor } from '@/lib/design/walls';
import { cellAt, cellPolygon, patchAt, patchSpansOnWall, stripAt, type PaintTarget } from '@/lib/design/paint';
import { roomEdges } from '@/lib/design/planGeometry';
import type { ElementSelection } from '@/store/designStore';
import { edgeOf, projectToEdge } from '@/lib/design/openings';
import { pointOnEdge } from '@/lib/design/planGeometry';
import { applyOutline, disposeOutline, makeOutline } from '@/lib/design3d/outline';
import { tightSpotsByItem } from '@/lib/design/clearance';
import { StyleMaterials } from '@/lib/design3d/materials';
import { getStyle } from '@/lib/design/styles';
import { hangOnWall, isPlacementValid, isWallHung, roomAtPoint, snapPlacement, type SnapResult } from '@/lib/design/manipulate';
import { polygonCentroid, polygonBounds } from '@/lib/design/planGeometry';
import { lightingForHour, type Daylight } from '@/lib/design3d/daylight';
import type { DesignScene, ElectricalKind, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';
import { Headlamp, WalkControls } from './WalkControls';

export type ViewMode = 'orbit' | 'walk';
/**
 * What the pointer edits: furniture (the default), the doors and windows, the structure
 * (walls, columns, beams — moved only when unlocked), the sockets and lights, or the
 * finishes (a click on a floor or a wall opens its picker).
 */
export type EditMode = 'furniture' | 'openings' | 'build' | 'electrical' | 'finishes';

/** Camera actions the studio's overlay buttons call. */
export interface ViewerApi {
  /** Multiplies the camera's distance to its target; < 1 zooms in. */
  zoom: (factor: number) => void;
  /** Frames the whole flat (or the focused room) again. */
  reset: () => void;
  /** Where the item riding on the pointer would land right now, or null when nothing is carried. A wall-hung piece says its height too. */
  carryPose: () => { position: Vec2; rotation: number; roomId: string; elevationM?: number } | null;
  /** The floor point under a screen position and the room it is in, or null off the plane. */
  floorPointAt: (clientX: number, clientY: number) => { position: Vec2; roomId: string | null } | null;
  /**
   * Where a fitting of `kind` would go for a screen position: on the wall the pointer touches
   * (a wall kind) — pointing at the plaster is the natural gesture, and the floor behind it
   * is usually outside the room — else the floor point. Null off the plan.
   */
  fixtureSpotAt: (kind: ElectricalKind, clientX: number, clientY: number) => { position: Vec2; roomId: string } | null;
  /** The id of the fitting already under a screen position, so a click on one is not a new one. */
  electricalAt: (clientX: number, clientY: number) => string | null;
  /**
   * Moves the carried item to a screen position and sets it down there when it fits.
   * Returns false when nothing is carried or the spot does not fit (the item stays on the
   * pointer so the person can move it somewhere it does).
   */
  dropCarriedAt: (clientX: number, clientY: number) => boolean;
  /** Moves the carried item under a screen position without setting it down (a drag from the shelf). */
  moveCarriedTo: (clientX: number, clientY: number) => void;
  /**
   * Shows a ghost of an electrical fitting where it would land under a screen position —
   * snapped to the nearest wall at its usual height — while a tile is dragged over the view.
   * Returns false when the position is off the plan.
   */
  previewElectricalAt: (kind: ElectricalKind, clientX: number, clientY: number) => boolean;
  clearElectricalPreview: () => void;
  /** The current frame as a PNG data URL, or null when the canvas cannot be read. */
  screenshot: () => string | null;
  /** Where the camera is, for keeping with a photo. */
  cameraPose: () => { position: [number, number, number]; target: [number, number, number] };
}

export interface Viewer3DProps {
  plan: FloorPlan;
  scene: DesignScene;
  focusRoomId?: string | null;
  selectedItemId?: string | null;
  showWalls?: boolean;
  viewMode?: ViewMode;
  editMode?: EditMode;
  /** Hour on a 24-hour clock that sets the sun, the sky and whether the lamps are on. */
  daylightHour?: number;
  /** An item that follows the pointer until it is clicked down — see `designStore.beginAdd`. */
  carryingItemId?: string | null;
  /** The carried item was clicked down somewhere it fits and is placed. */
  onCarryPlaced?: (itemId: string) => void;
  selectedOpeningId?: string | null;
  /** An opening was dragged along its wall to a new `t`. */
  onMoveOpening?: (roomId: string, openingId: string, t: number) => void;
  onSelectOpening?: (openingId: string | null) => void;
  /** Sockets, switches and lights; drawn as fittings, and the lights that are on light the rooms. */
  electrical?: ElectricalPoint[];
  /** Walls, doors, windows, columns and beams stay where they are until unlocked. */
  structureLocked?: boolean;
  selectedElement?: ElementSelection;
  /** A wall, column, beam, socket or zone was picked (or the selection cleared). */
  onSelectElement?: (selection: ElementSelection) => void;
  /** A wall was dragged sideways by `distance` metres along its normal (see `wallNormal`). */
  onOffsetWall?: (wallId: string, distance: number) => void;
  onMoveColumn?: (columnId: string, position: Vec2) => void;
  onMoveElectrical?: (electricalId: string, position: Vec2) => void;
  onHoverItem?: (item: PlacedItem | null, screen: { x: number; y: number } | null) => void;
  onSelectItem?: (itemId: string | null) => void;
  /** A click on a room's floor or wall — the studio opens the finish picker for it. */
  onSelectSurface?: (selection: { roomId: string; surface: 'floor' | 'wall'; wallIndex?: number } | null) => void;
  /**
   * Painting a piece at a time (finishes mode): `cell` lights up the square metre of floor
   * under the pointer, `strip` the metre of wall, and a click hands it to `onPaint` instead
   * of selecting the surface.
   */
  paintScope?: 'cell' | 'strip' | 'patch' | null;
  onPaint?: (target: PaintTarget) => void;
  /** Commits a drag. `roomId` is set when the item was dragged into a different room; `elevationM` when a wall-hung piece was hung at a height. */
  onPlaceItem?: (itemId: string, position: Vec2, rotation: number, roomId: string, elevationM?: number) => void;
  /**
   * When this changes the camera frames the flat again. It is the *plan's identity*
   * (`designStore.planSerial`), not the plan object: a door slid along its wall, a wall
   * dragged or a technical point moved makes a new plan object every time, and framing on
   * that threw the person's view away mid-edit — they lined the camera up on a door, moved
   * it a centimetre, and were back at the doll's-house view.
   */
  frameKey?: unknown;
  /** Receives the camera API once the scene is up; `null` on unmount. */
  onApi?: (api: ViewerApi | null) => void;
  className?: string;
}

export function Viewer3D(props: Viewer3DProps) {
  const style = getStyle(props.scene.styleId);
  const daylight = useMemo(() => lightingForHour(props.daylightHour ?? 13, style), [props.daylightHour, style]);

  return (
    <div className={props.className}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 48, near: 0.05, far: 200 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = daylight.exposure;
        }}
        onPointerMissed={() => {
          props.onSelectItem?.(null);
          props.onSelectSurface?.(null);
        }}
      >
        <color attach="background" args={[daylight.background]} />
        <fog attach="fog" args={[daylight.background, 34, 90]} />
        <Suspense fallback={null}>
          <SceneContent {...props} daylight={daylight} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Physical keys, so W is W on a Georgian layout too (it types წ there).
const PAN_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** Metres per second the view slides at; shift doubles it. */
const PAN_SPEED = 3.2;

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

interface WallDragState {
  wallId: string;
  normal: Vec2;
  start: Vec2;
  distance: number;
  moved: boolean;
  ghost: THREE.Mesh;
}

interface PointDragState {
  what: 'column' | 'electrical';
  id: string;
  object: THREE.Object3D;
  origin: THREE.Vector3;
  originYaw: number;
  start: Vec2;
  position: Vec2;
  moved: boolean;
  /** A fitting sliding along its walls: `position` is where it is, not an offset. */
  absolute: boolean;
}

interface DragState {
  itemId: string;
  item: PlacedItem;
  wrapper: THREE.Object3D;
  /** Offset from the pointer's floor position to the item's origin, so it doesn't jump. */
  grab: Vec2;
  /** A wall-hung piece grabbed off its centre: how far its centre stands from the pointer along its wall and up it, so it does not jump into the hand. */
  hang?: { roomId: string; wallIndex: number; along: number; up: number };
  startX: number;
  startY: number;
  moved: boolean;
  result: SnapResult | null;
  room: PlanRoom;
}

type Callbacks = Pick<Viewer3DProps, 'onHoverItem' | 'onSelectItem' | 'onSelectSurface' | 'onPlaceItem' | 'onMoveOpening' | 'onSelectOpening' | 'onCarryPlaced' | 'onSelectElement' | 'onOffsetWall' | 'onMoveColumn' | 'onMoveElectrical' | 'onPaint'>;

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
  electrical = [],
  structureLocked = true,
  selectedElement = null,
  onSelectElement,
  onOffsetWall,
  onMoveColumn,
  onMoveElectrical,
  onHoverItem,
  onSelectItem,
  onSelectSurface,
  paintScope = null,
  onPaint,
  onPlaceItem,
  onMoveOpening,
  onSelectOpening,
  frameKey,
  onApi,
  daylight,
}: Viewer3DProps & { daylight: Daylight }) {
  const style = getStyle(scene.styleId);
  const { camera, gl, scene: threeScene } = useThree();
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const walking = viewMode === 'walk';

  // Exposure follows the hour: a touch over 1 by day, well under at night.
  useEffect(() => {
    gl.toneMappingExposure = daylight.exposure;
  }, [gl, daylight.exposure]);

  // -------------------------------------------------------------------------
  // Keyboard panning (orbit view)
  // -------------------------------------------------------------------------

  /**
   * WASD and the arrows slide the view across the flat. The camera and its orbit target move
   * together along the camera's own forward and right, projected onto the floor, so "W"
   * always means "up the screen" whichever way the view has been turned.
   */
  const panKeys = useRef(new Set<string>());
  useEffect(() => {
    if (walking) return;
    const pressed = panKeys.current;
    // The mouse: drag turns the view (either button), the wheel zooms, the middle button
    // pans. While Space is held a drag pans instead, while Shift is held it moves through
    // the space (dolly) — the scheme the studio's help card describes.
    const setButtons = (left: number) => {
      const orbit = orbitRef.current;
      if (orbit) orbit.mouseButtons = { LEFT: left, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    };
    setButtons(THREE.MOUSE.ROTATE);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)) return;
      if (event.code === 'Space') {
        setButtons(THREE.MOUSE.PAN);
        event.preventDefault();
        return;
      }
      if (event.key === 'Shift') {
        setButtons(THREE.MOUSE.DOLLY);
        return;
      }
      if (!PAN_KEYS.has(event.code)) return;
      pressed.add(event.code);
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === 'Shift') setButtons(THREE.MOUSE.ROTATE);
      pressed.delete(event.code);
    };
    const onBlur = () => {
      pressed.clear();
      setButtons(THREE.MOUSE.ROTATE);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
    };
  }, [walking]);

  useFrame((_, delta) => {
    if (walking) return;
    const pressed = panKeys.current;
    if (pressed.size === 0) return;
    const forward = (pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0) - (pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0);
    const right = (pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0) - (pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0);
    if (forward === 0 && right === 0) return;
    const fast = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
    const step = PAN_SPEED * (fast ? 2 : 1) * Math.min(delta, 0.05);
    // Camera forward on the floor plane; right is perpendicular to it.
    camera.getWorldDirection(tempVector);
    tempVector.y = 0;
    if (tempVector.lengthSq() < 1e-6) tempVector.set(0, 0, -1);
    tempVector.normalize();
    tempVector2.set(-tempVector.z, 0, tempVector.x);
    tempVector3.set(0, 0, 0).addScaledVector(tempVector, forward * step).addScaledVector(tempVector2, right * step);
    camera.position.add(tempVector3);
    const orbit = orbitRef.current;
    if (orbit) {
      orbit.target.add(tempVector3);
      orbit.update();
    }
  });

  /**
   * The parent's callbacks, always current, without being dependencies. The drag listeners
   * below are expensive to re-subscribe, and a parent that passes a fresh arrow function on
   * every render would otherwise re-subscribe them on every render.
   */
  const callbacks = useRef<Callbacks>({});
  callbacks.current = { onHoverItem, onSelectItem, onSelectSurface, onPlaceItem, onMoveOpening, onSelectOpening, onCarryPlaced, onSelectElement, onOffsetWall, onMoveColumn, onMoveElectrical, onPaint };
  // Doors and windows are grabbed in openings mode, and in build mode once unlocked.
  const editingOpenings = editMode === 'openings' || (editMode === 'build' && !structureLocked);
  const building = editMode === 'build';
  const wiring = editMode === 'electrical';
  const finishing = editMode === 'finishes';

  // One material factory per style; disposed when the style changes or the viewer unmounts.
  const materials = useMemo(() => new StyleMaterials(style), [style]);
  useEffect(() => () => materials.dispose(), [materials]);

  // At night the windows glow: every pane shares one glass material, so lighting it up
  // lights every window in the flat at once — which, seen from outside, is the point.
  useEffect(() => {
    const glass = materials.get('glass');
    if (daylight.interiorLightsOn) {
      glass.emissive = new THREE.Color(style.lighting.lamp);
      glass.emissiveIntensity = 0.55 * daylight.interiorIntensity;
      glass.opacity = 0.5;
    } else {
      glass.emissive = new THREE.Color('#000000');
      glass.emissiveIntensity = 0;
      glass.opacity = 0.28;
    }
    glass.needsUpdate = true;
  }, [materials, daylight.interiorLightsOn, daylight.interiorIntensity, style.lighting.lamp]);

  // One lamp per room when the flat's lights are on, hung just under the ceiling and sized
  // to the room so a hallway is not lit like a living room.
  const roomLamps = useMemo(
    () =>
      plan.rooms.map((room) => {
        const centre = polygonCentroid(room.polygon);
        const bounds = polygonBounds(room.polygon);
        const span = Math.max(bounds.width, bounds.depth, 2);
        return { id: room.id, position: [centre.x, Math.max(1.8, room.heightM - 0.35), centre.z] as [number, number, number], distance: span * 1.6, intensity: 6 + room.areaM2 * 0.9 };
      }),
    [plan.rooms]
  );

  // The electrical layer's fittings, rebuilt when the layer or the plan changes; the lights
  // that are switched on become point lights below.
  const shellOptions = useMemo(
    () => ({
      // Inside the flat you want the walls and the ceiling; from outside you want to see in.
      showWalls: walking ? true : showWalls,
      showCeiling: walking,
      onlyRoomId: walking ? null : focusRoomId,
    }),
    [walking, showWalls, focusRoomId]
  );
  // With one room in focus the others are gone — their fittings, lights and warnings too.
  const roomFilter = useMemo(() => visibleRoomIds(plan, shellOptions), [plan, shellOptions]);
  const hangingLamps = useMemo(() => scene.items.filter((i) => i.slot === 'pendant'), [scene.items]);
  const electricalGroup = useMemo(() => buildElectrical(plan, electrical, materials, { rooms: roomFilter, items: hangingLamps }), [plan, electrical, materials, roomFilter, hangingLamps]);
  useEffect(() => () => disposeOwnedGeometry(electricalGroup), [electricalGroup]);
  const sceneLights = useMemo(() => lightsFrom(plan, electrical, roomFilter), [plan, electrical, roomFilter]);
  // The radiators hang on the plan's technical points; they change with the plan alone.
  const radiatorGroup = useMemo(() => buildRadiators(plan, style, roomFilter), [plan, style, roomFilter]);

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

  // Tight passages: an amber box around every piece a person could not get past. One outline
  // per flagged item, rebuilt when the furniture changes; the pool is disposed with the scene.
  const warnings = useMemo(() => new THREE.Group(), []);
  useEffect(() => {
    for (const child of [...warnings.children]) {
      warnings.remove(child);
      disposeOutline(child as THREE.LineSegments);
    }
    if (walking) return;
    const flagged = tightSpotsByItem(plan.rooms, scene.items);
    for (const item of scene.items) {
      if (!flagged.has(item.id) || !item.product) continue;
      if (roomFilter && !roomFilter.has(item.roomId)) continue;
      const line = makeOutline();
      applyOutline(line, item, 0xf59e0b);
      warnings.add(line);
    }
  }, [warnings, plan.rooms, scene.items, walking, roomFilter]);
  useEffect(() => () => warnings.children.forEach((c) => disposeOutline(c as THREE.LineSegments)), [warnings]);

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

  /** The room surface — floor or wall — under a screen position, with the point hit and the face's normal. */
  const surfaceAt = useCallback(
    (clientX: number, clientY: number): { data: SceneUserData; point: THREE.Vector3; normal: THREE.Vector3 | null } | null => {
      const rect = gl.domElement.getBoundingClientRect();
      dragNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      dragRaycaster.setFromCamera(dragNdc, camera);
      // The cut-away walls live on the hidden layer, which the raycaster does not test.
      for (const hit of dragRaycaster.intersectObject(shell, true)) {
        const data = hit.object.userData as SceneUserData | undefined;
        if (data?.pickKind === 'surface' && data.roomId && (data.surface === 'wall' || data.surface === 'floor')) return { data, point: hit.point, normal: hit.face?.normal ?? null };
      }
      return null;
    },
    [camera, gl, shell]
  );

  /**
   * What of the room itself lies under a screen position — a floor, a wall, a zone — seen
   * straight through the furniture, the fittings and the doors. The finishes mode picks with
   * this and nothing else, so while walls and floors are being painted nothing else in the
   * flat can be clicked or selected.
   */
  const shellHitAt = useCallback(
    (clientX: number, clientY: number): { data: SceneUserData; point: THREE.Vector3; normal: THREE.Vector3 | null } | null => {
      const rect = gl.domElement.getBoundingClientRect();
      dragNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      dragRaycaster.setFromCamera(dragNdc, camera);
      for (const hit of dragRaycaster.intersectObject(shell, true)) {
        const data = hit.object.userData as SceneUserData | undefined;
        if (!data?.roomId) continue;
        if (data.pickKind === 'zone' || (data.pickKind === 'surface' && (data.surface === 'wall' || data.surface === 'floor'))) return { data, point: hit.point, normal: hit.face?.normal ?? null };
      }
      return null;
    },
    [camera, gl, shell]
  );

  /**
   * The fitting already standing under a screen position, if any. The page asks before it
   * puts an armed one down: a click on a socket that is already on the wall means "this
   * one", not "another one on top of it".
   */
  const electricalAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const rect = gl.domElement.getBoundingClientRect();
      dragNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      dragRaycaster.setFromCamera(dragNdc, camera);
      for (const hit of dragRaycaster.intersectObject(electricalGroup, true)) {
        // `tag` stamps the subtree as it stands, and a fitting's model is added to it a
        // beat later when its file arrives — so the meshes actually hit are usually
        // untagged. The id is on one of their forebears; walk up until it turns up.
        for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
          const id = (node.userData as SceneUserData | undefined)?.electricalId;
          if (id) return id;
          if (node === electricalGroup) break;
        }
      }
      return null;
    },
    [camera, gl, electricalGroup]
  );

  /**
   * Whose wall a hit on a wall is. Its room face is the room's own. Its far face — which
   * the camera only meets from the other side — belongs to the room standing behind that
   * stretch of it (`wallFrame.behind`), so the wall that gets painted is always the one
   * that was looked at.
   */
  const wallSideOf = useCallback((data: SceneUserData, point: THREE.Vector3, normal: THREE.Vector3 | null): { roomId: string; wallIndex: number | undefined } => {
    const own = { roomId: data.roomId, wallIndex: data.wallIndex };
    const frame = data.wallFrame;
    if (!frame || !data.outward || !normal) return own;
    if (normal.x * data.outward.x + normal.z * data.outward.z < 0.5) return own;
    const s = (point.x - frame.a.x) * frame.dir.x + (point.z - frame.a.z) * frame.dir.z;
    const behind = frame.behind.find((b) => s >= b.from - 1e-3 && s <= b.to + 1e-3);
    return behind ? { roomId: behind.roomId, wallIndex: behind.wallIndex } : own;
  }, []);

  /**
   * The wall face under a screen position, for hanging a piece on: the room it belongs to
   * (its own side, or the room behind a far face — `wallSideOf`), the wall, the spot and the
   * height the pointer met it at. Null over the floor, the furniture or nothing at all.
   */
  const hangTargetAt = useCallback(
    (clientX: number, clientY: number): { room: PlanRoom; wallIndex: number; at: Vec2; y: number } | null => {
      const hit = surfaceAt(clientX, clientY);
      if (!hit || hit.data.surface !== 'wall') return null;
      const side = wallSideOf(hit.data, hit.point, hit.normal);
      const room = plan.rooms.find((r) => r.id === side.roomId);
      if (!room || side.wallIndex == null) return null;
      return { room, wallIndex: side.wallIndex, at: { x: hit.point.x, z: hit.point.z }, y: hit.point.y };
    },
    [surfaceAt, wallSideOf, plan.rooms]
  );

  /** The floor tile or wall strip a screen position would paint, for the scope in hand. */
  const paintTargetAt = useCallback(
    (clientX: number, clientY: number): PaintTarget | null => {
      if (!paintScope) return null;
      const hit = shellHitAt(clientX, clientY);
      if (!hit) return null;
      // A drawn zone lies on the floor: a tile is painted over it like anywhere else.
      if (hit.data.pickKind === 'zone' && paintScope !== 'cell') return null;
      const spot = { x: hit.point.x, z: hit.point.z };
      if (paintScope === 'cell') {
        if (hit.data.surface === 'wall') return null;
        const room = plan.rooms.find((r) => r.id === hit.data.roomId);
        const cell = room ? cellAt(room, spot) : null;
        return room && cell ? { roomId: room.id, surface: 'floor', cell } : null;
      }
      if (hit.data.surface !== 'wall') return null;
      const side = wallSideOf(hit.data, hit.point, hit.normal);
      const room = plan.rooms.find((r) => r.id === side.roomId);
      const edge = room && side.wallIndex != null ? roomEdges(room.polygon).find((e) => e.index === side.wallIndex) : null;
      if (!room || !edge) return null;
      const s = Math.max(0, Math.min(edge.length, (spot.x - edge.a.x) * edge.dir.x + (spot.z - edge.a.z) * edge.dir.z));
      const span = stripAt(edge, s);
      // The one scope that reads the height of the click: a square metre of wall, not a
      // strip of it floor to ceiling.
      if (paintScope === 'patch') {
        const y = Math.max(0, Math.min(room.heightM, hit.point.y));
        return { roomId: room.id, surface: 'wall', wallIndex: edge.index, span, patch: patchAt(edge, room.heightM, s, y) };
      }
      return { roomId: room.id, surface: 'wall', wallIndex: edge.index, span };
    },
    [paintScope, shellHitAt, wallSideOf, plan.rooms]
  );

  /** The tile or strip under the pointer, lit up while painting. */
  const paintGlow = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xe85d26, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
    mesh.visible = false;
    mesh.renderOrder = 7;
    mesh.userData.key = '';
    return mesh;
  }, []);
  useEffect(
    () => () => {
      paintGlow.geometry.dispose();
      (paintGlow.material as THREE.Material).dispose();
    },
    [paintGlow]
  );
  const showPaintGlow = useCallback(
    (target: PaintTarget | null) => {
      const key = !target ? '' : target.surface === 'floor' ? `${target.roomId}|f|${target.cell[0]}|${target.cell[1]}` : `${target.roomId}|w|${target.wallIndex}|${target.patch ? target.patch.join(',') : target.span.from}`;
      if (paintGlow.userData.key === key) return;
      paintGlow.userData.key = key;
      const room = target ? plan.rooms.find((r) => r.id === target.roomId) : null;
      if (!target || !room) {
        paintGlow.visible = false;
        return;
      }
      const positions: number[] = [];
      if (target.surface === 'floor') {
        // A fan over the tile's outline (a square clipped to the room is convex, or near enough).
        const outline = cellPolygon(room, target.cell);
        for (let i = 1; i + 1 < outline.length; i++) for (const p of [outline[0], outline[i], outline[i + 1]]) positions.push(p.x, 0.02, p.z);
      } else {
        const edge = roomEdges(room.polygon).find((e) => e.index === target.wallIndex);
        if (edge) {
          const at = (along: number, y: number) => [edge.a.x + edge.dir.x * along + edge.inward.x * 0.012, y, edge.a.z + edge.dir.z * along + edge.inward.z * 0.012];
          // A strip is the whole height of the wall — this wall's, which may have been given
          // one of its own — and a patch is one square metre of it.
          const wallTop = wallHeightFor(plan, wallForEdge(plan, room, edge), room);
          const box = target.patch ? patchSpansOnWall(edge, room.heightM, wallTop, target.patch) : { along: target.span, up: { from: 0, to: wallTop } };
          if (box) {
            const { from, to } = box.along;
            const [low, high] = [box.up.from, box.up.to];
            positions.push(...at(from, low), ...at(to, low), ...at(to, high), ...at(from, low), ...at(to, high), ...at(from, high));
          }
        }
      }
      paintGlow.geometry.dispose();
      paintGlow.geometry = new THREE.BufferGeometry();
      paintGlow.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      paintGlow.visible = positions.length > 0;

    },
    [paintGlow, plan]
  );
  // Leaving the paint scope, or a plan that changed under the glow, puts it out.
  useEffect(() => {
    if (!paintScope || editMode !== 'finishes') showPaintGlow(null);
  }, [paintScope, editMode, showPaintGlow, plan]);

  /** Where a fitting of `kind` goes for a screen position: the wall under the pointer, else the floor. */
  const fixtureSpotAt = useCallback(
    (kind: ElectricalKind, clientX: number, clientY: number): { position: Vec2; roomId: string } | null => {
      if (ELECTRICAL_KINDS[kind].placement === 'wall') {
        const hit = surfaceAt(clientX, clientY);
        if (hit?.data.surface === 'wall') return { position: { x: hit.point.x, z: hit.point.z }, roomId: hit.data.roomId };
      }
      const point = floorPoint(clientX, clientY, 0);
      const room = point ? roomAtPoint(plan.rooms, point) : null;
      if (point && room) return { position: point, roomId: room.id };
      // Pointing at a wall from outside the room's floor: the wall still says which room.
      const hit = surfaceAt(clientX, clientY);
      return hit ? { position: { x: hit.point.x, z: hit.point.z }, roomId: hit.data.roomId } : null;
    },
    [surfaceAt, floorPoint, plan.rooms]
  );

  /** The ghost fitting shown while an electrical tile is dragged over the view. */
  const previewRef = useRef<THREE.Group | null>(null);
  const clearPreview = useCallback(() => {
    const ghost = previewRef.current;
    if (!ghost) return;
    previewRef.current = null;
    threeScene.remove(ghost);
    disposeOwnedGeometry(ghost);
  }, [threeScene]);
  useEffect(() => () => clearPreview(), [clearPreview]);

  // -------------------------------------------------------------------------
  // Camera framing
  // -------------------------------------------------------------------------

  // The plan, readable by the framing effect without being a dependency of it: editing the
  // flat must not move the camera (see `frameKey`).
  const planRef = useRef(plan);
  planRef.current = plan;
  useEffect(() => {
    if (walking) return;
    const { position, target } = frameFor(planRef.current, focusRoomId);
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
    // A new flat, a different room in focus, or stepping out of the walk-through.
  }, [frameKey, focusRoomId, camera, walking]);

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
        const { position, target } = frameFor(planRef.current, focusRoomId);
        camera.position.set(...position);
        const orbit = orbitRef.current;
        if (orbit) {
          orbit.target.set(...target);
          orbit.update();
        }
      },
      carryPose: () => {
        const carry = carryRef.current;
        return carry?.result ? { position: carry.result.position, rotation: carry.result.rotation, roomId: carry.room.id, elevationM: carry.result.elevationM } : null;
      },
      floorPointAt: (clientX, clientY) => {
        const point = floorPoint(clientX, clientY, 0);
        if (!point) return null;
        return { position: point, roomId: roomAtPoint(plan.rooms, point)?.id ?? null };
      },
      dropCarriedAt: (clientX, clientY) => {
        const carry = carryRef.current;
        if (!carry) return false;
        carryUpdateRef.current?.(clientX, clientY);
        if (!carry.result?.valid) return false;
        callbacks.current.onPlaceItem?.(carry.itemId, carry.result.position, carry.result.rotation, carry.room.id, carry.result.elevationM);
        callbacks.current.onCarryPlaced?.(carry.itemId);
        return true;
      },
      moveCarriedTo: (clientX, clientY) => carryUpdateRef.current?.(clientX, clientY),
      fixtureSpotAt,
      electricalAt,
      previewElectricalAt: (kind, clientX, clientY) => {
        const spot = fixtureSpotAt(kind, clientX, clientY);
        const room = spot ? plan.rooms.find((r) => r.id === spot.roomId) : null;
        if (!spot || !room) {
          clearPreview();
          return false;
        }
        const placed = placeElectrical(room, kind, spot.position, 'preview');
        const ghost = buildFitting(room, placed, materials, { preview: true });
        clearPreview();
        if (!ghost) return false;
        ghost.renderOrder = 6;
        threeScene.add(ghost);
        previewRef.current = ghost;
        return true;
      },
      clearElectricalPreview: clearPreview,
      screenshot: () => {
        try {
          // Render first: without `preserveDrawingBuffer` the canvas is blank between frames.
          gl.render(threeScene, camera);
          return gl.domElement.toDataURL('image/png');
        } catch {
          return null;
        }
      },
      cameraPose: () => {
        const target = orbitRef.current?.target ?? new THREE.Vector3();
        return { position: [camera.position.x, camera.position.y, camera.position.z], target: [target.x, target.y, target.z] };
      },
    };
    onApi(api);
    return () => onApi(null);
  }, [onApi, camera, gl, threeScene, plan, focusRoomId, floorPoint, fixtureSpotAt, electricalAt, materials, clearPreview]);

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
  // Everything that stands with a wall — the wall, its skirting board and cornice — found
  // once per shell rather than by walking the whole graph every frame.
  const wallParts = useMemo(() => {
    const parts: Array<{ object: THREE.Object3D; outward: { x: number; z: number }; mid: { x: number; z: number } }> = [];
    shell.traverse((child) => {
      const data = child.userData as SceneUserData;
      if (data?.surface === 'wall' && data.outward && data.wallFrame && child instanceof THREE.Mesh) parts.push({ object: child, outward: data.outward, mid: data.wallFrame.mid });
    });
    return parts;
  }, [shell]);

  useFrame(() => {
    for (const part of wallParts) {
      // How far the camera stands beyond the wall's own face, on its outward side; > 0 means
      // this wall is between the camera and its room. Measured from the wall — its mesh sits
      // at the origin with the geometry in world coordinates, and measuring from *there*
      // hid whichever half of a shared wall faced away from the plan's corner, so up close
      // the camera saw the back of the other room's half, and a click painted that room.
      const facing = part.outward.x * (camera.position.x - part.mid.x) + part.outward.z * (camera.position.z - part.mid.z);
      const visible = facing <= 0.35;
      part.object.visible = visible;
      // A cut-away wall must not catch the pointer either: the raycaster ignores this layer,
      // so the furniture behind it stays clickable.
      part.object.layers.set(visible ? 0 : HIDDEN_LAYER);
    }
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
  const surfacePressRef = useRef<{ roomId: string; surface: 'floor' | 'wall'; wallIndex?: number; x: number; y: number; paint?: PaintTarget | null } | null>(null);
  const wallDragRef = useRef<WallDragState | null>(null);
  const pointDragRef = useRef<PointDragState | null>(null);

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    if (carryRef.current) return; // the carried item owns the pointer
    if (dragRef.current?.moved) return; // the drag loop owns the pointer

    const data = pick(event);
    if (building) {
      const structural = data?.pickKind === 'wall' || data?.pickKind === 'column' || data?.pickKind === 'beam' || data?.pickKind === 'opening' || (data?.pickKind === 'surface' && data.surface === 'wall' && !!data.wallId);
      gl.domElement.style.cursor = structural ? (structureLocked ? 'pointer' : 'move') : 'default';
      if (hoveredId) {
        setHoveredId(null);
        onHoverItem?.(null, null);
      }
      return;
    }
    if (wiring || (data?.pickKind === 'electrical' && !building && !finishing)) {
      gl.domElement.style.cursor = data?.pickKind === 'electrical' ? 'move' : 'default';
      if (hoveredId) {
        setHoveredId(null);
        onHoverItem?.(null, null);
      }
      return;
    }
    if (editingOpenings) {
      gl.domElement.style.cursor = data?.pickKind === 'opening' ? 'ew-resize' : 'default';
      if (hoveredId) {
        setHoveredId(null);
        onHoverItem?.(null, null);
      }
      return;
    }
    if (finishing) {
      // Only the room itself answers while it is being painted; the furniture is looked through.
      gl.domElement.style.cursor = shellHitAt(event.clientX, event.clientY) ? (paintScope ? 'crosshair' : 'pointer') : 'default';
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

    // Finishes: the pointer sees floors, walls and zones and nothing else — not the sofa in
    // front of the wall, not a socket on it, not a door. A tap paints (in a paint scope) or
    // chooses the surface; which of the two is decided on release.
    if (finishing) {
      dragRef.current = null;
      openingDragRef.current = null;
      surfacePressRef.current = null;
      const hit = shellHitAt(event.clientX, event.clientY);
      if (!hit) return;
      const paint = paintScope ? paintTargetAt(event.clientX, event.clientY) : null;
      if (paintScope) {
        // With the brush in hand a tap paints or does nothing: a tap that lands on a wall
        // while the floor is being painted must not drop the brush and select the wall.
        if (paint) surfacePressRef.current = { roomId: paint.roomId, surface: paint.surface, x: event.clientX, y: event.clientY, paint };
        return;
      }
      if (hit.data.pickKind === 'zone' && !paint) {
        if (hit.data.zoneId) callbacks.current.onSelectElement?.({ kind: 'zone', id: hit.data.zoneId, roomId: hit.data.roomId });
        return;
      }
      if (hit.data.surface !== 'floor' && hit.data.surface !== 'wall') return;
      const side = hit.data.surface === 'wall' ? wallSideOf(hit.data, hit.point, hit.normal) : { roomId: hit.data.roomId, wallIndex: undefined };
      surfacePressRef.current = { roomId: side.roomId, surface: hit.data.surface, wallIndex: side.wallIndex, x: event.clientX, y: event.clientY, paint };
      return;
    }

    // Build mode: walls, columns and beams are picked, and dragged when unlocked.
    if (building && data && (data.pickKind === 'wall' || data.pickKind === 'column' || data.pickKind === 'beam' || (data.pickKind === 'surface' && data.surface === 'wall' && data.wallId))) {
      dragRef.current = null;
      surfacePressRef.current = null;
      openingDragRef.current = null;
      if (data.pickKind === 'beam' && data.beamId) {
        callbacks.current.onSelectElement?.({ kind: 'beam', id: data.beamId });
        return;
      }
      if (data.pickKind === 'column' && data.columnId) {
        callbacks.current.onSelectElement?.({ kind: 'column', id: data.columnId });
        const column = plan.columns?.find((c) => c.id === data.columnId);
        const object = event.object;
        if (!structureLocked && column && !column.locked) {
          pointDragRef.current = { what: 'column', id: column.id, object, origin: object.position.clone(), originYaw: object.rotation.y, start: floorPoint(event.clientX, event.clientY, 0) ?? column.position, position: column.position, moved: false, absolute: false };
        }
        return;
      }
      const wallId = data.wallId;
      if (!wallId) return;
      callbacks.current.onSelectElement?.({ kind: 'wall', id: wallId });
      const wall = plan.walls?.find((w) => w.id === wallId);
      if (!structureLocked && wall && !wall.locked) {
        const start = floorPoint(event.clientX, event.clientY, 0);
        if (!start) return;
        // A translucent slab the wall's size, shown where the wall would land.
        const length = wallLength(wall);
        const height = wallHeightFor(plan, wall);
        const ghost = new THREE.Mesh(new THREE.BoxGeometry(length, height, wall.thicknessM), new THREE.MeshBasicMaterial({ color: 0xe85d26, transparent: true, opacity: 0.35, depthWrite: false }));
        ghost.position.set((wall.a.x + wall.b.x) / 2, height / 2, (wall.a.z + wall.b.z) / 2);
        ghost.rotation.y = -Math.atan2(wall.b.z - wall.a.z, wall.b.x - wall.a.x);
        ghost.visible = false;
        ghost.renderOrder = 6;
        threeScene.add(ghost);
        wallDragRef.current = { wallId, normal: wallNormal(wall), start, distance: 0, moved: false, ghost };
      }
      return;
    }

    // Sockets and lights: picked in any mode, dragged in electrical mode.
    if (data?.pickKind === 'electrical' && data.electricalId) {
      dragRef.current = null;
      surfacePressRef.current = null;
      openingDragRef.current = null;
      callbacks.current.onSelectElement?.({ kind: 'electrical', id: data.electricalId });
      const point = electrical.find((p) => p.id === data.electricalId);
      if ((wiring || !building) && point && !point.locked) {
        const object = electricalGroup.getObjectByName(`electrical-${point.id}`);
        const start = floorPoint(event.clientX, event.clientY, 0);
        if (object && start) pointDragRef.current = { what: 'electrical', id: point.id, object, origin: object.position.clone(), originYaw: object.rotation.y, start, position: point.position, moved: false, absolute: false };
      }
      return;
    }

    // A radiator: picked like a fitting; it is moved on the plan, its card counts its sections.
    if (data?.pickKind === 'technical' && data.technicalId) {
      dragRef.current = null;
      surfacePressRef.current = null;
      openingDragRef.current = null;
      callbacks.current.onSelectElement?.({ kind: 'technical', id: data.technicalId });
      return;
    }

    // A floor zone with its own finish.
    if (data?.pickKind === 'zone' && data.zoneId && data.roomId) {
      dragRef.current = null;
      surfacePressRef.current = null;
      callbacks.current.onSelectElement?.({ kind: 'zone', id: data.zoneId, roomId: data.roomId });
      return;
    }

    if (editingOpenings) {
      dragRef.current = null;
      surfacePressRef.current = null;
      if (data?.pickKind !== 'opening' || !data.openingId) {
        openingDragRef.current = null;
        if (!building) return;
      }
      if (data?.pickKind === 'opening' && data.openingId) {
        const room = plan.rooms.find((r) => r.id === data.roomId);
        const opening = room?.openings.find((o) => o.id === data.openingId);
        const trim = shell.getObjectByName(`opening-${data.openingId}`);
        if (!room || !opening || !trim) return;
        callbacks.current.onSelectElement?.({ kind: 'opening', id: opening.id, roomId: room.id });
        const edge = edgeOf(room, opening.wallIndex);
        if (!edge || opening.locked) return;
        openingDragRef.current = { room, opening, edge, trim, startX: event.clientX, startY: event.clientY, moved: false, t: opening.t };
        return;
      }
      if (!building) return;
    }
    const itemId = data?.pickKind === 'item' ? data.itemId : null;
    if (!itemId) {
      dragRef.current = null;
      surfacePressRef.current =
        data?.pickKind === 'surface' && data.roomId && (data.surface === 'floor' || data.surface === 'wall')
          ? { roomId: data.roomId, surface: data.surface, wallIndex: data.wallIndex, x: event.clientX, y: event.clientY }
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
    // A wall-hung piece is grabbed where the pointer is on it; behind that spot is its wall,
    // and the piece keeps its distance from the pointer along that wall and up it.
    let hang: DragState['hang'];
    if (isWallHung(item)) {
      const target = hangTargetAt(event.clientX, event.clientY);
      const edge = target && target.room.id === item.roomId ? roomEdges(target.room.polygon).find((e) => e.index === target.wallIndex) : null;
      if (target && edge) {
        const along = (item.position.x - target.at.x) * edge.dir.x + (item.position.z - target.at.z) * edge.dir.z;
        hang = { roomId: target.room.id, wallIndex: target.wallIndex, along, up: item.elevationM + item.size.height / 2 - target.y };
      }
    }
    dragRef.current = {
      itemId,
      item,
      wrapper,
      room,
      grab: ground ? { x: item.position.x - ground.x, z: item.position.z - ground.z } : { x: 0, z: 0 },
      hang,
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
      const hung = isWallHung(item);
      // A wall-hung piece goes on the wall face under the pointer, at the height the pointer
      // is at; over the floor it snaps to the nearest wall from the floor point like anything
      // else. Everything else follows the plane of its own base.
      const target = hung ? hangTargetAt(clientX, clientY) : null;
      let room = target?.room ?? carry.room;
      let result = target ? hangOnWall(target.room, item, target.wallIndex, target.at, target.y, scene.items) : null;
      if (!result) {
        const ground = floorPoint(clientX, clientY, hung ? 0 : item.elevationM);
        if (!ground) return;
        // Carrying into a neighbouring room re-homes the item there, like a drag does.
        room = roomAtPoint(plan.rooms, ground) ?? carry.room;
        result = snapPlacement(room, item, { position: ground, rotation: item.rotation }, scene.items);
      }
      carry.room = room;
      carry.result = result;
      const elevationM = result.elevationM ?? item.elevationM;
      wrapper.position.set(result.position.x, elevationM, result.position.z);
      wrapper.rotation.y = result.rotation;
      applyOutline(outlines.active, { ...item, position: result.position, rotation: result.rotation, elevationM }, result.valid ? 0x22c55e : 0xef4444);
      outlines.hover.visible = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (carryRef.current && !walking) {
        carryUpdateRef.current?.(event.clientX, event.clientY);
        return;
      }
      // Painting: the tile or strip under the pointer lights up (not while the view is being turned).
      if (paintScope && finishing && !walking) showPaintGlow(event.buttons === 0 ? paintTargetAt(event.clientX, event.clientY) : null);
      const wd = wallDragRef.current;
      if (wd) {
        if (walking) return;
        const ground = floorPoint(event.clientX, event.clientY, 0);
        if (!ground) return;
        const raw = (ground.x - wd.start.x) * wd.normal.x + (ground.z - wd.start.z) * wd.normal.z;
        wd.distance = Math.round(raw * 100) / 100;
        if (!wd.moved && Math.abs(raw) < 0.03) return;
        if (!wd.moved) {
          wd.moved = true;
          const orbit = orbitRef.current;
          if (orbit) orbit.enabled = false;
          canvas.style.cursor = 'move';
        }
        const wall = plan.walls?.find((w) => w.id === wd.wallId);
        if (!wall) return;
        wd.ghost.visible = true;
        wd.ghost.position.x = (wall.a.x + wall.b.x) / 2 + wd.normal.x * wd.distance;
        wd.ghost.position.z = (wall.a.z + wall.b.z) / 2 + wd.normal.z * wd.distance;
        return;
      }
      const pd = pointDragRef.current;
      if (pd) {
        if (walking) return;
        const ground = floorPoint(event.clientX, event.clientY, 0);
        if (!ground) return;
        const dx = ground.x - pd.start.x;
        const dz = ground.z - pd.start.z;
        if (!pd.moved && Math.hypot(dx, dz) < 0.03) return;
        if (!pd.moved) {
          pd.moved = true;
          const orbit = orbitRef.current;
          if (orbit) orbit.enabled = false;
          canvas.style.cursor = 'move';
        }
        // A wall fitting sticks to the walls: it slides along the one it is on and hops
        // onto the nearest wall of its room when the pointer crosses the floor to another.
        // Ceiling lights and strips move freely; columns too.
        const fitting = pd.what === 'electrical' ? electrical.find((p) => p.id === pd.id) : null;
        const fittingRoom = fitting ? plan.rooms.find((r) => r.id === fitting.roomId) : null;
        if (fitting && fittingRoom && ELECTRICAL_KINDS[fitting.kind].placement === 'wall') {
          const spot = wallSpotNear(fittingRoom, ground);
          if (!spot) return;
          pd.absolute = true;
          pd.position = { x: Math.round(spot.position.x * 100) / 100, z: Math.round(spot.position.z * 100) / 100 };
          pd.object.position.set(spot.position.x + spot.edge.inward.x * 0.006, pd.origin.y, spot.position.z + spot.edge.inward.z * 0.006);
          pd.object.rotation.y = spot.edge.facing;
          return;
        }
        pd.position = { x: Math.round((pd.start.x + dx) * 100) / 100, z: Math.round((pd.start.z + dz) * 100) / 100 };
        // Slide the piece live; the store re-projects it on release.
        pd.object.position.set(pd.origin.x + dx, pd.origin.y, pd.origin.z + dz);
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

      const hung = isWallHung(drag.item);
      // A wall-hung piece is dragged along the wall face under the pointer, up and down it
      // and onto another wall, keeping the offset it was grabbed at while it stays on its own
      // wall; see the carry above.
      const target = hung ? hangTargetAt(event.clientX, event.clientY) : null;
      let room = target?.room ?? drag.room;
      let result: SnapResult | null = null;
      if (target) {
        const held = drag.hang && drag.hang.roomId === target.room.id && drag.hang.wallIndex === target.wallIndex ? drag.hang : undefined;
        result = hangOnWall(target.room, drag.item, target.wallIndex, target.at, target.y, scene.items, held);
      }
      if (!result) {
        const ground = floorPoint(event.clientX, event.clientY, hung ? 0 : drag.item.elevationM);
        if (!ground) return;
        const desired = hung ? ground : { x: ground.x + drag.grab.x, z: ground.z + drag.grab.z };
        // Dragging into a neighbouring room re-homes the item there.
        room = roomAtPoint(plan.rooms, desired) ?? drag.room;
        result = snapPlacement(room, drag.item, { position: desired, rotation: drag.item.rotation }, scene.items);
      }
      drag.room = room;
      drag.result = result;

      const elevationM = result.elevationM ?? drag.item.elevationM;
      drag.wrapper.position.set(result.position.x, elevationM, result.position.z);
      drag.wrapper.rotation.y = result.rotation;

      applyOutline(
        outlines.active,
        { ...drag.item, position: result.position, rotation: result.rotation, elevationM },
        result.valid ? 0x22c55e : 0xef4444
      );
      outlines.hover.visible = false;
    };

    const onPointerUp = (event: PointerEvent) => {
      const { onSelectSurface, onSelectItem, onPlaceItem, onMoveOpening, onSelectOpening, onCarryPlaced, onOffsetWall, onMoveColumn, onMoveElectrical } = callbacks.current;

      const wd = wallDragRef.current;
      if (wd) {
        wallDragRef.current = null;
        threeScene.remove(wd.ghost);
        wd.ghost.geometry.dispose();
        (wd.ghost.material as THREE.Material).dispose();
        const orbit = orbitRef.current;
        if (orbit) orbit.enabled = true;
        canvas.style.cursor = 'default';
        if (wd.moved && Math.abs(wd.distance) >= 0.01) onOffsetWall?.(wd.wallId, wd.distance);
        return;
      }
      const pd = pointDragRef.current;
      if (pd) {
        pointDragRef.current = null;
        const orbit = orbitRef.current;
        if (orbit) orbit.enabled = true;
        canvas.style.cursor = 'default';
        if (pd.moved) {
          const target = pd.absolute ? pd.position : { x: pd.origin.x + (pd.position.x - pd.start.x), z: pd.origin.z + (pd.position.z - pd.start.z) };
          if (pd.what === 'column') onMoveColumn?.(pd.id, target);
          else onMoveElectrical?.(pd.id, target);
        } else {
          pd.object.position.copy(pd.origin);
          pd.object.rotation.y = pd.originYaw;
        }
        return;
      }

      const carry = carryRef.current;
      if (carry) {
        const tapped = carry.pressX != null && carry.pressY != null && Math.hypot(event.clientX - carry.pressX, event.clientY - carry.pressY) < 6;
        carry.pressX = undefined;
        carry.pressY = undefined;
        // Only a tap sets the item down, and only where it fits; anywhere else it stays on the pointer.
        if (tapped && carry.result?.valid) {
          onPlaceItem?.(carry.itemId, carry.result.position, carry.result.rotation, carry.room.id, carry.result.elevationM);
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
        if (press.paint) callbacks.current.onPaint?.(press.paint);
        else onSelectSurface?.({ roomId: press.roomId, surface: press.surface, wallIndex: press.wallIndex });
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
        onPlaceItem?.(drag.itemId, drag.result.position, drag.result.rotation, drag.room.id, drag.result.elevationM);
        onSelectItem?.(drag.itemId);
      } else {
        // Refused: put it back where it came from rather than leave it overlapping.
        drag.wrapper.position.set(drag.item.position.x, drag.item.elevationM, drag.item.position.z);
        drag.wrapper.rotation.y = drag.item.rotation;
      }
    };

    const onPointerLeave = () => showPaintGlow(null);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gl, walking, plan.rooms, plan.walls, scene.items, electrical, floorPoint, hangTargetAt, outlines, itemsGroup, threeScene, paintScope, finishing, paintTargetAt, showPaintGlow]);

  // Leaving openings mode drops any preview offset a cancelled drag may have left behind.
  useEffect(() => {
    if (editingOpenings) return;
    openingDragRef.current = null;
  }, [editingOpenings]);

  return (
    <>
      <hemisphereLight args={[daylight.skyColor, daylight.groundColor, daylight.hemisphereIntensity]} />
      <ambientLight intensity={daylight.ambientIntensity} color={daylight.skyColor} />
      <directionalLight
        castShadow
        position={daylight.sunPosition}
        intensity={daylight.sunIntensity}
        color={daylight.sunColor}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={70}
        shadow-bias={-0.0005}
      />
      {/* A soft fill from the opposite side keeps interiors from going flat black by day. */}
      <directionalLight position={[-daylight.sunPosition[0], 9, -daylight.sunPosition[2]]} intensity={0.35 * (0.3 + 0.7 * daylight.daylight)} color={style.lighting.lamp} />
      {/* Evening and night: the flat's own lamps, one per room. */}
      {daylight.interiorLightsOn &&
        sceneLights.length === 0 &&
        roomLamps.map((lamp) => (
          <pointLight key={lamp.id} position={lamp.position} intensity={lamp.intensity * daylight.interiorIntensity} distance={lamp.distance} decay={1.5} color={style.lighting.lamp} />
        ))}
      {/*
        Standing inside, sunlight through the windows alone leaves the far side of a room
        black, so walk mode adds flat fill plus a soft light that travels with the viewer.
      */}
      {walking && (
        <>
          <ambientLight intensity={0.6 * (0.35 + 0.65 * daylight.daylight)} color={daylight.skyColor} />
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
        <primitive object={electricalGroup} />
        <primitive object={radiatorGroup} />
      </group>
      {/* The lights that are switched on. By day they are a glow, at night the light. */}
      {sceneLights.map((light) => (
        <pointLight key={light.id} position={light.position} intensity={light.intensity * (daylight.interiorLightsOn ? Math.max(0.6, daylight.interiorIntensity) : 0.3)} distance={light.distance} decay={1.5} color={style.lighting.lamp} />
      ))}

      <primitive object={warnings} />
      <primitive object={paintGlow} />
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
