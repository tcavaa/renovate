'use client';

/**
 * The 2D plan editor — the build mode's drawing board.
 *
 * One canvas, one tool in hand. Walls are drawn as lines (click, click, click; Escape ends
 * the run), rooms as rectangles, doors and windows dropped on the nearest wall, columns and
 * beams, technical and electrical points placed with a click. The select tool picks any of
 * them; a selected wall drags sideways and its ends drag as handles, a door slides along its
 * wall or onto another, points and columns move freely. Everything snaps (`lib/design/drawing`)
 * and every snap shows its guide. A piece of furniture picked off the studio's shelf rides on
 * the pointer (`carryingItemId`) the way it does in 3D — green where it fits, red where it
 * does not — and a click sets it down; the page's Escape gives it up.
 *
 * The editor owns only the view (pan, zoom) and the gesture in progress; the plan itself is
 * the store's, edited through the callbacks. It redraws from the props on every change, so
 * the drawing can never disagree with the data.
 *
 * Shared by the design flow's steps 2 and 3, the studio's 2D view and the calculator's first
 * step, each with a different set of tools switched on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { archetypeLabel } from '@/lib/design/catalog';
import { beamAt, columnAt, nodeAt, pointElementAt, polygonsOverlap, roomUnderRect, snapPoint, snapRectangle, snapRoomMove, wallAt, type SnapGuide } from '@/lib/design/drawing';
import { OPENING_DEFAULTS, distanceToSegment, nearestWall, projectToEdge, type WallTarget } from '@/lib/design/openings';
import { pointInPolygon, pointOnEdge, roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import { roomAtPoint, snapPlacement } from '@/lib/design/manipulate';
import { wallNormal, wallsClash, wallsForMove } from '@/lib/design/walls';
import { useLocale } from '@/lib/i18n/client';
import type { ElementSelection } from '@/store/designStore';
import type { ElectricalKind, ElectricalPoint, FloorPlan, Opening, PlacedItem, PlanRoom, SurfaceFinish, TechnicalKind, Vec2, Wall } from '@/lib/design/types';
import { cellAt, cellPolygon, patchAt, patchSpans, stripAt, wallSpotAt, type PaintTarget } from '@/lib/design/paint';
import { drawBaseFinishes, drawBeam, drawColumn, drawDraftRect, drawDraftWall, drawElectrical, drawFurniture, drawGhostPoint, drawGrid, drawGuides, drawMarquee, drawMeasure, drawNodeHandles, drawOpening, drawOuterDimensions, drawPaintedCell, drawRoom, drawRoomGhost, drawTechnical, drawWall, drawWallBand, drawWallGhost, drawWallLength, drawZone, outerDimensionChains, toWorld, wallEndExtensions, type Transform } from './draw';
import { EDITOR, ELECTRICAL_COLOR, TECHNICAL_COLOR } from './palette';

export type EditorTool = 'select' | 'pan' | 'wall' | 'room' | 'door' | 'window' | 'column' | 'beam' | 'technical' | 'electrical' | 'zone' | 'paint';

export interface EditorLayers {
  rooms: boolean;
  walls: boolean;
  openings: boolean;
  structure: boolean;
  technical: boolean;
  electrical: boolean;
  furniture: boolean;
  zones: boolean;
  dimensions: boolean;
  labels: boolean;
  /** Colour walls by origin (existing / changed / generated) instead of plain ink. */
  origins: boolean;
}

export const ALL_LAYERS: EditorLayers = { rooms: true, walls: true, openings: true, structure: true, technical: true, electrical: true, furniture: true, zones: true, dimensions: true, labels: true, origins: false };

export interface PlanEditorProps {
  plan: FloorPlan;
  items?: PlacedItem[];
  electrical?: ElectricalPoint[];
  finishes?: SurfaceFinish[];
  tool: EditorTool;
  /** Thickness the wall and room tools draw with. */
  wallThicknessM: number;
  technicalKind?: TechnicalKind;
  electricalKind?: ElectricalKind;
  layers?: Partial<EditorLayers>;
  /** Walls, doors, windows, columns and beams can be picked but not moved. */
  locked?: boolean;
  selection: ElementSelection;
  selectedRoomId?: string | null;
  /** Rooms picked out with a click or a rubber band; they drag together. */
  selectedRoomIds?: string[];
  selectedItemId?: string | null;
  onSelect: (selection: ElementSelection) => void;
  onSelectRoom?: (roomId: string | null) => void;
  onSelectRooms?: (roomIds: string[]) => void;
  /** Rooms dragged bodily across the sheet; without it rooms are picked but never moved. */
  onMoveRooms?: (roomIds: string[], delta: Vec2) => void;
  onSelectItem?: (itemId: string | null) => void;
  onAddWall?: (a: Vec2, b: Vec2) => void;
  onAddRectangle?: (rect: { x: number; z: number; width: number; depth: number }) => void;
  /** A wall dragged sideways; `alone` (Shift held) asks for the wall and nothing that meets it. */
  onOffsetWall?: (wallId: string, distance: number, alone?: boolean) => void;
  /** A junction dragged; with `onlyWallId` (Shift held) only that wall's end goes, the rest of the junction stays. */
  onMoveNode?: (from: Vec2, to: Vec2, onlyWallId?: string | null) => void;
  onAddOpening?: (kind: 'door' | 'window', target: WallTarget) => string | null;
  onMoveOpening?: (roomId: string, openingId: string, t: number) => void;
  onMoveOpeningToWall?: (roomId: string, openingId: string, target: WallTarget) => string | null;
  onAddColumn?: (position: Vec2) => void;
  onMoveColumn?: (id: string, position: Vec2) => void;
  onAddBeam?: (a: Vec2, b: Vec2) => void;
  onAddTechnical?: (kind: TechnicalKind, position: Vec2, roomId: string | null) => void;
  onMoveTechnical?: (id: string, position: Vec2) => void;
  onAddElectrical?: (kind: ElectricalKind, position: Vec2, roomId: string) => void;
  onMoveElectrical?: (id: string, position: Vec2) => void;
  onAddZone?: (roomId: string, rect: { x: number; z: number; width: number; depth: number }) => void;
  /**
   * The paint tool: what a click paints — `cell`, the square metre of floor under the
   * pointer; `strip`, the metre of wall nearest to it (from inside the room), floor to
   * ceiling; or `patch`, one square metre of that wall. Dragging paints everything the
   * pointer passes over. A plan has no height, so a patch painted here is the bottom metre
   * of the wall; the rest of the wall is painted in the 3D view.
   */
  paintScope?: 'cell' | 'strip' | 'patch' | null;
  onPaint?: (target: PaintTarget) => void;
  /**
   * The select tool sees rooms and floor zones and nothing else: while the finishes are
   * being chosen, furniture, fittings, doors and walls can be neither picked nor moved.
   */
  roomsOnly?: boolean;
  onMoveItem?: (itemId: string, position: Vec2, rotation: number, roomId: string) => void;
  /**
   * The piece riding on the pointer (the store's `carryingItemId`): it follows the pointer
   * from room to room, snapped like a drag, and a click sets it down through `onMoveItem`
   * where it fits — nowhere else — then `onCarryPlaced`. Escape is the page's (`cancelCarry`).
   */
  carryingItemId?: string | null;
  onCarryPlaced?: (itemId: string) => void;
  /** Delete or Backspace with something selected. */
  onDelete?: () => void;
  /**
   * A drop the plan would not accept, and why: `opening` — a window on a shared wall, a
   * door with no wall to go on; `overlap` — a room drawn on top of a room.
   */
  onRefused?: (reason: 'opening' | 'overlap') => void;
  /** A one-shot tool finished (a column placed): the page may go back to select. */
  onToolDone?: () => void;
  /** Ctrl+Z / Ctrl+Y (Cmd on a Mac) while the board has the keyboard; undone by the page. */
  onUndo?: () => void;
  onRedo?: () => void;
  /**
   * Escape with nothing of the board's own to end — no wall or beam run in progress, no piece
   * on the pointer: the page may put its tool down. A run in progress is ended first, and the
   * next Escape gets through, the way CAD does it.
   */
  onEscape?: () => void;
  className?: string;
  /** When this changes, the view refits to the plan. */
  fitKey?: unknown;
  /** Receives the view controls once mounted; `null` on unmount. */
  onApi?: (api: PlanEditorApi | null) => void;
}

