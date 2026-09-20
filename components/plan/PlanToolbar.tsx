'use client';

/**
 * The build bar: big tiles, one per tool, with the tool's options beside them — the wall
 * thickness, the kind of technical or electrical point — and the view buttons. Looks like a
 * game's build mode on purpose: the person should never feel they are in CAD.
 */

import { BrickWall, Cable, DoorOpen, Hand, Layers, Maximize2, Minus, MousePointer2, Paintbrush, Plus, RectangleHorizontal, Square, SquareDashed, Wrench, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';
import { WALL_THICKNESS_OPTIONS_M } from '@/lib/design/walls';
import { TECHNICAL_KIND_LIST } from '@/lib/design/technical';
import { ELECTRICAL_KIND_LIST } from '@/lib/design/electrical';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';
import type { Dictionary } from '@/lib/i18n';
import type { EditorLayers, EditorTool } from './PlanEditor';
import { TECHNICAL_COLOR } from './palette';
import { ELECTRICAL_ICON, TECHNICAL_ICON } from './icons';

export const TECHNICAL_LABEL_KEY: Record<TechnicalKind, keyof Dictionary['build']> = {
  water_supply: 'tkWater',
  sewer: 'tkSewer',
  floor_drain: 'tkDrain',
  electrical_panel: 'tkPanel',
  gas: 'tkGas',
  radiator: 'tkRadiator',
  ac_unit: 'tkAc',
  extractor: 'tkExtractor',
  boiler: 'tkBoiler',
  heating_pipe: 'tkHeatingPipe',
};

export const ELECTRICAL_LABEL_KEY: Record<ElectricalKind, keyof Dictionary['build']> = {
  socket: 'ekSocket',
  socket_double: 'ekSocketDouble',
  socket_high: 'ekSocketHigh',
  socket_kitchen: 'ekSocketKitchen',
  switch: 'ekSwitch',
  tv: 'ekTv',
  internet: 'ekInternet',
  light_ceiling: 'ekLightCeiling',
  light_wall: 'ekLightWall',
  light_spot: 'ekLightSpot',
  light_strip: 'ekLightStrip',
  light_furniture: 'ekLightFurniture',
};

export function technicalLabel(t: Dictionary, kind: TechnicalKind): string {
  return t.build[TECHNICAL_LABEL_KEY[kind]];
}

export function electricalLabel(t: Dictionary, kind: ElectricalKind): string {
  return t.build[ELECTRICAL_LABEL_KEY[kind]];
}

const TOOL_ICON: Record<EditorTool, LucideIcon> = {
  select: MousePointer2,
  pan: Hand,
  wall: BrickWall,
  room: Square,
  door: DoorOpen,
  window: RectangleHorizontal,
  column: SquareDashed,
  beam: Minus,
  technical: Wrench,
  electrical: Cable,
  zone: Layers,
  paint: Paintbrush,
};

export function toolLabel(t: Dictionary, tool: EditorTool): string {
  const key: Record<EditorTool, keyof Dictionary['build']> = {
    select: 'toolSelect',
    pan: 'toolPan',
    wall: 'toolWall',
    room: 'toolRoom',
    door: 'toolDoor',
    window: 'toolWindow',
    column: 'toolColumn',
    beam: 'toolBeam',
    technical: 'toolTechnical',
    electrical: 'toolElectrical',
    zone: 'toolZone',
    paint: 'toolPaint',
  };
  return t.build[key[tool]];
}

export function toolHint(t: Dictionary, tool: EditorTool, locked: boolean): string {
  if (tool === 'select' && locked) return t.build.hintLocked;
  const key: Record<EditorTool, keyof Dictionary['build']> = {
    select: 'hintSelect',
    pan: 'hintSelect',
    wall: 'hintWall',
    room: 'hintRoom',
    door: 'hintDoor',
    window: 'hintWindow',
    column: 'hintColumn',
    beam: 'hintBeam',
    technical: 'hintTechnical',
    electrical: 'hintElectrical',
    zone: 'hintZone',
    paint: 'hintPaint',
  };
  return t.build[key[tool]];
}

export interface PlanToolbarProps {
  tools: EditorTool[];
  tool: EditorTool;
  onTool: (tool: EditorTool) => void;
  thicknessM: number;
  onThickness: (m: number) => void;
  technicalKind: TechnicalKind;
  onTechnicalKind: (kind: TechnicalKind) => void;
  electricalKind: ElectricalKind;
  onElectricalKind: (kind: ElectricalKind) => void;
  layers: EditorLayers;
  onLayers: (layers: EditorLayers) => void;
  /** Which layer toggles to offer. */
  layerKeys?: Array<keyof EditorLayers>;
  onFit?: () => void;
  onZoom?: (factor: number) => void;
  className?: string;
  /** Vertical (a rail) instead of a row. */
  vertical?: boolean;
  /** Offer the technical and electrical kinds beside the tools; off when the page has its own picker. */
  kindPicker?: boolean;
}

export function PlanToolbar({ tools, tool, onTool, thicknessM, onThickness, technicalKind, onTechnicalKind, electricalKind, onElectricalKind, layers, onLayers, layerKeys, onFit, onZoom, className, vertical, kindPicker = true }: PlanToolbarProps) {
  const t = useT();
  const showThickness = tool === 'wall' || tool === 'room';
  return (
    <div className={cn('flex flex-wrap items-start gap-3', vertical && 'flex-col', className)}>
      <div className={cn('flex gap-1 rounded-[14px] bg-white/85 p-1.5 shadow-glass backdrop-blur-xl', vertical ? 'flex-col' : 'flex-wrap')} role="toolbar" aria-label={t.build.layers}>
        {tools.map((id) => {
          const Icon = TOOL_ICON[id];
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTool(id)}
              aria-pressed={active}
              title={toolLabel(t, id)}
              className={cn(
                'flex h-[58px] w-[64px] flex-col items-center justify-center gap-1 rounded-[12px] text-[10px] font-semibold leading-none transition-colors',
                active ? 'bg-ink text-white shadow-card' : 'text-ink-soft hover:bg-sand-light hover:text-ink'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-[60px] truncate px-1">{toolLabel(t, id)}</span>
            </button>
          );
        })}
      </div>

      {showThickness && (
        <div className="flex items-center gap-1 rounded-[14px] bg-white/85 p-1.5 shadow-glass backdrop-blur-xl" role="radiogroup" aria-label={t.build.thickness}>
          <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.thickness}</span>
          {WALL_THICKNESS_OPTIONS_M.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={Math.abs(thicknessM - m) < 1e-6}
              onClick={() => onThickness(m)}
              className={cn('h-9 rounded-[10px] px-3 text-xs font-semibold tabular-nums transition-colors', Math.abs(thicknessM - m) < 1e-6 ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light')}
            >
              {fill(t.build.thicknessCm, { n: Math.round(m * 100) })}
            </button>
          ))}
        </div>
      )}

      {kindPicker && tool === 'technical' && (
        <div className="flex max-w-[560px] flex-wrap items-center gap-1 rounded-[14px] bg-white/85 p-1.5 shadow-glass backdrop-blur-xl" role="radiogroup" aria-label={t.build.toolTechnical}>
          {TECHNICAL_KIND_LIST.map((kind) => {
            const Icon = TECHNICAL_ICON[kind];
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={technicalKind === kind}
                onClick={() => onTechnicalKind(kind)}
                className={cn('flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium transition-colors', technicalKind === kind ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light')}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full text-white" style={{ backgroundColor: TECHNICAL_COLOR[kind] }}>
                  <Icon className="h-3 w-3" />
                </span>
                {technicalLabel(t, kind)}
              </button>
            );
          })}
        </div>
      )}

      {kindPicker && tool === 'electrical' && (
        <div className="flex max-w-[620px] flex-wrap items-center gap-1 rounded-[14px] bg-white/85 p-1.5 shadow-glass backdrop-blur-xl" role="radiogroup" aria-label={t.build.toolElectrical}>
          {ELECTRICAL_KIND_LIST.map((kind) => {
            const Icon = ELECTRICAL_ICON[kind];
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={electricalKind === kind}
                onClick={() => onElectricalKind(kind)}
                className={cn('flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-medium transition-colors', electricalKind === kind ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light')}
              >
                <Icon className="h-3.5 w-3.5" />
                {electricalLabel(t, kind)}
              </button>
            );
          })}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <LayersMenu layers={layers} onLayers={onLayers} keys={layerKeys} />
        {(onFit || onZoom) && (
          <div className="flex items-center gap-0.5 rounded-[14px] bg-white/85 p-1 shadow-glass backdrop-blur-xl">
            {onZoom && (
              <button type="button" title={t.design.zoomIn} aria-label={t.design.zoomIn} onClick={() => onZoom(1.25)} className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-soft hover:bg-sand-light hover:text-ink">
                <Plus className="h-4 w-4" />
              </button>
            )}
            {onZoom && (
              <button type="button" title={t.design.zoomOut} aria-label={t.design.zoomOut} onClick={() => onZoom(0.8)} className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-soft hover:bg-sand-light hover:text-ink">
                <Minus className="h-4 w-4" />
              </button>
            )}
            {onFit && (
              <button type="button" title={t.build.fitView} aria-label={t.build.fitView} onClick={onFit} className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-soft hover:bg-sand-light hover:text-ink">
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const LAYER_LABEL: Record<keyof EditorLayers, keyof Dictionary['build']> = {
  rooms: 'layerRooms',
  walls: 'layerWalls',
  openings: 'layerOpenings',
  structure: 'layerStructure',
  technical: 'layerTechnical',
  electrical: 'layerElectrical',
  furniture: 'layerFurniture',
  zones: 'layerZones',
  dimensions: 'layerDimensions',
  labels: 'layerRooms',
  origins: 'layerOrigins',
};

/** Checkboxes for the layers, in a small popover. */
export function LayersMenu({ layers, onLayers, keys, className }: { layers: EditorLayers; onLayers: (layers: EditorLayers) => void; keys?: Array<keyof EditorLayers>; className?: string }) {
  const t = useT();
  const shown = keys ?? (['walls', 'openings', 'structure', 'technical', 'electrical', 'furniture', 'zones', 'dimensions', 'origins'] as Array<keyof EditorLayers>);
  return (
    <details className={cn('group relative', className)}>
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-[14px] bg-white/85 px-3 text-xs font-semibold text-ink-soft shadow-glass backdrop-blur-xl hover:text-ink [&::-webkit-details-marker]:hidden">
        <Layers className="h-4 w-4" />
        {t.build.layers}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-56 rounded-[14px] border border-line bg-white p-2 shadow-cardHover">
        {shown.map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs hover:bg-sand-light">
            <input type="checkbox" checked={layers[key]} onChange={(e) => onLayers({ ...layers, [key]: e.target.checked })} className="accent-ink" />
            {t.build[LAYER_LABEL[key]]}
          </label>
        ))}
        {shown.includes('origins') && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-line px-2 pt-2 text-[10px] text-ink-muted">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3A3733]" />{t.build.originExisting}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand" />{t.build.originUser}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2E8B85]" />{t.build.originGenerated}</span>
          </div>
        )}
      </div>
    </details>
  );
}
