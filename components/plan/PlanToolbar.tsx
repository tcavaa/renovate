'use client';

/**
 * The build bar: big tiles, one per tool, with the tool's options beside them — the wall
 * thickness, the kind of technical or electrical point — and the view buttons. Looks like a
 * game's build mode on purpose: the person should never feel they are in CAD.
 */

import { BrickWall, Cable, DoorOpen, Ellipsis, Fence, Layers, Maximize2, Minus, MousePointer2, Paintbrush, Plus, RectangleHorizontal, Square, SquareDashed, SquareDashedBottom, Wrench, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';
import { WALL_THICKNESS_OPTIONS_M } from '@/lib/design/walls';
import { TECHNICAL_KIND_LIST } from '@/lib/design/technical';
import { ELECTRICAL_KIND_LIST } from '@/lib/design/electrical';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';
import type { Dictionary } from '@/lib/i18n';
import { OPENING_TOOLS, isOpeningTool, type EditorLayers, type EditorTool, type OpeningTool } from './PlanEditor';
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

export const TOOL_ICON: Record<EditorTool, LucideIcon> = {
  select: MousePointer2,
  wall: BrickWall,
  room: Square,
  divider: Ellipsis,
  door: DoorOpen,
  window: RectangleHorizontal,
  archway: SquareDashedBottom,
  railing: Fence,
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
    wall: 'toolWall',
    room: 'toolRoom',
    divider: 'toolDivider',
    door: 'toolDoor',
    window: 'toolWindow',
    archway: 'toolArchway',
    railing: 'toolRailing',
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
    wall: 'hintWall',
    room: 'hintRoom',
    divider: 'hintDivider',
    door: 'hintDoor',
    window: 'hintWindow',
    archway: 'hintArchway',
    railing: 'hintRailing',
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

/** Which edge of a full-screen board a floating part of the toolbar covers (`PlanWorkspace` fits the plan clear of it). */
type BoardEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * The toolbar as one row: the tiles, whatever the tool in hand can be told, and the layers
 * and zoom at the far end. A full-screen board takes the same three parts apart and floats
 * each on its own edge of the sheet (`PlanWorkspace` with `bleed`).
 */
export function PlanToolbar({ tools, tool, onTool, thicknessM, onThickness, technicalKind, onTechnicalKind, electricalKind, onElectricalKind, layers, onLayers, layerKeys, onFit, onZoom, className, vertical, kindPicker = true }: PlanToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-start gap-3', vertical && 'flex-col', className)}>
      <PlanToolTiles tools={tools} tool={tool} onTool={onTool} vertical={vertical} />
      <PlanToolOptions tools={tools} tool={tool} onTool={onTool} thicknessM={thicknessM} onThickness={onThickness} technicalKind={technicalKind} onTechnicalKind={onTechnicalKind} electricalKind={electricalKind} onElectricalKind={onElectricalKind} kindPicker={kindPicker} />
      <PlanViewControls layers={layers} onLayers={onLayers} layerKeys={layerKeys} onFit={onFit} onZoom={onZoom} className="ml-auto" />
    </div>
  );
}

/**
 * The big tiles, one per tool: a row, or a rail down the side of the sheet (`vertical`). None
 * at all when there is nothing to choose between — the select tool on its own is simply how
 * the board works.
 */
/**
 * The kinds of opening a board offers, when there are several: the door, the window, the plain
 * opening and the balcony's railing are one tile, "doors & windows", and its kinds are offered
 * along the bottom of the board once it is in hand (`PlanToolOptions`, the studio's build tray).
 */
export function openingKinds(tools: readonly EditorTool[]): OpeningTool[] {
  return OPENING_TOOLS.filter((id) => tools.includes(id));
}

/** The tile the opening tools stand under: the door's, whichever kind is in hand. */
export function openingTileTool(tools: readonly EditorTool[]): OpeningTool | null {
  return openingKinds(tools)[0] ?? null;
}

export function PlanToolTiles({ tools, tool, onTool, vertical, edge, className, style }: Pick<PlanToolbarProps, 'tools' | 'tool' | 'onTool' | 'vertical'> & { edge?: BoardEdge; className?: string; style?: React.CSSProperties }) {
  const t = useT();
  const drawing = tool === 'wall' || tool === 'room' || tool === 'divider';
  // A room and a room separator are shapes of the wall tool, not tools of their own: one tile,
  // then a square, a line or a separator. The tile row leaves them out and the shape switch
  // offers them. The tile is called "room" and picks the room up first — drawing a flat is
  // mostly drawing rooms; a lone wall is the second shape.
  const shapes = tools.includes('room') || tools.includes('divider');
  // The same for the openings: one tile, the door picked up first, the kinds offered under it.
  const kinds = openingKinds(tools);
  const openingTile = kinds.length > 1 ? kinds[0] : null;
  const tiles = tools.filter((id) => !(shapes && (id === 'room' || id === 'divider')) && !(openingTile && isOpeningTool(id) && id !== openingTile));
  const drawFirst: EditorTool = tools.includes('room') ? 'room' : 'wall';
  if (tiles.length < 2) return null;
  return (
    <div className={cn('flex gap-1 rounded-[14px] bg-white/85 p-1.5 shadow-glass backdrop-blur-xl', vertical ? 'flex-col' : 'flex-wrap', className)} style={style} data-board-edge={edge} role="toolbar" aria-label={t.build.layers}>
      {tiles.map((id) => {
        const draw = id === 'wall' && shapes;
        const opens = id === openingTile;
        const inHand = opens && isOpeningTool(tool) ? tool : null;
        const Icon = TOOL_ICON[inHand ?? id];
        const active = draw ? drawing : opens ? !!inHand : tool === id;
        const label = opens ? t.build.toolOpenings : toolLabel(t, draw ? drawFirst : id);
        return (
          <button
            key={id}
            type="button"
            // Again while drawing keeps the shape in hand; the openings' tile keeps its kind.
            onClick={() => onTool(draw ? (drawing ? tool : drawFirst) : opens ? (inHand ?? id) : id)}
            aria-pressed={active}
            title={label}
            className={cn(
              'flex h-[58px] w-[64px] flex-col items-center justify-center gap-1 rounded-[12px] text-[10px] font-semibold leading-none transition-colors',
              active ? 'bg-ink text-white shadow-card' : 'text-ink-soft hover:bg-sand-light hover:text-ink'
            )}
          >
            <Icon className="h-5 w-5" />
            {/* Two lines at most: "doors & windows" is the one tile whose name needs both. */}
            <span className="line-clamp-2 max-w-[60px] break-words px-1 text-center leading-[1.15]">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * What the tool in hand can be told — the wall's shape and thickness while drawing, the kind
 * of point for the technical and electrical tools — as separate groups, so they sit beside
 * the tiles in the row and side by side along the bottom of a full-screen board. Nothing for
 * the other tools.
 */
export function PlanToolOptions({ tools, tool, onTool, thicknessM, onThickness, technicalKind, onTechnicalKind, electricalKind, onElectricalKind, kindPicker = true }: Pick<PlanToolbarProps, 'tools' | 'tool' | 'onTool' | 'thicknessM' | 'onThickness' | 'technicalKind' | 'onTechnicalKind' | 'electricalKind' | 'onElectricalKind' | 'kindPicker'>) {
  const t = useT();
  const drawing = tool === 'wall' || tool === 'room' || tool === 'divider';
  const shapeIds = (['room', 'wall', 'divider'] as const).filter((id) => id === 'wall' || tools.includes(id));
  const shapes = shapeIds.length > 1;
  const kinds = openingKinds(tools);
  // The wall's shape and its thickness side by side, compact: they sit in one row along the
  // bottom of a full-screen board. A room separator has no thickness.
  return (
    <>
      {kinds.length > 1 && isOpeningTool(tool) && <OpeningKindPicker kinds={kinds} tool={tool} onTool={onTool} />}
      {(shapes && drawing) || (drawing && tool !== 'divider') ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {shapes && drawing && (
            <div className="flex items-center gap-0.5 whitespace-nowrap rounded-[12px] bg-white/85 p-1 shadow-glass backdrop-blur-xl" role="radiogroup" aria-label={t.build.wallShape}>
              {/* Between `lg` and `xl` the captions give way: a full-screen board lines these groups up along its bottom, and the buttons say enough. */}
              <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted lg:max-xl:hidden">{t.build.wallShape}</span>
              {shapeIds.map((id) => {
                const Icon = id === 'wall' ? Minus : id === 'room' ? Square : Ellipsis;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={tool === id}
                    onClick={() => onTool(id)}
                    title={toolLabel(t, id)}
                    className={cn('flex h-7 items-center gap-1 rounded-[8px] px-2 text-[11px] font-semibold transition-colors', tool === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light')}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {toolLabel(t, id)}
                  </button>
                );
              })}
            </div>
          )}
          {drawing && tool !== 'divider' && (
            <div className="flex items-center gap-0.5 whitespace-nowrap rounded-[12px] bg-white/85 p-1 shadow-glass backdrop-blur-xl" role="radiogroup" aria-label={t.build.thickness}>
              <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted lg:max-xl:hidden">{t.build.thickness}</span>
              {WALL_THICKNESS_OPTIONS_M.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={Math.abs(thicknessM - m) < 1e-6}
                  onClick={() => onThickness(m)}
                  className={cn('h-7 rounded-[8px] px-2 text-[11px] font-semibold tabular-nums transition-colors', Math.abs(thicknessM - m) < 1e-6 ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light')}
                >
                  {fill(t.build.thicknessCm, { n: Math.round(m * 100) })}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

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
    </>
  );
}

/**
 * The kinds of opening under the "doors & windows" tile — a door, a window, a plain opening, a
 * balcony's railing — in one row along the bottom of the board, the one in hand lit. The
 * studio's build tray shows the same row beside its tiles.
 */
export function OpeningKindPicker({ kinds, tool, onTool, className }: { kinds: readonly OpeningTool[]; tool: EditorTool; onTool: (tool: EditorTool) => void; className?: string }) {
  const t = useT();
  return (
    <div className={cn('flex items-center gap-0.5 whitespace-nowrap rounded-[12px] bg-white/85 p-1 shadow-glass backdrop-blur-xl', className)} role="radiogroup" aria-label={t.build.toolOpenings}>
      {kinds.map((id) => {
        const Icon = TOOL_ICON[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={tool === id}
            onClick={() => onTool(id)}
            title={toolHint(t, id, false)}
            className={cn('flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-semibold transition-colors', tool === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light')}
          >
            <Icon className="h-3.5 w-3.5" />
            {toolLabel(t, id)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The layers, and zoom in, zoom out and fit: the far end of the row, or a column of icons in
 * a corner of a full-screen board (`vertical`), its layers opening upwards.
 */
export function PlanViewControls({ layers, onLayers, layerKeys, onFit, onZoom, vertical, edge, className, style }: Pick<PlanToolbarProps, 'layers' | 'onLayers' | 'layerKeys' | 'onFit' | 'onZoom' | 'vertical'> & { edge?: BoardEdge; className?: string; style?: React.CSSProperties }) {
  const t = useT();
  return (
    <div className={cn('flex items-center gap-2', vertical && 'flex-col', className)} style={style} data-board-edge={edge}>
      <LayersMenu layers={layers} onLayers={onLayers} keys={layerKeys} compact={vertical} up={vertical} />
      {(onFit || onZoom) && (
        <div className={cn('flex items-center gap-0.5 rounded-[14px] bg-white/85 p-1 shadow-glass backdrop-blur-xl', vertical && 'flex-col')}>
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

/**
 * Checkboxes for the layers, in a small popover. `compact` is the icon alone (its name in the
 * tooltip), for a column of icons; `up` opens the popover above the button, for a corner at
 * the bottom of the sheet.
 */
export function LayersMenu({ layers, onLayers, keys, className, compact, up }: { layers: EditorLayers; onLayers: (layers: EditorLayers) => void; keys?: Array<keyof EditorLayers>; className?: string; compact?: boolean; up?: boolean }) {
  const t = useT();
  const shown = keys ?? (['walls', 'openings', 'structure', 'technical', 'electrical', 'furniture', 'zones', 'dimensions', 'origins'] as Array<keyof EditorLayers>);
  return (
    <details className={cn('group relative', className)}>
      <summary title={compact ? t.build.layers : undefined} aria-label={compact ? t.build.layers : undefined} className={cn('flex h-11 cursor-pointer list-none items-center gap-2 rounded-[14px] bg-white/85 text-xs font-semibold text-ink-soft shadow-glass backdrop-blur-xl hover:text-ink [&::-webkit-details-marker]:hidden', compact ? 'w-11 justify-center' : 'px-3')}>
        <Layers className="h-4 w-4" />
        {!compact && t.build.layers}
      </summary>
      <div className={cn('absolute right-0 z-30 w-56 rounded-[14px] border border-line bg-white p-2 shadow-cardHover', up ? 'bottom-full mb-2' : 'mt-2')}>
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