/** Fit and zoom, for a page's own buttons — and the carried piece, for a drag from a tray. */
export interface PlanEditorApi {
  fit: () => void;
  /** Multiplies the scale about the centre of the canvas; > 1 zooms in. */
  zoom: (factor: number) => void;
  /** The carried piece follows a drag from a tray (client coordinates). */
  moveCarriedTo: (clientX: number, clientY: number) => void;
  /** Sets the carried piece down at a point (client coordinates); false when it does not fit there, and then it stays on the pointer. */
  dropCarriedAt: (clientX: number, clientY: number) => boolean;
  /** Where the carried piece stands right now, for the page to turn it there. */
  carryPose: () => { position: Vec2; rotation: number; roomId: string } | null;
}

/** Where the carried piece would stand with the pointer at a point, and whether it fits there. */
interface CarryPose {
  position: Vec2;
  rotation: number;
  roomId: string;
  valid: boolean;
}

/**
 * The carried piece under the pointer: in the room the point is in (its own room when the
 * point is outside every room), snapped like a drag and tested against the walls and the
 * other pieces. The same rule the 3D view carries by.
 */
function carryPoseAt(rooms: PlanRoom[], items: PlacedItem[], item: PlacedItem, at: Vec2): CarryPose | null {
  const room = roomAtPoint(rooms, at) ?? rooms.find((r) => r.id === item.roomId) ?? null;
  if (!room) return null;
  const result = snapPlacement(room, item, { position: at, rotation: item.rotation }, items);
  return { position: result.position, rotation: result.rotation, roomId: room.id, valid: result.valid };
}

const SNAP_PX = 12;
const HIT_PX = 8;
const DRAG_THRESHOLD_PX = 4;
/** Rooms are dragged to the centimetre, like every other size on the board. */
const MOVE_STEP_M = 0.01;
/** How far one press of W/A/S/D (or an arrow) slides the sheet. */
const PAN_STEP_PX = 60;
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [1, 0],
  ArrowLeft: [1, 0],
  KeyD: [-1, 0],
  ArrowRight: [-1, 0],
};
const EMPTY_IDS: string[] = [];

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; offsetX: number; offsetY: number }
  | { kind: 'rect'; start: Vec2; current: Vec2; roomId: string | null; /** Where a room rectangle will land after snapping onto neighbouring walls. */ snapped?: { x: number; z: number; width: number; depth: number }; /** It would be drawn over a room that is already there. */ overlaps?: boolean }
  | { kind: 'wall-drag'; wall: Wall; startWorld: Vec2; distance: number; moved: boolean; /** Shift held: the wall goes alone, what meets it stays. */ alone: boolean }
  | { kind: 'node-drag'; wallId: string; from: Vec2; to: Vec2; moved: boolean; /** Shift held: only this wall's end goes, the rest of the junction stays. */ alone: boolean }
  | { kind: 'opening-drag'; room: PlanRoom; opening: Opening; edge: PlanEdge; target: { room: PlanRoom; edge: PlanEdge; t: number }; moved: boolean }
  | { kind: 'point-drag'; what: 'column' | 'technical' | 'electrical'; id: string; position: Vec2; moved: boolean }
  | { kind: 'item-drag'; item: PlacedItem; grab: Vec2; position: Vec2; roomId: string; valid: boolean; moved: boolean }
  | { kind: 'paint'; last: string }
  | { kind: 'marquee'; start: Vec2; current: Vec2; additive: boolean }
  | {
      kind: 'room-drag';
      /** The rooms that travel: the ones grabbed and every room joined to them (`roomCluster`). */
      roomIds: string[];
      /** Their walls and everyone else's, worked out once when the drag began. */
      moving: Wall[];
      staying: Wall[];
      startWorld: Vec2;
      delta: Vec2;
      moved: boolean;
      /** Where it would land it would lie on a room staying put, or stand half inside one of its walls. */
      overlaps: boolean;
    };

interface Hover {
  kind: 'wall' | 'opening' | 'column' | 'beam' | 'technical' | 'electrical' | 'zone' | 'item' | 'room' | 'node' | null;
  id?: string;
  roomId?: string;
}

