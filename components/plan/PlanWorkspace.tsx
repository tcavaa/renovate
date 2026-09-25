'use client';

/**
 * The editor with its build bar and hint line, wired to the design store — the same
 * drawing board on the "existing house" step, the technical step, the studio's 2D view and
 * the calculator's first step. Each caller says which tools to offer and which layers to
 * show; the store does the rest.
 *
 * The view refits only when a *different* plan arrives (`planSerial`): drawing a wall or
 * dropping a room never recentres the sheet under the person's hands.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn, formatM2 } from '@/lib/utils';
import { useDesignStore, type DesignStoreHook } from '@/store/designStore';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';
import type { PaintTarget } from '@/lib/design/paint';
import { ALL_LAYERS, PlanEditor, type BoardInsets, type EditorLayers, type EditorTool, type PlanEditorApi } from './PlanEditor';
import { PlanToolbar, PlanToolOptions, PlanToolTiles, PlanViewControls, toolHint } from './PlanToolbar';

export interface PlanWorkspaceProps {
  tools: EditorTool[];
  /** The tool to start with, and the one the page can drive (the studio's build bar). */
  tool?: EditorTool;
  onTool?: (tool: EditorTool) => void;
  /** The tool in hand at first, when the page does not drive the tool itself. The first offered otherwise. */
  defaultTool?: EditorTool;
  layers?: Partial<EditorLayers>;
  layerKeys?: Array<keyof EditorLayers>;
  /** Walls, doors and windows are picked but never moved. */
  locked?: boolean;
  /** Show the furniture footprints and let them be dragged. */
  furniture?: boolean;
  electricalKind?: ElectricalKind;
  onElectricalKind?: (kind: ElectricalKind) => void;
  /** The technical kind in hand, when the page shows its own picker (the toolbar then hides its row). */
  technicalKind?: TechnicalKind;
  onTechnicalKind?: (kind: TechnicalKind) => void;
  className?: string;
  /** Height of the drawing area; the page's own layout otherwise. */
  height?: number | string;
  /** Hide the toolbar (the studio draws its own build bar). */
  hideToolbar?: boolean;
  /** Ctrl+Z / Ctrl+Y on the board undo through the store. Off where the page handles the keys itself. */
  keyboardUndo?: boolean;
  /** Show the flat's total area and room count in the corner of the sheet. */
  showTotals?: boolean;
  /** Called when the pointer tool finished a one-shot action. */
  onToolDone?: () => void;
  /** A refused drop, and why (`PlanEditor.onRefused`). */
  onRefused?: (reason: 'opening' | 'overlap') => void;
  /** The paint tool's scope and what it does with a tile or a strip — see `PlanEditor.onPaint`. */
  paintScope?: 'cell' | 'strip' | 'patch' | null;
  onPaint?: (target: PaintTarget) => void;
  /** Only rooms and floor zones answer to the select tool (the studio's finishes). */
  roomsOnly?: boolean;
  /** Escape with nothing on the board to end — see `PlanEditor.onEscape`. */
  onEscape?: () => void;
  /** The board's view and carry controls, for a page that drives them (`PlanEditor.onApi`). */
  onApi?: (api: PlanEditorApi | null) => void;
  /**
   * Which board to edit. The studio's by default; the calculator hands in its own
   * (`useCalculatorPlanStore`) so the two flats never meet.
   */
  store?: DesignStoreHook;
  /**
   * The board of a full-screen step (`FlowWorkspace`). From `lg` up it fills the step edge to
   * edge — no frame, the sheet under everything — and its toolbar floats over it the way a
   * design app's does: the tools down the left from `top`, what the tool in hand can be told
   * along the bottom with the hint over it, the area in the bottom-left corner, the layers and
   * the zoom in a column at the bottom right, `right` px in from the edge (clear of the page's
   * panel). A plan is framed in whatever the floating parts leave of the sheet. Below `lg` it is
   * the ordinary board with its toolbar row.
   */
  bleed?: { top: number; right: number };
  /**
   * A tray of the page's own that belongs with the board — the kinds of point, the brush:
   * along the bottom of a full-screen board, under the hint; above the board otherwise.
   */
  dock?: React.ReactNode;
  /**
   * The sheet fills its container at every size, with no frame — the studio's 2D view, which
   * runs under the studio's own floating bars the way its 3D view does. A plan is framed in
   * what those bars (`data-board-edge`) leave of it.
   */
  frameless?: boolean;
  /** The tool's hint on the board; off where the page shows it itself (the studio floats it above its tray). */
  hint?: boolean;
}

