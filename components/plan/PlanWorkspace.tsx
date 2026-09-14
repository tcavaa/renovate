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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn, formatM2 } from '@/lib/utils';
import { useDesignStore } from '@/store/designStore';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';
import { ALL_LAYERS, PlanEditor, type EditorLayers, type EditorTool, type PlanEditorApi } from './PlanEditor';
import { PlanToolbar, toolHint } from './PlanToolbar';

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
  /** A refused drop (a window on a shared wall). */
  onRefused?: () => void;
}

export function PlanWorkspace({ tools, tool: controlledTool, onTool, defaultTool, layers: layerOverrides, layerKeys, locked = false, furniture = false, electricalKind: controlledElectrical, onElectricalKind, technicalKind: controlledTechnical, onTechnicalKind, className, height, hideToolbar, keyboardUndo = true, showTotals = true, onToolDone, onRefused }: PlanWorkspaceProps) {
  const t = useT();
  const plan = useDesignStore((s) => s.plan);
  const planSerial = useDesignStore((s) => s.planSerial);
  const items = useDesignStore((s) => s.items);
  const electrical = useDesignStore((s) => s.electrical);
  const finishes = useDesignStore((s) => s.finishes);
  const selection = useDesignStore((s) => s.selectedElement);
  const selectedItemId = useDesignStore((s) => s.selectedItemId);
  const focusRoomId = useDesignStore((s) => s.focusRoomId);
  const actions = useDesignStore();

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
  const onApi = useCallback((next: PlanEditorApi | null) => setApi(next), []);

  // A new plan (a new upload, a saved project, the calculator's rooms) refits the view; an
  // edit to the plan on the board leaves the view exactly where the person had it.
  const fitKey = useMemo(() => `${planSerial}:${plan?.source ?? ''}:${plan?.imageUrl ?? ''}`, [planSerial, plan?.source, plan?.imageUrl]);

  const deleteSelected = useCallback(() => {
    const s = useDesignStore.getState();
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
        if (!locked) s.removeRoom(sel.id);
        break;
    }
    s.selectElement(null);
  }, [locked]);

  const undo = useCallback(() => useDesignStore.getState().undo(), []);
  const redo = useCallback(() => useDesignStore.getState().redo(), []);

  if (!plan) return null;

  const totalM2 = totalFloorAreaM2(plan);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {!hideToolbar && (
        <PlanToolbar
          tools={tools}
          tool={tool}
          onTool={setTool}
          thicknessM={thicknessM}
          onThickness={(m) => {
            setThicknessM(m);
            actions.setPlanDefaults({ wallThicknessM: m });
          }}
          technicalKind={technicalKind}
          onTechnicalKind={(kind) => {
            setInnerTechnical(kind);
            onTechnicalKind?.(kind);
          }}
          kindPicker={!onTechnicalKind}
          electricalKind={electricalKind}
          onElectricalKind={(kind) => {
            setInnerElectrical(kind);
            onElectricalKind?.(kind);
          }}
          layers={layers}
          onLayers={setLayers}
          layerKeys={layerKeys}
          onFit={() => api?.fit()}
          onZoom={(f) => api?.zoom(f)}
        />
      )}
      <div className="relative overflow-hidden rounded-[18px] border border-line bg-[#FBFAF7]" style={{ height: height ?? 560 }}>
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
          selectedItemId={selectedItemId}
          onSelect={actions.selectElement}
          onSelectRoom={actions.setFocusRoom}
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
          onMoveItem={furniture ? actions.placeItem : undefined}
          onDelete={deleteSelected}
          onUndo={keyboardUndo ? undo : undefined}
          onRedo={keyboardUndo ? redo : undefined}
          onRefused={onRefused}
          onToolDone={() => {
            onToolDone?.();
            if (!controlledTool) setTool('select');
          }}
          fitKey={fitKey}
          onApi={onApi}
        />
        {showTotals && (
          <p className="pointer-events-none absolute left-3 top-3 flex items-baseline gap-2 rounded-[10px] bg-white/85 px-3 py-1.5 text-xs shadow-glass backdrop-blur" aria-live="polite">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.totalArea}</span>
            <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatM2(totalM2)}</span>
            <span className="text-ink-muted">· {fill(t.build.roomCount, { n: plan.rooms.length })}</span>
          </p>
        )}
        <p className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] rounded-[10px] bg-ink/80 px-3 py-1.5 text-[11px] leading-snug text-white backdrop-blur">{toolHint(t, tool, locked)}</p>
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