export function PlanEditor(props: PlanEditorProps) {
  const {
    plan,
    items = [],
    electrical = [],
    finishes = [],
    tool,
    wallThicknessM,
    technicalKind = 'water_supply',
    electricalKind = 'socket',
    locked = false,
    selection,
    selectedRoomId = null,
    selectedRoomIds = EMPTY_IDS,
    selectedItemId = null,
    paintScope = null,
    roomsOnly = false,
    carryingItemId = null,
    className,
    fitKey,
  } = props;
  const layers: EditorLayers = useMemo(() => ({ ...ALL_LAYERS, ...props.layers }), [props.layers]);
  const t = useT();
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<Transform>({ scale: 40, offsetX: 40, offsetY: 40 });
  const [, bump] = useState(0);
  const redraw = useCallback(() => bump((n) => n + 1), []);
  const gestureRef = useRef<Gesture | null>(null);
  const [gestureVersion, setGestureVersion] = useState(0);
  const [hover, setHover] = useState<Hover>({ kind: null });
  const [pointerWorld, setPointerWorld] = useState<Vec2 | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  /** The wall run being drawn: its first point, and the point the pointer is snapped to. */
  const [draftWall, setDraftWall] = useState<{ anchor: Vec2; current: Vec2 } | null>(null);
  const [draftBeam, setDraftBeam] = useState<{ anchor: Vec2; current: Vec2 } | null>(null);
  /** The tile or strip the paint brush is over. */
  const [paintHover, setPaintHover] = useState<PaintTarget | null>(null);
  /**
   * Where the pointer last was while carrying a piece — kept with the piece's id, so a
   * different carry starts afresh from wherever the store stood the piece.
   */
  const [carryAt, setCarryAt] = useState<{ id: string; world: Vec2 } | null>(null);
  const [ghostOpening, setGhostOpening] = useState<{ room: PlanRoom; edge: PlanEdge; t: number; widthM: number; kind: 'door' | 'window'; openingId: string | null; faded: boolean } | null>(null);
  const spaceHeld = useRef(false);
  const shiftHeld = useRef(false);
  const fitted = useRef<unknown>(undefined);
  /** Once the person has panned or zoomed, a resize no longer refits the view under them. */
  const userAdjusted = useRef(false);
  /** Once the person has drawn or moved something, a resize keeps the view's centre instead of refitting. */
  const edited = useRef(false);
  const lastSize = useRef<{ width: number; height: number } | null>(null);

  const walls = plan.walls ?? [];
  const columns = plan.columns ?? [];
  const beams = plan.beams ?? [];
  const technical = plan.technical?.points ?? [];
  const callbacks = useRef(props);
  callbacks.current = props;
  // How far each wall's body runs past its ends to close its corners, and the chains of
  // dimensions outside the plan — both from the plan alone, worked out once per plan.
  const wallExtensions = useMemo(() => wallEndExtensions(plan.walls ?? []), [plan.walls]);
  const dimensionChains = useMemo(() => (layers.dimensions ? outerDimensionChains(plan) : null), [plan, layers.dimensions]);

  // The piece on the pointer, and where it stands: under the pointer once it has come onto
  // the board, else where the store stood it (a free spot in its room, or the middle).
  const carried = useMemo(() => (carryingItemId ? (items.find((i) => i.id === carryingItemId) ?? null) : null), [carryingItemId, items]);
  const carryWorld = carried && carryAt?.id === carried.id ? carryAt.world : null;
  const carryPose = useMemo(() => (carried ? carryPoseAt(plan.rooms, items, carried, carryWorld ?? carried.position) : null), [carried, items, plan.rooms, carryWorld]);
  const carryPoseRef = useRef(carryPose);
  useEffect(() => {
    carryPoseRef.current = carryPose;
  }, [carryPose]);

  /** Client coordinates → metres on the sheet, from the refs alone, for the api's closures. */
  const worldOfClient = useCallback((clientX: number, clientY: number): Vec2 | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return toWorld(transformRef.current, clientX - rect.left, clientY - rect.top);
  }, []);

  /** Sets the carried piece down at a point when it fits there; otherwise it stays on the pointer, there. */
  const dropCarriedAt = useCallback(
    (world: Vec2): boolean => {
      const { plan: currentPlan, items: currentItems = [], carryingItemId: id } = callbacks.current;
      const item = id ? currentItems.find((i) => i.id === id) : null;
      if (!id || !item) return false;
      const pose = carryPoseAt(currentPlan.rooms, currentItems, item, world);
      if (!pose?.valid) {
        setCarryAt({ id, world });
        return false;
      }
      edited.current = true;
      callbacks.current.onMoveItem?.(id, pose.position, pose.rotation, pose.roomId);
      callbacks.current.onCarryPlaced?.(id);
      setCarryAt(null);
      return true;
    },
    []
  );

  // -------------------------------------------------------------------------
  // View
  // -------------------------------------------------------------------------

  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const points = [...plan.rooms.flatMap((r) => r.polygon), ...walls.flatMap((w) => [w.a, w.b])];
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (points.length === 0) {
      // A blank sheet shows room for a flat of about a hundred square metres — sixteen by
      // ten metres at most — with the origin a metre in from the top left corner, where the
      // first wall usually starts. Zooming in and out is the person's, not the plan's.
      const scale = Math.max(36, Math.min(64, Math.min(width / 16, height / 10)));
      // Two and a half metres in from the corner rather than one: the first room's dimension
      // chain runs above and to the left of it, and the totals plate sits in that corner.
      const inset = layers.dimensions ? scale * 2.5 : scale;
      transformRef.current = { scale, offsetX: inset, offsetY: inset };
      redraw();
      return;
    }
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minZ = Math.min(...points.map((p) => p.z));
    const maxZ = Math.max(...points.map((p) => p.z));
    // The dimension chains stand outside the plan and need the room for it.
    const margin = layers.dimensions ? 100 : 48;
    const scale = Math.max(8, Math.min(120, Math.min((width - margin * 2) / Math.max(1, maxX - minX), (height - margin * 2) / Math.max(1, maxZ - minZ))));
    transformRef.current = {
      scale,
      offsetX: margin + (width - margin * 2 - (maxX - minX) * scale) / 2 - minX * scale,
      offsetY: margin + (height - margin * 2 - (maxZ - minZ) * scale) / 2 - minZ * scale,
    };
    redraw();
  }, [plan.rooms, walls, redraw, layers.dimensions]);

  useEffect(() => {
    if (fitted.current === fitKey && fitted.current !== undefined) return;
    fitted.current = fitKey ?? null;
    userAdjusted.current = false;
    fitView();
  }, [fitKey, fitView]);

  useEffect(() => {
    const onApi = callbacks.current.onApi;
    if (!onApi) return;
    onApi({
      fit: fitView,
      zoom: (factor) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const cx = canvas.clientWidth / 2;
        const cy = canvas.clientHeight / 2;
        const tr = transformRef.current;
        const scale = Math.max(6, Math.min(240, tr.scale * factor));
        const k = scale / tr.scale;
        transformRef.current = { scale, offsetX: cx - (cx - tr.offsetX) * k, offsetY: cy - (cy - tr.offsetY) * k };
        userAdjusted.current = true;
        redraw();
      },
      moveCarriedTo: (clientX, clientY) => {
        const id = callbacks.current.carryingItemId;
        const world = worldOfClient(clientX, clientY);
        if (id && world) setCarryAt({ id, world });
      },
      dropCarriedAt: (clientX, clientY) => {
        const world = worldOfClient(clientX, clientY);
        return world ? dropCarriedAt(world) : false;
      },
      carryPose: () => {
        const pose = carryPoseRef.current;
        return pose ? { position: pose.position, rotation: pose.rotation, roomId: pose.roomId } : null;
      },
    });
    return () => onApi(null);
  }, [fitView, redraw, worldOfClient, dropCarriedAt]);

  // Wheel: zoom around the pointer. Registered natively so the page does not scroll too.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const tr = transformRef.current;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const scale = Math.max(6, Math.min(240, tr.scale * factor));
      const k = scale / tr.scale;
      transformRef.current = { scale, offsetX: x - (x - tr.offsetX) * k, offsetY: y - (y - tr.offsetY) * k };
      userAdjusted.current = true;
      redraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [redraw]);

  // Space pans, shift frees the angle, Escape ends a run or clears the selection, Delete deletes.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)) return;
      if (e.code === 'Space') {
        spaceHeld.current = true;
        e.preventDefault();
      }
      if (e.key === 'Shift') shiftHeld.current = true;
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (e.code === 'KeyZ' && callbacks.current.onUndo) {
          e.preventDefault();
          if (e.shiftKey) callbacks.current.onRedo?.();
          else callbacks.current.onUndo();
        } else if (e.code === 'KeyY' && callbacks.current.onRedo) {
          e.preventDefault();
          callbacks.current.onRedo();
        }
        return;
      }
      if (e.code === 'Escape') {
        if (draftWall || draftBeam) {
          setDraftWall(null);
          setDraftBeam(null);
          setGuides([]);
        } else if (!callbacks.current.carryingItemId) {
          // A piece on the pointer is the page's to give up (`cancelCarry`); the board says
          // nothing then, so a swap that came back keeps its selection.
          callbacks.current.onSelect(null);
          callbacks.current.onSelectItem?.(null);
          callbacks.current.onSelectRooms?.([]);
          callbacks.current.onEscape?.();
        }
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && !e.metaKey && !e.ctrlKey) {
        callbacks.current.onDelete?.();
      }
      if (e.code === 'Enter' && draftWall) {
        setDraftWall(null);
        setGuides([]);
      }
      // WASD and the arrows slide the sheet, the same keys the 3D view uses — matched on
      // `code`, because on a Georgian layout W types წ and D types დ.
      const step = PAN_STEP_PX * (e.shiftKey ? 2.5 : 1);
      const pan = PAN_KEYS[e.code];
      if (pan) {
        e.preventDefault();
        const tr = transformRef.current;
        transformRef.current = { ...tr, offsetX: tr.offsetX + pan[0] * step, offsetY: tr.offsetY + pan[1] * step };
        userAdjusted.current = true;
        redraw();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
      if (e.key === 'Shift') shiftHeld.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [draftWall, draftBeam]);

  // A new tool drops whatever the old one was in the middle of.
  useEffect(() => {
    setDraftWall(null);
    setDraftBeam(null);
    setGhostOpening(null);
    setPaintHover(null);
    setGuides([]);
    gestureRef.current = null;
  }, [tool, paintScope]);

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tr = transformRef.current;
    // The view transform, readable from outside (tests, devtools): metres → CSS pixels.
    canvas.dataset.scale = String(tr.scale);
    canvas.dataset.offsetX = String(tr.offsetX);
    canvas.dataset.offsetY = String(tr.offsetY);
    drawGrid(ctx, tr, width, height);
    const gesture = gestureRef.current;

    // Rooms.
    if (layers.rooms) {
      for (const room of plan.rooms) {
        drawRoom(ctx, tr, room, {
          selected: room.id === selectedRoomId || selectedRoomIds.includes(room.id) || (selection?.kind === 'room' && selection.id === room.id),
          hovered: hover.kind === 'room' && hover.id === room.id,
          labels: layers.labels,
          dimensions: layers.dimensions,
          unitM2: t.units.m2,
        });
      }
    }

    // The finishes chosen for whole rooms — a floor in its product's colour, the walls as a
    // band — under the zones, tiles and strips painted on top of them.
    if (layers.zones) drawBaseFinishes(ctx, tr, plan, finishes);

    // Zones, drawn over the floor and under the walls.
    if (layers.zones) {
      for (const finish of finishes) {
        if (!finish.zone) continue;
        drawZone(ctx, tr, finish.zone, finish.product?.colorHex ?? finish.colorHex ?? null, {
          selected: selection?.kind === 'zone' && selection.id === finish.zone.id,
          hovered: hover.kind === 'zone' && hover.id === finish.zone.id,
        });
      }
    }

    // Floor tiles painted one at a time, and the one under the brush.
    if (layers.zones) {
      for (const finish of finishes) {
        if (!finish.cells || finish.surface !== 'floor') continue;
        const room = plan.rooms.find((r) => r.id === finish.roomId);
        if (!room) continue;
        for (const cell of finish.cells) drawPaintedCell(ctx, tr, cellPolygon(room, cell), finish.product?.colorHex ?? finish.colorHex ?? null);
      }
    }
    if (paintHover?.surface === 'floor') {
      const room = plan.rooms.find((r) => r.id === paintHover.roomId);
      if (room) drawPaintedCell(ctx, tr, cellPolygon(room, paintHover.cell), null, { preview: true });
    }

    // Furniture footprints; the piece on the pointer where it would land, over everything.
    if (layers.furniture) {
      for (const item of items) {
        if (carried && item.id === carried.id) continue;
        const dragging = gesture?.kind === 'item-drag' && gesture.item.id === item.id;
        const live = dragging ? { ...item, position: gesture.position } : item;
        drawFurniture(ctx, tr, live, archetypeLabel(item.kind, locale), {
          selected: item.id === selectedItemId,
          hovered: hover.kind === 'item' && hover.id === item.id,
          invalid: dragging && !gesture.valid,
        });
      }
      if (carried && carryPose) {
        drawFurniture(ctx, tr, { ...carried, position: carryPose.position, rotation: carryPose.rotation }, archetypeLabel(carried.kind, locale), { carried: true, invalid: !carryPose.valid });
      }
    }

    // Walls, with the one being dragged shown where it would land. The one in hand —
    // selected, hovered, dragged sideways or stretched by an end — carries its length on a
    // plate, live, so the number changes under the pointer instead of after the fact.
    if (layers.walls) {
      const measured: Array<{ wall: Pick<Wall, 'a' | 'b'>; extra?: string }> = [];
      for (const wall of walls) {
        let live = wall;
        if (gesture?.kind === 'wall-drag' && gesture.wall.id === wall.id) {
          const n = wallNormal(wall);
          live = { ...wall, a: { x: wall.a.x + n.x * gesture.distance, z: wall.a.z + n.z * gesture.distance }, b: { x: wall.b.x + n.x * gesture.distance, z: wall.b.z + n.z * gesture.distance } };
        }
        if (gesture?.kind === 'node-drag' && (!gesture.alone || gesture.wallId === wall.id)) {
          const near = (p: Vec2) => Math.hypot(p.x - gesture.from.x, p.z - gesture.from.z) < 0.02;
          live = { ...live, a: near(wall.a) ? gesture.to : live.a, b: near(wall.b) ? gesture.to : live.b };
        }
        const isSelected = selection?.kind === 'wall' && selection.id === wall.id;
        const extension = live === wall ? wallExtensions.get(wall.id) : undefined;
        drawWall(ctx, tr, live, {
          selected: isSelected,
          hovered: hover.kind === 'wall' && hover.id === wall.id,
          locked: locked || wall.locked,
          byOrigin: layers.origins,
          extendA: extension?.a,
          extendB: extension?.b,
        });
        if (gesture?.kind === 'wall-drag' && gesture.wall.id === wall.id) measured.push({ wall: live, extra: `${gesture.distance >= 0 ? '+' : ''}${gesture.distance.toFixed(2)} ${t.units.m}` });
        else if (gesture?.kind === 'node-drag' && live !== wall) measured.push({ wall: live });
        else if (!gesture && layers.dimensions && (isSelected || (hover.kind === 'wall' && hover.id === wall.id))) measured.push({ wall: live });
      }
      if (selection?.kind === 'wall' && !locked) {
        const wall = walls.find((w) => w.id === selection.id);
        if (wall) drawNodeHandles(ctx, tr, wall);
      }
      for (const m of measured) drawWallLength(ctx, tr, m.wall, t.units.m, m.extra);
    }

    // Walls with a finish of their own — the whole wall, or metre-wide strips of it — as a
    // band of that finish along the inside of the room.
    if (layers.zones) {
      // In the order they lie on the wall — the whole wall, then strips, then the square
      // metres painted over them — not the order they happen to be stored in: a square joins
      // its product's finish wherever that sits in the list, which can be before the strip
      // it was painted on.
      const layer = (f: SurfaceFinish) => (f.cells ? 2 : f.span ? 1 : 0);
      for (const finish of [...finishes].sort((a, b) => layer(a) - layer(b))) {
        if (finish.surface !== 'wall' || finish.wallIndex == null) continue;
        const room = plan.rooms.find((r) => r.id === finish.roomId);
        const edge = room ? roomEdges(room.polygon).find((e) => e.index === finish.wallIndex) : null;
        if (!edge || !room) continue;
        const color = finish.product?.colorHex ?? finish.colorHex ?? null;
        // A patch is a square metre at some height; a plan has no height, so the band shows
        // which stretch of the wall has been painted and the 3D view shows how much of it.
        if (finish.cells) {
          for (const patch of finish.cells) {
            const { along } = patchSpans(edge, room.heightM, patch);
            drawWallBand(ctx, tr, edge, along.from, Math.min(edge.length, along.to), color);
          }
          continue;
        }
        drawWallBand(ctx, tr, edge, finish.span?.from ?? 0, Math.min(edge.length, finish.span?.to ?? edge.length), color);
      }
    }
    if (paintHover?.surface === 'wall') {
      const room = plan.rooms.find((r) => r.id === paintHover.roomId);
      const edge = room ? roomEdges(room.polygon).find((e) => e.index === paintHover.wallIndex) : null;
      if (edge) drawWallBand(ctx, tr, edge, paintHover.span.from, paintHover.span.to, null, { preview: true });
    }

    // Doors and windows.
    if (layers.openings) {
      for (const room of plan.rooms) {
        for (const opening of room.openings) {
          if (ghostOpening?.openingId === opening.id) continue;
          drawOpening(ctx, tr, room, opening, plan.wallThicknessM, {
            selected: selection?.kind === 'opening' && selection.id === opening.id,
            hovered: hover.kind === 'opening' && hover.id === opening.id,
          });
        }
      }
      if (ghostOpening) {
        const preview: Opening = { id: 'ghost', kind: ghostOpening.kind, wallIndex: ghostOpening.edge.index, t: ghostOpening.t, widthM: ghostOpening.widthM, heightM: 2, sillM: 0, roomId: ghostOpening.room.id, exterior: false };
        drawOpening(ctx, tr, ghostOpening.room, preview, plan.wallThicknessM, { selected: true, alpha: ghostOpening.faded ? 0.3 : 0.85, dashed: !ghostOpening.openingId });
      }
    }

    // Columns and beams.
    if (layers.structure) {
      for (const column of columns) {
        const live = gesture?.kind === 'point-drag' && gesture.what === 'column' && gesture.id === column.id ? { ...column, position: gesture.position } : column;
        drawColumn(ctx, tr, live, { selected: selection?.kind === 'column' && selection.id === column.id, hovered: hover.kind === 'column' && hover.id === column.id });
      }
      for (const beam of beams) drawBeam(ctx, tr, beam, { selected: selection?.kind === 'beam' && selection.id === beam.id, hovered: hover.kind === 'beam' && hover.id === beam.id });
    }

    // Technical and electrical points.
    if (layers.technical) {
      for (const point of technical) {
        const live = gesture?.kind === 'point-drag' && gesture.what === 'technical' && gesture.id === point.id ? { ...point, position: gesture.position } : point;
        drawTechnical(ctx, tr, live, { selected: selection?.kind === 'technical' && selection.id === point.id, hovered: hover.kind === 'technical' && hover.id === point.id });
      }
    }
    if (layers.electrical) {
      for (const point of electrical) {
        const live = gesture?.kind === 'point-drag' && gesture.what === 'electrical' && gesture.id === point.id ? { ...point, position: gesture.position } : point;
        drawElectrical(ctx, tr, live, { selected: selection?.kind === 'electrical' && selection.id === point.id, hovered: hover.kind === 'electrical' && hover.id === point.id });
      }
    }

    // What the tool in hand is about to do.
    if (draftWall) drawDraftWall(ctx, tr, draftWall.anchor, draftWall.current, wallThicknessM, t.units.m);
    if (draftBeam) drawDraftWall(ctx, tr, draftBeam.anchor, draftBeam.current, 0.25, t.units.m);
    if (gesture?.kind === 'rect') {
      const rect = gesture.snapped ?? normaliseRect(gesture.start, gesture.current);
      drawDraftRect(ctx, tr, rect, t.units.m, t.units.m2, gesture.overlaps ? EDITOR.invalid : tool === 'zone' ? EDITOR.zone : EDITOR.selected);
    }
    if (pointerWorld && (tool === 'column' || tool === 'technical' || tool === 'electrical')) {
      const color = tool === 'column' ? EDITOR.column : tool === 'technical' ? TECHNICAL_COLOR[technicalKind] : ELECTRICAL_COLOR.socket;
      drawGhostPoint(ctx, tr, pointerWorld, color);
    }
    // The rubber band, and the rooms it would take; a room being dragged as an outline at
    // its new place, with how far it has travelled on a plate beside it.
    if (gesture?.kind === 'marquee') drawMarquee(ctx, tr, normaliseRect(gesture.start, gesture.current));
    if (gesture?.kind === 'room-drag') {
      const tint = gesture.overlaps ? EDITOR.invalid : EDITOR.selected;
      for (const id of gesture.roomIds) {
        const room = plan.rooms.find((r) => r.id === id);
        if (room) drawRoomGhost(ctx, tr, room.polygon, gesture.delta, tint);
      }
      // The walls are what snaps, so the walls are what is shown arriving: the room's floor
      // stops half a thickness short of the line its wall lands on.
      if (gesture.moved) for (const wall of gesture.moving) drawWallGhost(ctx, tr, wall, gesture.delta, tint);
      if (pointerWorld) {
        const at = toScreenPoint(tr, pointerWorld);
        drawMeasure(ctx, at.x, at.y - 22, `${gesture.delta.x >= 0 ? '+' : ''}${gesture.delta.x.toFixed(2)} · ${gesture.delta.z >= 0 ? '+' : ''}${gesture.delta.z.toFixed(2)} ${t.units.m}`, tint);
      }
    }
    if (guides.length > 0) drawGuides(ctx, tr, guides, width, height);
    // The sizes of the flat, chained along each side outside the walls.
    if (dimensionChains) drawOuterDimensions(ctx, tr, dimensionChains, t.units.m);
  }, [plan, items, electrical, finishes, walls, columns, beams, technical, layers, selection, selectedRoomId, selectedRoomIds, selectedItemId, hover, ghostOpening, paintHover, draftWall, draftBeam, guides, pointerWorld, tool, wallThicknessM, technicalKind, locked, t, locale, gestureVersion, carried, carryPose, wallExtensions, dimensionChains]);

  useEffect(() => {
    draw();
  });

  // The canvas takes its final size a beat after mounting (the page's grid settles, a panel
  // opens); until the person has touched the board, every resize refits the plan. Once they
  // have drawn, moved or zoomed anything, a resize — the toolbar wrapping onto a second row
  // when a tool's options appear, a panel opening — keeps what was in the middle of the
  // sheet in the middle, and the plan stays exactly as large as it was.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const size = { width: canvas.clientWidth, height: canvas.clientHeight };
      const previous = lastSize.current;
      lastSize.current = size;
      if (userAdjusted.current || edited.current) {
        if (previous) {
          const tr = transformRef.current;
          transformRef.current = { ...tr, offsetX: tr.offsetX + (size.width - previous.width) / 2, offsetY: tr.offsetY + (size.height - previous.height) / 2 };
        }
        draw();
      } else fitView();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw, fitView]);

  // Anything the person adds or moves pins the view: from then on the sheet never jumps.
  useEffect(() => {
    if (fitted.current !== undefined && fitted.current === fitKey) return;
    edited.current = false;
  }, [fitKey]);

  // -------------------------------------------------------------------------
  // Hit testing
  // -------------------------------------------------------------------------

  const worldOf = (e: { clientX: number; clientY: number }): Vec2 => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return toWorld(transformRef.current, e.clientX - rect.left, e.clientY - rect.top);
  };
  const perPx = () => 1 / transformRef.current.scale;

  const openingAt = (world: Vec2): { room: PlanRoom; opening: Opening; edge: PlanEdge } | null => {
    const reach = HIT_PX * perPx() + plan.wallThicknessM / 2;
    let best: { room: PlanRoom; opening: Opening; edge: PlanEdge; d: number } | null = null;
    for (const room of plan.rooms) {
      const edges = roomEdges(room.polygon);
      for (const opening of room.openings) {
        const edge = edges.find((e) => e.index === opening.wallIndex);
        if (!edge) continue;
        const halfT = opening.widthM / 2 / edge.length;
        const a = pointOnEdge(edge, Math.max(0, opening.t - halfT));
        const b = pointOnEdge(edge, Math.min(1, opening.t + halfT));
        const d = distanceToSegment(world, a, b);
        if (d <= reach && (!best || d < best.d)) best = { room, opening, edge, d };
      }
    }
    return best;
  };

  const itemAt = (world: Vec2): PlacedItem | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const dx = world.x - item.position.x;
      const dz = world.z - item.position.z;
      const c = Math.cos(item.rotation);
      const s = Math.sin(item.rotation);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= item.size.width / 2 && Math.abs(lz) <= item.size.depth / 2) return item;
    }
    return null;
  };

  const zoneAt = (world: Vec2): SurfaceFinish | null => finishes.find((f) => f.zone && pointInPolygon(world, f.zone.polygon)) ?? null;

  const roomAt = (world: Vec2): PlanRoom | null => roomAtPoint(plan.rooms, world);

  const hitTest = (world: Vec2): Hover => {
    const slack = HIT_PX * perPx();
    if (roomsOnly) {
      const zone = layers.zones ? zoneAt(world) : null;
      if (zone?.zone) return { kind: 'zone', id: zone.zone.id, roomId: zone.roomId };
      const inside = roomAt(world);
      return inside ? { kind: 'room', id: inside.id } : { kind: null };
    }
    if (layers.electrical) {
      const p = pointElementAt(electrical, world, 12 * perPx());
      if (p) return { kind: 'electrical', id: p.id };
    }
    if (layers.technical) {
      const p = pointElementAt(technical, world, 14 * perPx());
      if (p) return { kind: 'technical', id: p.id };
    }
    if (layers.openings) {
      const o = openingAt(world);
      if (o) return { kind: 'opening', id: o.opening.id, roomId: o.room.id };
    }
    if (layers.structure) {
      const c = columnAt(columns, world, slack);
      if (c) return { kind: 'column', id: c.id };
      const b = beamAt(beams, world, slack);
      if (b) return { kind: 'beam', id: b.id };
    }
    if (layers.walls) {
      if (selection?.kind === 'wall' && !locked) {
        const wall = walls.find((w) => w.id === selection.id);
        if (wall && [wall.a, wall.b].some((p) => Math.hypot(p.x - world.x, p.z - world.z) <= slack * 1.2)) return { kind: 'node' };
      }
      const w = wallAt(walls, world, slack);
      if (w) return { kind: 'wall', id: w.wall.id };
    }
    if (layers.furniture) {
      const item = itemAt(world);
      if (item) return { kind: 'item', id: item.id };
    }
    if (layers.zones) {
      const z = zoneAt(world);
      if (z?.zone) return { kind: 'zone', id: z.zone.id, roomId: z.roomId };
    }
    const room = roomAt(world);
    return room ? { kind: 'room', id: room.id } : { kind: null };
  };

  /** The wall (room edge) a door or window would land on. */
  const wallTargetFor = (world: Vec2, preferRoomId?: string | null): { room: PlanRoom; edge: PlanEdge } | null => {
    const inside = roomAt(world);
    if (inside) return nearestWall([inside], world, Infinity, preferRoomId);
    return nearestWall(plan.rooms, world, 28 * perPx(), preferRoomId);
  };

  /**
   * What the paint brush would paint at a point. The floor: the tile of the room the point
   * is in. A wall: the strip nearest to the point on the walls of the room the point is in —
   * so a shared wall is always painted on the side the pointer is on.
   */
  const paintTargetFor = (world: Vec2): PaintTarget | null => {
    const room = roomAt(world);
    if (!room || !paintScope) return null;
    if (paintScope === 'cell') {
      const cell = cellAt(room, world);
      return cell ? { roomId: room.id, surface: 'floor', cell } : null;
    }
    const spot = wallSpotAt(room, world, Math.max(0.6, 40 * perPx()));
    if (!spot) return null;
    const span = stripAt(spot.edge, spot.s);
    // A plan is flat: the square metre it can point at is the one at the foot of the wall.
    return paintScope === 'patch'
      ? { roomId: room.id, surface: 'wall', wallIndex: spot.edge.index, span, patch: patchAt(spot.edge, room.heightM, spot.s, 0) }
      : { roomId: room.id, surface: 'wall', wallIndex: spot.edge.index, span };
  };
  const paintKey = (target: PaintTarget | null): string =>
    !target ? '' : target.surface === 'floor' ? `${target.roomId}|f|${target.cell[0]}|${target.cell[1]}` : `${target.roomId}|w|${target.wallIndex}|${target.patch ? target.patch.join(',') : target.span.from}`;

  // -------------------------------------------------------------------------
  // Pointer
  // -------------------------------------------------------------------------

  const snapFor = (world: Vec2, anchor?: Vec2 | null, ignoreWallId?: string | null) =>
    snapPoint(world, { walls, anchor, tolM: SNAP_PX * perPx(), gridM: shiftHeld.current ? 0.01 : 0.05, ignoreWallId, free: shiftHeld.current });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer (tests) has no capture; the drag still works while the pointer stays over the canvas.
    }
    const world = worldOf(e);
    const tr = transformRef.current;
    const wantsPan = tool === 'pan' || e.button === 1 || spaceHeld.current;
    if (wantsPan) {
      gestureRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, offsetX: tr.offsetX, offsetY: tr.offsetY };
      return;
    }
    if (e.button !== 0) return;
    // A piece on the pointer: the click sets it down where it fits, and nothing else happens
    // on the board until it is down or given up.
    if (carried) {
      dropCarriedAt(world);
      return;
    }

    switch (tool) {
      case 'wall': {
        const snapped = snapFor(world, draftWall?.anchor ?? null);
        if (!draftWall) {
          setDraftWall({ anchor: snapped.point, current: snapped.point });
        } else {
          const a = draftWall.anchor;
          const b = snapped.point;
          if (Math.hypot(b.x - a.x, b.z - a.z) >= 0.1) {
            edited.current = true;
            callbacks.current.onAddWall?.(a, b);
            // The run continues from the point just placed; a click on an existing junction ends it.
            setDraftWall(snapped.snappedTo === 'node' ? null : { anchor: b, current: b });
          }
        }
        setGuides(snapped.guides);
        return;
      }
      case 'beam': {
        const snapped = snapFor(world, draftBeam?.anchor ?? null);
        if (!draftBeam) setDraftBeam({ anchor: snapped.point, current: snapped.point });
        else {
          const a = draftBeam.anchor;
          if (Math.hypot(snapped.point.x - a.x, snapped.point.z - a.z) >= 0.2) {
            edited.current = true;
            callbacks.current.onAddBeam?.(a, snapped.point);
          }
          setDraftBeam(null);
          callbacks.current.onToolDone?.();
        }
        return;
      }
      case 'room':
      case 'zone': {
        const room = tool === 'zone' ? roomAt(world) : null;
        if (tool === 'zone' && !room) return;
        const start = tool === 'room' ? snapFor(world).point : world;
        gestureRef.current = { kind: 'rect', start, current: start, roomId: room?.id ?? null };
        setGestureVersion((v) => v + 1);
        return;
      }
      case 'paint': {
        const target = paintTargetFor(world);
        gestureRef.current = { kind: 'paint', last: paintKey(target) };
        if (target) {
          edited.current = true;
          callbacks.current.onPaint?.(target);
        }
        return;
      }
      case 'door':
      case 'window': {
        const target = wallTargetFor(world);
        if (!target) return;
        const widthM = Math.min(OPENING_DEFAULTS[tool].widthM, Math.max(0.5, target.edge.length - 0.3));
        const tt = projectToEdge(target.edge, world, widthM);
        const id = callbacks.current.onAddOpening?.(tool, { roomId: target.room.id, wallIndex: target.edge.index, t: tt }) ?? null;
        if (id === null) callbacks.current.onRefused?.('opening');
        else {
          edited.current = true;
          callbacks.current.onSelect({ kind: 'opening', id, roomId: target.room.id });
        }
        return;
      }
      case 'column': {
        edited.current = true;
        callbacks.current.onAddColumn?.(snapFor(world).point);
        callbacks.current.onToolDone?.();
        return;
      }
      case 'technical': {
        // A click on a point already there picks it up rather than stacking another on it.
        const existing = pointElementAt(technical, world, 14 * perPx());
        if (existing) {
          callbacks.current.onSelect({ kind: 'technical', id: existing.id });
          gestureRef.current = { kind: 'point-drag', what: 'technical', id: existing.id, position: existing.position, moved: false };
          setGestureVersion((v) => v + 1);
          return;
        }
        edited.current = true;
        callbacks.current.onAddTechnical?.(technicalKind, roundCm(world), roomAt(world)?.id ?? null);
        callbacks.current.onToolDone?.();
        return;
      }
      case 'electrical': {
        const room = roomAt(world);
        if (!room) {
          callbacks.current.onRefused?.('opening');
          return;
        }
        edited.current = true;
        callbacks.current.onAddElectrical?.(electricalKind, roundCm(world), room.id);
        callbacks.current.onToolDone?.();
        return;
      }
      case 'select':
      default: {
        const hit = hitTest(world);
        if (hit.kind === 'node' && selection?.kind === 'wall') {
          const wall = walls.find((w) => w.id === selection.id)!;
          const from = Math.hypot(wall.a.x - world.x, wall.a.z - world.z) <= Math.hypot(wall.b.x - world.x, wall.b.z - world.z) ? wall.a : wall.b;
          gestureRef.current = { kind: 'node-drag', wallId: wall.id, from, to: from, moved: false, alone: shiftHeld.current };
        } else if (hit.kind === 'wall') {
          callbacks.current.onSelect({ kind: 'wall', id: hit.id! });
          const wall = walls.find((w) => w.id === hit.id)!;
          if (!locked && !wall.locked) gestureRef.current = { kind: 'wall-drag', wall, startWorld: world, distance: 0, moved: false, alone: shiftHeld.current };
        } else if (hit.kind === 'opening') {
          const o = openingAt(world)!;
          callbacks.current.onSelect({ kind: 'opening', id: o.opening.id, roomId: o.room.id });
          if (!locked && !o.opening.locked) gestureRef.current = { kind: 'opening-drag', room: o.room, opening: o.opening, edge: o.edge, target: { room: o.room, edge: o.edge, t: o.opening.t }, moved: false };
        } else if (hit.kind === 'column' || hit.kind === 'technical' || hit.kind === 'electrical') {
          callbacks.current.onSelect({ kind: hit.kind, id: hit.id! });
          const movable = hit.kind !== 'column' || !locked;
          const position = hit.kind === 'column' ? columns.find((c) => c.id === hit.id)!.position : hit.kind === 'technical' ? technical.find((p) => p.id === hit.id)!.position : electrical.find((p) => p.id === hit.id)!.position;
          if (movable) gestureRef.current = { kind: 'point-drag', what: hit.kind, id: hit.id!, position, moved: false };
        } else if (hit.kind === 'beam') {
          callbacks.current.onSelect({ kind: 'beam', id: hit.id! });
        } else if (hit.kind === 'item') {
          const item = items.find((i) => i.id === hit.id)!;
          callbacks.current.onSelectItem?.(item.id);
          callbacks.current.onSelect(null);
          if (!item.locked && callbacks.current.onMoveItem) {
            gestureRef.current = { kind: 'item-drag', item, grab: { x: item.position.x - world.x, z: item.position.z - world.z }, position: item.position, roomId: item.roomId, valid: true, moved: false };
          }
        } else if (hit.kind === 'zone') {
          callbacks.current.onSelect({ kind: 'zone', id: hit.id!, roomId: hit.roomId! });
        } else if (hit.kind === 'room') {
          const id = hit.id!;
          // Shift adds to or takes out of the selection, like a desktop; a plain click on a
          // room already in it keeps the whole group, so several rooms drag together.
          const group = e.shiftKey
            ? selectedRoomIds.includes(id)
              ? selectedRoomIds.filter((r) => r !== id)
              : [...selectedRoomIds, id]
            : selectedRoomIds.includes(id)
              ? selectedRoomIds
              : [id];
          callbacks.current.onSelectRooms?.(group);
          callbacks.current.onSelect({ kind: 'room', id });
          callbacks.current.onSelectRoom?.(id);
          if (!locked && !roomsOnly && callbacks.current.onMoveRooms && group.includes(id)) {
            // Rooms with a wall in common are one body: the drag takes every room joined to
            // the ones grabbed, and nothing is ever pulled apart. The selection stays what
            // was clicked — Delete must not take the flat with the room.
            const move = wallsForMove(plan, group);
            gestureRef.current = { kind: 'room-drag', roomIds: move.roomIds, moving: move.moving, staying: move.staying, startWorld: world, delta: { x: 0, z: 0 }, moved: false, overlaps: false };
          }
        } else {
          // Empty sheet: a rubber band across the rooms, not a pan. Panning is still space,
          // the middle button and the hand tool.
          if (!e.shiftKey) {
            callbacks.current.onSelect(null);
            callbacks.current.onSelectRoom?.(null);
            callbacks.current.onSelectItem?.(null);
          }
          gestureRef.current = callbacks.current.onSelectRooms
            ? { kind: 'marquee', start: world, current: world, additive: e.shiftKey }
            : { kind: 'pan', startX: e.clientX, startY: e.clientY, offsetX: tr.offsetX, offsetY: tr.offsetY };
        }
        setGestureVersion((v) => v + 1);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const world = worldOf(e);
    const gesture = gestureRef.current;
    setPointerWorld(world);

    if (gesture) {
      switch (gesture.kind) {
        case 'pan': {
          transformRef.current = { ...transformRef.current, offsetX: gesture.offsetX + (e.clientX - gesture.startX), offsetY: gesture.offsetY + (e.clientY - gesture.startY) };
          userAdjusted.current = true;
          redraw();
          return;
        }
        case 'rect': {
          gesture.current = tool === 'room' ? snapFor(world).point : world;
          if (tool === 'room') {
            // The rectangle is shown where it will land — pulled onto the walls it is drawn
            // against — so what is let go of is what appears. A rectangle over a room that
            // is already there is shown in the refusal colour and not taken.
            const snapped = snapRectangle(normaliseRect(gesture.start, gesture.current), walls, wallThicknessM, SNAP_PX * perPx() * 1.5);
            gesture.snapped = snapped.rect;
            gesture.overlaps = roomUnderRect(snapped.rect, plan.rooms) !== null;
            setGuides(gesture.overlaps ? [] : snapped.guides);
          }
          setGestureVersion((v) => v + 1);
          return;
        }
        case 'wall-drag': {
          const n = wallNormal(gesture.wall);
          const raw = (world.x - gesture.startWorld.x) * n.x + (world.z - gesture.startWorld.z) * n.z;
          gesture.distance = Math.round(raw * 100) / 100;
          gesture.moved = gesture.moved || Math.abs(raw) * transformRef.current.scale > DRAG_THRESHOLD_PX;
          // Shift can be pressed or let go in the middle of the drag: what counts is where it is at the drop.
          gesture.alone = shiftHeld.current;
          setGestureVersion((v) => v + 1);
          return;
        }
        case 'node-drag': {
          const snapped = snapFor(world, null, null);
          gesture.to = snapped.point;
          gesture.alone = shiftHeld.current;
          gesture.moved = gesture.moved || Math.hypot(world.x - gesture.from.x, world.z - gesture.from.z) * transformRef.current.scale > DRAG_THRESHOLD_PX;
          setGuides(snapped.guides);
          setGestureVersion((v) => v + 1);
          return;
        }
        case 'opening-drag': {
          const target = callbacks.current.onMoveOpeningToWall ? wallTargetFor(world, gesture.room.id) : null;
          const room = target?.room ?? gesture.room;
          const edge = target?.edge ?? gesture.edge;
          const tt = projectToEdge(edge, world, gesture.opening.widthM);
          gesture.target = { room, edge, t: tt };
          gesture.moved = true;
          setGhostOpening({ room, edge, t: tt, widthM: gesture.opening.widthM, kind: gesture.opening.kind === 'window' ? 'window' : 'door', openingId: gesture.opening.id, faded: false });
          return;
        }
        case 'point-drag': {
          gesture.position = gesture.what === 'column' ? snapFor(world).point : roundCm(world);
          gesture.moved = true;
          setGestureVersion((v) => v + 1);
          return;
        }
        case 'item-drag': {
          const desired = { x: world.x + gesture.grab.x, z: world.z + gesture.grab.z };
          const room = roomAt(desired) ?? plan.rooms.find((r) => r.id === gesture.roomId) ?? null;
          if (!room) return;
          const result = snapPlacement(room, gesture.item, { position: desired, rotation: gesture.item.rotation }, items);
          gesture.position = result.position;
          gesture.roomId = room.id;
          gesture.valid = result.valid;
          gesture.moved = gesture.moved || Math.hypot(result.position.x - gesture.item.position.x, result.position.z - gesture.item.position.z) > 0.02;
          setGestureVersion((v) => v + 1);
          return;
        }
        case 'paint': {
          // The brush paints whatever it passes over, each tile or strip once.
          const target = paintTargetFor(world);
          const key = paintKey(target);
          if (target && key !== gesture.last) callbacks.current.onPaint?.(target);
          gesture.last = key;
          if (paintKey(paintHover) !== key) setPaintHover(target);
          return;
        }
        case 'marquee': {
          gesture.current = world;
          setGestureVersion((v) => v + 1);
          return;
        }
        case 'room-drag': {
          // A wall of the travellers that comes near a wall staying behind lands exactly on
          // its line, so two rooms pushed together have one wall between them; the guides
          // say which line that is. Nothing in reach: the grid.
          const raw = { x: world.x - gesture.startWorld.x, z: world.z - gesture.startWorld.z };
          const snapped = snapRoomMove(gesture.moving, gesture.staying, raw, { tolM: SNAP_PX * perPx() * 1.5, gridM: shiftHeld.current ? MOVE_STEP_M : 0.05 });
          gesture.delta = snapped.delta;
          gesture.moved = gesture.moved || Math.hypot(raw.x, raw.z) * transformRef.current.scale > DRAG_THRESHOLD_PX;
          setGuides(gesture.moved ? snapped.guides : []);
          // Dropped on a room that is staying put, the two outlines would cross and the wall
          // graph would trace the crossing as a sliver room with walls through it; a wall set
          // down half inside another does the same damage a few centimetres at a time.
          const delta = snapped.delta;
          gesture.overlaps =
            roomsWouldOverlap(plan.rooms, gesture.roomIds, delta) ||
            wallsClash(gesture.moving.map((w) => ({ ...w, a: { x: w.a.x + delta.x, z: w.a.z + delta.z }, b: { x: w.b.x + delta.x, z: w.b.z + delta.z } })), gesture.staying);
          setGestureVersion((v) => v + 1);
          return;
        }
      }
    }

    // No gesture: the carried piece, else previews and hover.
    if (carried) {
      setCarryAt({ id: carried.id, world });
      return;
    }
    if (tool === 'paint') {
      const target = paintTargetFor(world);
      if (paintKey(target) !== paintKey(paintHover)) setPaintHover(target);
      return;
    }
    if (tool === 'wall' && draftWall) {
      const snapped = snapFor(world, draftWall.anchor);
      setDraftWall({ anchor: draftWall.anchor, current: snapped.point });
      setGuides(snapped.guides);
      return;
    }
    if (tool === 'beam' && draftBeam) {
      const snapped = snapFor(world, draftBeam.anchor);
      setDraftBeam({ anchor: draftBeam.anchor, current: snapped.point });
      setGuides(snapped.guides);
      return;
    }
    if (tool === 'wall' || tool === 'column' || tool === 'beam') {
      const snapped = snapFor(world);
      setGuides(snapped.guides);
      return;
    }
    if (tool === 'door' || tool === 'window') {
      const target = wallTargetFor(world);
      if (!target) {
        setGhostOpening(null);
        return;
      }
      const widthM = Math.min(OPENING_DEFAULTS[tool].widthM, Math.max(0.5, target.edge.length - 0.3));
      setGhostOpening({ room: target.room, edge: target.edge, t: projectToEdge(target.edge, world, widthM), widthM, kind: tool, openingId: null, faded: false });
      return;
    }
    if (tool === 'select') {
      const hit = hitTest(world);
      if (hit.kind !== hover.kind || hit.id !== hover.id) setHover(hit);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setGuides([]);
    if (!gesture) return;
    const world = worldOf(e);
    if (gesture.kind !== 'pan' && gesture.kind !== 'marquee') edited.current = true;
    switch (gesture.kind) {
      case 'rect': {
        const rect = normaliseRect(gesture.start, gesture.current);
        if (rect.width >= 0.3 && rect.depth >= 0.3) {
          if (tool === 'room') {
            const snapped = gesture.snapped ?? snapRectangle(rect, walls, wallThicknessM, SNAP_PX * perPx() * 1.5).rect;
            // Rooms do not lie on top of each other: the wall graph would trace the
            // crossings as slivers and nothing could be pulled apart again.
            if (roomUnderRect(snapped, plan.rooms)) callbacks.current.onRefused?.('overlap');
            else callbacks.current.onAddRectangle?.(snapped);
          } else if (tool === 'zone' && gesture.roomId) {
            callbacks.current.onAddZone?.(gesture.roomId, rect);
          }
        }
        break;
      }
      case 'wall-drag':
        if (gesture.moved && Math.abs(gesture.distance) >= 0.01) callbacks.current.onOffsetWall?.(gesture.wall.id, gesture.distance, gesture.alone);
        break;
      case 'node-drag':
        if (gesture.moved && (Math.abs(gesture.to.x - gesture.from.x) > 0.005 || Math.abs(gesture.to.z - gesture.from.z) > 0.005)) callbacks.current.onMoveNode?.(gesture.from, gesture.to, gesture.alone ? gesture.wallId : null);
        break;
      case 'opening-drag': {
        setGhostOpening(null);
        if (!gesture.moved) break;
        const { room, edge, t: tt } = gesture.target;
        const sameWall = room.id === gesture.room.id && edge.index === gesture.opening.wallIndex;
        if (sameWall) {
          if (Math.abs(tt - gesture.opening.t) > 1e-4) {
            if (callbacks.current.onMoveOpening) callbacks.current.onMoveOpening(gesture.room.id, gesture.opening.id, tt);
            else callbacks.current.onMoveOpeningToWall?.(gesture.room.id, gesture.opening.id, { roomId: room.id, wallIndex: edge.index, t: tt });
          }
        } else {
          const id = callbacks.current.onMoveOpeningToWall?.(gesture.room.id, gesture.opening.id, { roomId: room.id, wallIndex: edge.index, t: tt }) ?? null;
          if (id === null) callbacks.current.onRefused?.('opening');
          else callbacks.current.onSelect({ kind: 'opening', id, roomId: room.id });
        }
        break;
      }
      case 'point-drag':
        if (gesture.moved) {
          if (gesture.what === 'column') callbacks.current.onMoveColumn?.(gesture.id, gesture.position);
          if (gesture.what === 'technical') callbacks.current.onMoveTechnical?.(gesture.id, gesture.position);
          if (gesture.what === 'electrical') callbacks.current.onMoveElectrical?.(gesture.id, gesture.position);
        }
        break;
      case 'item-drag':
        if (gesture.moved && gesture.valid) callbacks.current.onMoveItem?.(gesture.item.id, gesture.position, gesture.item.rotation, gesture.roomId);
        break;
      case 'marquee': {
        const rect = normaliseRect(gesture.start, gesture.current);
        // A click that never moved clears the selection; a band takes every room it touches.
        const inside = rect.width < 0.05 && rect.depth < 0.05 ? [] : plan.rooms.filter((r) => r.polygon.some((p) => p.x >= rect.x && p.x <= rect.x + rect.width && p.z >= rect.z && p.z <= rect.z + rect.depth)).map((r) => r.id);
        callbacks.current.onSelectRooms?.(gesture.additive ? [...new Set([...selectedRoomIds, ...inside])] : inside);
        break;
      }
      case 'room-drag':
        if (gesture.moved && (Math.abs(gesture.delta.x) >= MOVE_STEP_M || Math.abs(gesture.delta.z) >= MOVE_STEP_M)) {
          // Rooms do not lie on top of each other, however they got there.
          if (gesture.overlaps) callbacks.current.onRefused?.('overlap');
          else callbacks.current.onMoveRooms?.(gesture.roomIds, gesture.delta);
        }
        break;
      case 'pan':
      case 'paint':
        break;
    }
    void world;
    setGestureVersion((v) => v + 1);
  };

  const onDoubleClick = () => {
    if (draftWall) {
      setDraftWall(null);
      setGuides([]);
    }
  };

  const cursor =
    carried ? 'grabbing' : tool === 'pan' ? 'grab' : tool === 'select' ? (hover.kind === 'wall' || hover.kind === 'opening' || hover.kind === 'item' || hover.kind === 'column' || hover.kind === 'technical' || hover.kind === 'electrical' ? (locked && (hover.kind === 'wall' || hover.kind === 'opening' || hover.kind === 'column') ? 'pointer' : 'move') : hover.kind === 'node' ? 'crosshair' : 'default') : 'crosshair';

  return (
    <canvas
      ref={canvasRef}
      className={cn('block h-full w-full touch-none select-none', className)}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        // A right click ends a wall run, like in CAD.
        if (draftWall) setDraftWall(null);
        if (draftBeam) setDraftBeam(null);
        setGuides([]);
      }}
      onPointerLeave={() => {
        setPointerWorld(null);
        setPaintHover(null);
        if (!gestureRef.current) setHover({ kind: null });
        if ((tool === 'door' || tool === 'window') && !gestureRef.current) setGhostOpening(null);
      }}
    />
  );
}