export function PlanWorkspace({ tools, tool: controlledTool, onTool, defaultTool, layers: layerOverrides, layerKeys, locked = false, furniture = false, electricalKind: controlledElectrical, onElectricalKind, technicalKind: controlledTechnical, onTechnicalKind, className, height, hideToolbar, keyboardUndo = true, showTotals = true, onToolDone, onRefused, paintScope = null, onPaint, roomsOnly = false, onEscape, onApi: onApiProp, store = useDesignStore, bleed, dock, frameless = false, hint: showHint = true }: PlanWorkspaceProps) {
  const t = useT();
  // The hook comes in as a prop, but it is a module constant either way — the same store for
  // the life of the component, so the rules of hooks hold.
  const useStore = store;
  const plan = useStore((s) => s.plan);
  const planSerial = useStore((s) => s.planSerial);
  const items = useStore((s) => s.items);
  const electrical = useStore((s) => s.electrical);
  const finishes = useStore((s) => s.finishes);
  const selection = useStore((s) => s.selectedElement);
  const selectedItemId = useStore((s) => s.selectedItemId);
  const focusRoomId = useStore((s) => s.focusRoomId);
  const selectedRoomIds = useStore((s) => s.selectedRoomIds);
  const carryingItemId = useStore((s) => s.carryingItemId);
  const selectedRoomPart = useStore((s) => s.selectedRoomPart);
  const actions = useStore();

  const [innerTool, setInnerTool] = useState<EditorTool>(controlledTool ?? defaultTool ?? tools[0] ?? 'select');
  const tool = controlledTool ?? innerTool;
  const setTool = useCallback(
    (next: EditorTool) => {
      setInnerTool(next);
      onTool?.(next);
    },
    [onTool]
  );
  const [thicknessM, setThicknessM] = useState(plan?.wallThicknessM ?? 0.12);
  const [innerTechnical, setInnerTechnical] = useState<TechnicalKind>('water_supply');
  const technicalKind = controlledTechnical ?? innerTechnical;
  const [innerElectrical, setInnerElectrical] = useState<ElectricalKind>('socket');
  const electricalKind = controlledElectrical ?? innerElectrical;
  const [layers, setLayers] = useState<EditorLayers>({ ...ALL_LAYERS, furniture, ...layerOverrides });
  useEffect(() => setLayers((l) => ({ ...l, ...layerOverrides, furniture: layerOverrides?.furniture ?? furniture })), [layerOverrides, furniture]);
  const [api, setApi] = useState<PlanEditorApi | null>(null);
  const onApi = useCallback(
    (next: PlanEditorApi | null) => {
      setApi(next);
      onApiProp?.(next);
    },
    [onApiProp]
  );

  // A new plan (a new upload, a saved project, the calculator's rooms) refits the view; an
  // edit to the plan on the board leaves the view exactly where the person had it.
  const fitKey = useMemo(() => `${planSerial}:${plan?.source ?? ''}:${plan?.imageUrl ?? ''}`, [planSerial, plan?.source, plan?.imageUrl]);

  const deleteSelected = useCallback(() => {
    const s = useStore.getState();
    const sel = s.selectedElement;
    if (s.selectedItemId && !sel) {
      const item = s.items.find((i) => i.id === s.selectedItemId);
      if (item && !item.locked) s.removeItem(item.id);
      return;
    }
    if (!sel) return;
    const structural = sel.kind === 'wall' || sel.kind === 'opening' || sel.kind === 'column' || sel.kind === 'beam';
    if (structural && locked) return;
    switch (sel.kind) {
      case 'wall':
        s.removeWall(sel.id);
        break;
      case 'opening':
        s.removeOpening(sel.roomId, sel.id);
        break;
      case 'column':
        s.removeColumn(sel.id);
        break;
      case 'beam':
        s.removeBeam(sel.id);
        break;
      case 'technical':
        s.removeTechnicalPoint(sel.id);
        break;
      case 'electrical':
        s.removeElectricalPoint(sel.id);
        break;
      case 'zone':
        s.removeFinishZone(sel.roomId, sel.id);
        break;
      case 'room':
        // A rubber band selection goes at once; a single pick is just itself.
        if (!locked) for (const id of s.selectedRoomIds.includes(sel.id) ? s.selectedRoomIds : [sel.id]) s.removeRoom(id);
        break;
    }
    s.selectElement(null);
    s.selectRooms([]);
  }, [locked, useStore]);

  const undo = useCallback(() => useStore.getState().undo(), [useStore]);
  const redo = useCallback(() => useStore.getState().redo(), [useStore]);

  // What floats over a full-screen board, edge by edge, measured whenever the view is fitted:
  // the page's bar and panel, the rail of tools, the band along the bottom — whatever carries
  // `data-board-edge` and actually lies over the sheet. Below `lg` nothing does (the panel
  // stacks under the board), and the sheet is the whole canvas again.
  const rootRef = useRef<HTMLDivElement>(null);
  const coveredEdges = useCallback((): BoardInsets | null => {
    const root = rootRef.current;
    const canvas = root?.querySelector('canvas');
    if (!root || !canvas) return null;
    const box = canvas.getBoundingClientRect();
    const cover: BoardInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    const scope = root.closest('[data-flow-workspace]') ?? root;
    scope.querySelectorAll<HTMLElement>('[data-board-edge]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom) return;
      const edge = el.dataset.boardEdge;
      if (edge === 'top') cover.top = Math.max(cover.top, r.bottom - box.top);
      else if (edge === 'bottom') cover.bottom = Math.max(cover.bottom, box.bottom - r.top);
      else if (edge === 'left') cover.left = Math.max(cover.left, r.right - box.left);
      else if (edge === 'right') cover.right = Math.max(cover.right, box.right - r.left);
    });
    return cover;
  }, []);

  if (!plan) return null;

  const totalM2 = totalFloorAreaM2(plan);
  const hint = toolHint(t, tool, locked);
  const totals = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.totalArea}</span>
      <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatM2(totalM2)}</span>
      <span className="text-ink-muted">· {fill(t.build.roomCount, { n: plan.rooms.length })}</span>
    </>
  );
  const optionProps = {
    tools,
    tool,
    onTool: setTool,
    thicknessM,
    onThickness: (m: number) => {
      setThicknessM(m);
      actions.setPlanDefaults({ wallThicknessM: m });
    },
    technicalKind,
    onTechnicalKind: (kind: TechnicalKind) => {
      setInnerTechnical(kind);
      onTechnicalKind?.(kind);
    },
    kindPicker: !onTechnicalKind,
    electricalKind,
    onElectricalKind: (kind: ElectricalKind) => {
      setInnerElectrical(kind);
      onElectricalKind?.(kind);
    },
  };
  const viewProps = { layers, onLayers: setLayers, layerKeys, onFit: () => api?.fit(), onZoom: (f: number) => api?.zoom(f) };

  return (
    <div ref={rootRef} className={cn('flex flex-col gap-3', bleed && 'lg:absolute lg:inset-0 lg:block', className)}>
      {!hideToolbar && <PlanToolbar {...optionProps} {...viewProps} className={bleed ? 'lg:hidden' : undefined} />}
      {bleed && !hideToolbar && <PlanToolTiles tools={tools} tool={tool} onTool={setTool} vertical edge="left" className="absolute left-4 z-10 hidden lg:flex" style={{ top: bleed.top }} />}
      {bleed ? (
        // The band along the bottom of a full-screen board: the area in the corner, the hint and
        // the tool's options (and the page's tray) in the middle, the view in a column at the end.
        // Below `lg` only the page's tray is left of it, in its place above the board.
        <div className="contents lg:pointer-events-none lg:absolute lg:bottom-4 lg:left-4 lg:z-10 lg:flex lg:items-end lg:gap-3" style={{ right: bleed.right }}>
          {showTotals && (
            <p data-board-edge="bottom" className="hidden shrink-0 items-baseline gap-2 rounded-[10px] bg-white/85 px-3 py-1.5 text-xs shadow-glass backdrop-blur lg:flex" aria-live="polite">
              {totals}
            </p>
          )}
          <div data-board-edge="bottom" className={cn('min-w-0 flex-1 flex-col gap-2 lg:flex lg:items-center', dock ? 'flex' : 'hidden')}>
            {showHint && <p className="hidden max-w-[40rem] rounded-[10px] bg-ink/80 px-3 py-1.5 text-center text-[11px] leading-snug text-white backdrop-blur lg:block">{hint}</p>}
            {!hideToolbar && (
              <div className="hidden flex-wrap items-center justify-center gap-2 empty:hidden lg:pointer-events-auto lg:flex">
                <PlanToolOptions {...optionProps} />
              </div>
            )}
            {dock && <div className="lg:pointer-events-auto lg:max-w-full">{dock}</div>}
          </div>
          {!hideToolbar && <PlanViewControls {...viewProps} vertical edge="right" className="hidden shrink-0 lg:pointer-events-auto lg:flex" />}
        </div>
      ) : (
        dock
      )}
      <div
        className={cn('relative overflow-hidden rounded-[18px] border border-line bg-[#FBFAF7]', bleed && 'h-[62vh] min-h-[420px] lg:absolute lg:inset-0 lg:h-auto lg:min-h-0 lg:rounded-none lg:border-0', frameless && 'rounded-none border-0')}
        style={bleed ? undefined : { height: height ?? 560 }}
      >
        <PlanEditor
          plan={plan}
          items={layers.furniture ? items : []}
          electrical={electrical}
          finishes={finishes}
          tool={tool}
          wallThicknessM={thicknessM}
          technicalKind={technicalKind}
          electricalKind={electricalKind}
          layers={layers}
          locked={locked}
          selection={selection}
          selectedRoomId={focusRoomId}
          selectedRoomIds={selectedRoomIds}
          selectedItemId={selectedItemId}
          onSelect={actions.selectElement}
          onSelectRoom={actions.setFocusRoom}
          onSelectRooms={actions.selectRooms}
          onMoveRooms={locked ? undefined : actions.moveRooms}
          onSelectItem={actions.selectItem}
          onAddWall={(a, b) => actions.addWall({ a, b, thicknessM })}
          onAddRectangle={(rect) => actions.addRectangleRoom(rect)}
          onOffsetWall={actions.offsetWall}
          onMoveNode={actions.moveWallNode}
          onAddOpening={(kind, target) => actions.dropOpening(kind, target)}
          onMoveOpening={actions.moveOpening}
          onMoveOpeningToWall={actions.moveOpeningToWall}
          onAddColumn={(position) => actions.addColumn(position)}
          onMoveColumn={(id, position) => actions.updateColumn(id, { position })}
          onAddBeam={(a, b) => actions.addBeam(a, b)}
          onAddTechnical={(kind, position, roomId) => actions.addTechnicalPoint(kind, position, roomId)}
          onMoveTechnical={(id, position) => actions.updateTechnicalPoint(id, { position, roomId: plan.rooms.find((r) => r.polygon && pointIn(position, r.polygon))?.id ?? null })}
          onAddElectrical={(kind, position, roomId) => actions.addElectricalPoint(kind, position, roomId)}
          onMoveElectrical={actions.moveElectricalPoint}
          // A studio's line is where the kitchen stops, not structure: the lock does not hold it.
          onSplitRoom={roomsOnly ? undefined : actions.splitRoom}
          onSelectRoomPart={actions.selectRoomPart}
          selectedRoomPart={selectedRoomPart && selectedRoomPart.roomId === focusRoomId ? selectedRoomPart.part : null}
          onMoveItem={furniture ? actions.placeItem : undefined}
          // The piece on the pointer (the studio's shelf): set down through `placeItem`, then
          // the carry becomes one step of history and the piece is the selection.
          carryingItemId={furniture ? carryingItemId : null}
          onCarryPlaced={(id) => {
            actions.finishCarry();
            actions.selectItem(id);
          }}
          onEscape={onEscape}
          onDelete={deleteSelected}
          onUndo={keyboardUndo ? undo : undefined}
          onRedo={keyboardUndo ? redo : undefined}
          onRefused={onRefused}
          paintScope={paintScope}
          onPaint={onPaint}
          roomsOnly={roomsOnly}
          onToolDone={() => {
            onToolDone?.();
            if (!controlledTool) setTool('select');
          }}
          fitKey={fitKey}
          fitInsets={bleed || frameless ? coveredEdges : undefined}
          onApi={onApi}
        />
        {showTotals && (
          <p className={cn('pointer-events-none absolute left-3 top-3 flex items-baseline gap-2 rounded-[10px] bg-white/85 px-3 py-1.5 text-xs shadow-glass backdrop-blur', bleed && 'lg:hidden')} aria-live="polite">
            {totals}
          </p>
        )}
        {showHint && <p className={cn('pointer-events-none absolute bottom-3 left-3 max-w-[70%] rounded-[10px] bg-ink/80 px-3 py-1.5 text-[11px] leading-snug text-white backdrop-blur', bleed && 'lg:hidden')}>{hint}</p>}
      </div>
    </div>
  );
}

function pointIn(point: { x: number; z: number }, polygon: Array<{ x: number; z: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