/** Would the rooms being dragged land on a room that is staying where it is? */
function roomsWouldOverlap(rooms: PlanRoom[], movingIds: string[], delta: Vec2): boolean {
  const moving = new Set(movingIds);
  const staying = rooms.filter((r) => !moving.has(r.id));
  if (staying.length === 0) return false;
  return rooms
    .filter((r) => moving.has(r.id))
    .some((room) => {
      const moved = room.polygon.map((p) => ({ x: p.x + delta.x, z: p.z + delta.z }));
      return staying.some((other) => polygonsOverlap(moved, other.polygon));
    });
}

/** Metres → CSS pixels, for the plates drawn beside a gesture. */
function toScreenPoint(t: Transform, p: Vec2): { x: number; y: number } {
  return { x: p.x * t.scale + t.offsetX, y: p.z * t.scale + t.offsetY };
}

function normaliseRect(a: Vec2, b: Vec2): { x: number; z: number; width: number; depth: number } {
  const x = Math.min(a.x, b.x);
  const z = Math.min(a.z, b.z);
  return { x: round2(x), z: round2(z), width: round2(Math.abs(b.x - a.x)), depth: round2(Math.abs(b.z - a.z)) };
}

function roundCm(p: Vec2): Vec2 {
  return { x: round2(p.x), z: round2(p.z) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

