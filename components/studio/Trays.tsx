'use client';

/**
 * The smaller trays of the build bar: the build tools with the wall thickness, the
 * electrical kinds with the automatic wiring, the finishes' scope, and the budget at a glance.
 */

import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, BrickWall, Cable, Check, DoorOpen, Droplets, Flame, Grid2x2, Hammer, Hand, LayoutGrid, Lightbulb, LockOpen, Minus, MousePointer2, Package, PaintBucket, Paintbrush, RectangleHorizontal, Sofa, Sparkles, Square, SquareDashed, Trash2, Truck, Wind, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';
import { WALL_THICKNESS_OPTIONS_M } from '@/lib/design/walls';
import { ELECTRICAL_KINDS } from '@/lib/design/electrical';
import { ELECTRICAL_ICON, TECHNICAL_ICON } from '@/components/plan/icons';
import { TECHNICAL_COLOR } from '@/components/plan/palette';
import { TECHNICAL_KIND_LIST } from '@/lib/design/technical';
import { emptyDragImage } from './dragImage';
import { localizedName } from '@/lib/i18n/labels';
import { pricePerM2 } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';
import type { DesignCost } from '@/lib/design/types';
import { budgetSections } from '@/lib/design/pricing';
import type { EditorTool } from '@/components/plan/PlanEditor';
import { electricalLabel, technicalLabel, toolLabel } from '@/components/plan/PlanToolbar';
import type { Dictionary } from '@/lib/i18n';

/** A room is a shape of the wall tool — one line, one square — not a tile of its own. */
const BUILD_TOOLS: Array<{ id: EditorTool; icon: LucideIcon }> = [
  { id: 'select', icon: MousePointer2 },
  { id: 'pan', icon: Hand },
  { id: 'wall', icon: BrickWall },
  { id: 'door', icon: DoorOpen },
  { id: 'window', icon: RectangleHorizontal },
  { id: 'column', icon: SquareDashed },
  { id: 'beam', icon: Minus },
];

export function BuildTray({ tool, onTool, thicknessM, onThickness, locked, onUnlock }: { tool: EditorTool; onTool: (tool: EditorTool) => void; thicknessM: number; onThickness: (m: number) => void; locked: boolean; onUnlock: () => void }) {
  const t = useT();
  const drawing = tool === 'wall' || tool === 'room';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1" role="toolbar">
        {BUILD_TOOLS.map(({ id, icon: Icon }) => {
          const active = id === 'wall' ? drawing : tool === id;
          return (
            <button key={id} type="button" onClick={() => onTool(id)} aria-pressed={active} title={toolLabel(t, id)} className={cn('flex h-[52px] w-[60px] flex-col items-center justify-center gap-1 rounded-[10px] text-[9px] font-semibold', active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}>
              <Icon className="h-5 w-5" />
              <span className="truncate px-1">{toolLabel(t, id)}</span>
            </button>
          );
        })}
      </div>
      {drawing && (
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t.build.wallShape}>
          {(['wall', 'room'] as const).map((id) => {
            const Icon = id === 'wall' ? Minus : Square;
            return (
              <button key={id} type="button" role="radio" aria-checked={tool === id} onClick={() => onTool(id)} title={toolLabel(t, id)} className={cn('flex h-8 items-center gap-1 rounded-[8px] px-2 text-xs font-semibold', tool === id ? 'bg-ink text-white' : 'border border-line text-ink-soft hover:border-ink')}>
                <Icon className="h-3.5 w-3.5" />
                {toolLabel(t, id)}
              </button>
            );
          })}
        </div>
      )}
      {drawing && (
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t.build.thickness}>
          {WALL_THICKNESS_OPTIONS_M.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={Math.abs(thicknessM - m) < 1e-6} onClick={() => onThickness(m)} className={cn('h-8 rounded-[8px] px-2.5 text-xs font-semibold tabular-nums', Math.abs(thicknessM - m) < 1e-6 ? 'bg-ink text-white' : 'border border-line text-ink-soft hover:border-ink')}>
              {fill(t.build.thicknessCm, { n: Math.round(m * 100) })}
            </button>
          ))}
        </div>
      )}
      {/*
        The unlock button stands where the "pick a tool" sentence used to: it is the one
        thing the person actually has to do here, and the sentence said what the tools
        already show.
      */}
      {locked ? (
        <button type="button" onClick={onUnlock} className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark">
          <LockOpen className="h-3.5 w-3.5" />
          {t.build.unlockStructure}
        </button>
      ) : (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-[10px] bg-success/10 px-3 py-2 text-xs font-semibold text-success">
          <LockOpen className="h-3.5 w-3.5" />
          {t.build.structureUnlocked}
        </span>
      )}
    </div>
  );
}

const LIGHT_KINDS: ElectricalKind[] = ['light_ceiling', 'light_wall', 'light_spot', 'light_strip', 'light_furniture'];
/**
 * The power shelf: a socket, a switch, an aerial and a data point. The double, the high and
 * the kitchen socket are the same plate at another height or another width — the automatic
 * wiring still places them, and a placed one can still be re-kinded from its card — but as
 * four extra tiles they only made the shelf harder to read.
 */
const POWER_KINDS: ElectricalKind[] = ['socket', 'switch', 'tv', 'internet'];

export const ELECTRICAL_DRAG_TYPE = 'application/x-renovate-electrical';

/**
 * Sockets, switches and lights as tiles: the two families down the left edge (power ·
 * lighting, like the finishes tray's surfaces), the kinds of the open one filling the row.
 * Click a tile to arm a click on the 3D floor (or the 2D board), or drag it straight into
 * the 3D view — the fitting rides on the pointer and sticks to the nearest wall at its usual
 * height until it is let go.
 */
export function ElectricTray({ kind, onKind, armed, onArm, onSuggest, onClear, lightsOn, onDragKind }: { kind: ElectricalKind; onKind: (kind: ElectricalKind) => void; armed: boolean; onArm: (armed: boolean) => void; onSuggest: () => void; onClear: () => void; lightsOn: number; /** A tile started or finished being dragged. */ onDragKind?: (kind: ElectricalKind | null) => void }) {
  const t = useT();
  // The family the open kind belongs to, so arming a light from the shelf opens its tab.
  const [family, setFamily] = useState<'power' | 'light'>(() => (LIGHT_KINDS.includes(kind) ? 'light' : 'power'));
  const kinds = family === 'light' ? LIGHT_KINDS : POWER_KINDS;
  return (
    <div className="flex gap-2">
      <div className="flex shrink-0 flex-col gap-0.5 border-r border-line pr-2" role="tablist" aria-label={t.build.catElectric}>
        {([
          { id: 'power', label: t.build.secElectrical, icon: Cable },
          { id: 'light', label: t.build.secLighting, icon: Lightbulb },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={family === id} onClick={() => setFamily(id)} className={cn('flex h-7 w-[94px] items-center gap-1.5 rounded-[7px] px-1.5 text-[10px] font-semibold transition-colors', family === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
        <span className="mt-0.5 px-1.5 text-[9px] tabular-nums text-ink-muted">{fill(t.build.lightsOnCount, { n: lightsOn })}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1.5">
          {/* One line that scrolls, like the furniture tray's kinds. */}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="radiogroup" aria-label={family === 'light' ? t.build.secLighting : t.build.secElectrical}>
            {kinds.map((k) => {
              const Icon = ELECTRICAL_ICON[k];
              const active = armed && kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(ELECTRICAL_DRAG_TYPE, k);
                    e.dataTransfer.setData('text/plain', electricalLabel(t, k));
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setDragImage(emptyDragImage(), 0, 0);
                    onKind(k);
                    onDragKind?.(k);
                  }}
                  onDragEnd={() => onDragKind?.(null)}
                  onClick={() => {
                    onKind(k);
                    onArm(!active);
                  }}
                  title={`${electricalLabel(t, k)} · ${fill(t.build.standardHeightHint, { n: Math.round(ELECTRICAL_KINDS[k].defaultElevationM * 100) })}`}
                  className={cn('flex h-[38px] w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border text-[9px] font-semibold leading-tight transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-ink hover:text-ink')}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="max-w-full truncate px-1">{electricalLabel(t, k)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onSuggest} className="flex h-8 items-center gap-1.5 rounded-[8px] bg-ink px-2.5 text-[11px] font-semibold text-white hover:bg-brand">
              <Sparkles className="h-3.5 w-3.5" />
              {t.build.suggestWiring}
            </button>
            <button type="button" onClick={onClear} title={t.build.clearWiring} aria-label={t.build.clearWiring} className="grid h-8 w-8 place-items-center rounded-[8px] border border-line text-ink-soft hover:border-danger hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="truncate text-[10px] leading-snug text-ink-muted">{t.build.wiringDragHint}</p>
      </div>
    </div>
  );
}

/**
 * The technical points as tiles: water, sewer, a drain, the panel, gas, a radiator, air
 * conditioning, an extractor, a boiler, a heating pipe. A tile arms the 2D board with that
 * kind and stays armed until it is clicked again — the bargain the electric tray makes — so
 * the whole technical layer can be laid out without leaving the studio. The works checklist,
 * which is a page of its own, is one link away.
 */
export function TechnicalTray({ kind, onKind, armed, onArm, counts, onRadiators, stepHref }: { kind: TechnicalKind; onKind: (kind: TechnicalKind) => void; armed: boolean; onArm: (armed: boolean) => void; counts: Partial<Record<TechnicalKind, number>>; onRadiators: () => void; stepHref: string }) {
  const t = useT();
  const placed = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div className="flex gap-2">
      <div className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-line pr-2">
        <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.catTechnical}</span>
        <span className="px-1.5 text-[9px] tabular-nums text-ink-muted">{fill(t.build.pointsPlaced, { n: placed })}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="radiogroup" aria-label={t.build.toolTechnical}>
            {TECHNICAL_KIND_LIST.map((k) => {
              const Icon = TECHNICAL_ICON[k];
              const active = armed && kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    onKind(k);
                    onArm(!active);
                  }}
                  title={technicalLabel(t, k)}
                  className={cn('flex h-[38px] w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border text-[9px] font-semibold leading-tight transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-ink hover:text-ink')}
                >
                  <span className="grid h-4 w-4 place-items-center rounded-full text-white" style={{ backgroundColor: TECHNICAL_COLOR[k] }}>
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <span className="max-w-full truncate px-1">
                    {technicalLabel(t, k)}
                    {counts[k] ? ` ${counts[k]}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onRadiators} className="flex h-8 items-center gap-1.5 rounded-[8px] bg-ink px-2.5 text-[11px] font-semibold text-white hover:bg-brand">
              <Flame className="h-3.5 w-3.5" />
              {t.build.hangRadiators}
            </button>
            <Link href={stepHref} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-line px-2.5 text-[11px] font-semibold text-ink-soft hover:border-ink hover:text-ink">
              {t.build.worksTitle}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        <p className="truncate text-[10px] leading-snug text-ink-muted">{t.build.hintTechnical}</p>
      </div>
    </div>
  );
}

export type FinishScope = 'room' | 'wall' | 'strip' | 'cell';
export type FinishSurface = 'floor' | 'wall' | 'skirting' | 'cornice';

/** The scopes that paint a piece at a click instead of applying to what is selected. */
export function isPaintScope(scope: FinishScope): scope is 'strip' | 'cell' {
  return scope === 'strip' || scope === 'cell';
}

/** What is being finished, down the left edge of the tray. */
const SURFACE_TABS: Array<{ id: FinishSurface; icon: LucideIcon }> = [
  { id: 'floor', icon: Grid2x2 },
  { id: 'wall', icon: Square },
  { id: 'skirting', icon: Minus },
  { id: 'cornice', icon: Minus },
];

/**
 * The finishes as a shelf: what is being finished down the left (floor · walls · skirting ·
 * cornice), then where it goes and the swatches. A floor is laid over the whole room or
 * painted a square metre at a time; a wall over the whole room, on the one wall that is
 * selected, or a metre-wide strip at a time. In the two painting scopes a swatch is the
 * *brush*: picking one paints nothing until the floor or a wall is clicked.
 */
export function FinishesTray({ surface, onSurface, scope, onScope, hasWall, roomName, areaLabel, options, currentId, onPick, canClear, onClear }: { surface: FinishSurface; onSurface: (surface: FinishSurface) => void; scope: FinishScope; onScope: (scope: FinishScope) => void; hasWall: boolean; roomName: string | null; /** The area the pick will cover, already formatted. */ areaLabel?: string | null; options: CatalogProduct[]; /** The product on the target now (or in the brush); null for the style default, 'mixed' when the rooms differ, undefined when the brush is empty. */ currentId: number | null | 'mixed' | undefined; onPick: (product: CatalogProduct | null) => void; /** The room has single walls, strips or tiles of this surface to take off again. */ canClear?: boolean; onClear?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const trim = surface === 'skirting' || surface === 'cornice';
  // Short names on the tabs — "იატაკის პლინტუსი" does not fit a 90 px tab and truncating it
  // leaves two tabs that read the same.
  const surfaceLabel: Record<FinishSurface, string> = { floor: t.design.finishFloor, wall: t.design.finishWall, skirting: t.design.finishSkirtingShort, cornice: t.design.finishCorniceShort };
  const chips: Array<{ id: FinishScope; label: string; icon: LucideIcon; disabled?: boolean }> = trim
    ? [{ id: 'room', label: t.build.applyRoom, icon: LayoutGrid }]
    : surface === 'wall'
      ? [
          { id: 'room', label: t.build.applyRoom, icon: LayoutGrid },
          { id: 'wall', label: t.build.applyWall, icon: Square, disabled: !hasWall },
          { id: 'strip', label: t.build.applyStrip, icon: Paintbrush },
        ]
      : [
          { id: 'room', label: t.build.applyRoom, icon: LayoutGrid },
          { id: 'cell', label: t.build.applyCell, icon: Paintbrush },
        ];
  const painting = isPaintScope(scope);
  return (
    <div className="flex gap-2">
      {/* What is being finished: down the left, so the shelf keeps the tray's whole width. */}
      <div className="flex shrink-0 flex-col gap-0.5 border-r border-line pr-2" role="tablist" aria-label={t.design.finishesTitle}>
        {SURFACE_TABS.map(({ id, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={surface === id} onClick={() => onSurface(id)} className={cn('flex h-7 w-[94px] items-center gap-1.5 rounded-[7px] px-1.5 text-[10px] font-semibold transition-colors', surface === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}>
            <Icon className={cn('h-3.5 w-3.5 shrink-0', id === 'cornice' && 'rotate-180')} />
            <span className="truncate">{surfaceLabel[id]}</span>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t.build.applyTo}>
            {chips.map((c) => {
              const Icon = c.icon;
              return (
                <button key={c.id} type="button" role="radio" aria-checked={scope === c.id} disabled={c.disabled} title={c.label} onClick={() => onScope(c.id)} className={cn('flex h-7 items-center gap-1 rounded-[7px] px-2 text-[10px] font-medium disabled:opacity-40', scope === c.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft hover:border-ink')}>
                  <Icon className="h-3 w-3 shrink-0" />
                  {c.label}
                </button>
              );
            })}
          </div>
          {canClear && onClear && (
            <button type="button" onClick={onClear} title={t.build.clearPainted} aria-label={t.build.clearPainted} className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-line bg-white text-ink-soft hover:border-danger hover:text-danger">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          <span className="ml-auto truncate text-[10px] text-ink-muted">
            {roomName ?? t.design.finishForAllRooms}
            {areaLabel ? ` · ${areaLabel}` : ''}
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          <SwatchTile label={t.design.finishDefault} active={currentId === null} onClick={() => onPick(null)} />
          {options.map((p) => (
            <SwatchTile
              key={p.id}
              label={localizedName(locale, p)}
              price={trim ? `${formatGEL(p.pricePerUnit)}/${t.design.finishPerM}` : `${formatGEL(pricePerM2(p))}/${t.design.finishPerM2}`}
              textureUrl={trim ? p.imageUrl : p.textureUrl}
              colorHex={p.colorHex}
              active={currentId === p.id}
              onClick={() => onPick(p)}
            />
          ))}
          {options.length === 0 && <p className="py-3 text-xs text-ink-muted">{t.design.noAlternatives}</p>}
        </div>
        <p className="truncate text-[10px] leading-snug text-ink-muted">{painting ? (currentId === undefined ? t.build.paintBrushNone : t.build.paintHint) : trim ? t.design.trimHint : t.design.finishHint}</p>
      </div>
    </div>
  );
}

/** One swatch: the texture (or the product's photo, or its plain colour), and its price. */
function SwatchTile({ label, price, textureUrl, colorHex, active, onClick }: { label: string; price?: string; textureUrl?: string | null; colorHex?: string | null; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={price ? `${label} · ${price}` : label} aria-pressed={active} className={cn('flex w-[52px] shrink-0 flex-col overflow-hidden rounded-[8px] border bg-white text-left transition-colors', active ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-ink')}>
      <span className="relative block aspect-square w-full bg-bg-base">
        {textureUrl ? (
          <Image src={textureUrl} alt={label} fill sizes="52px" className="pointer-events-none object-cover" />
        ) : colorHex ? (
          <span className="block h-full w-full" style={{ backgroundColor: colorHex }} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[10px] text-ink-muted">—</span>
        )}
        {active && (
          <span className="absolute right-0.5 top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-brand text-white">
            <Check className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      <span className="block px-1 py-0.5 text-center">
        <span className="block truncate text-[9px] font-semibold tabular-nums leading-tight text-ink">{price ?? '\u00a0'}</span>
      </span>
    </button>
  );
}

const SECTION_KEY: Array<[keyof ReturnType<typeof budgetSections>, keyof Dictionary['build'], LucideIcon]> = [
  ['furniture', 'secFurniture', Sofa],
  ['lighting', 'secLighting', Lightbulb],
  ['finishes', 'secFinishes', PaintBucket],
  ['openings', 'secOpenings', DoorOpen],
  ['electrical', 'secElectrical', Cable],
  ['plumbing', 'secPlumbing', Droplets],
  ['heating', 'secHeating', Flame],
  ['climate', 'secClimate', Wind],
  ['materials', 'secMaterials', Package],
  ['labour', 'secLabour', Hammer],
  ['delivery', 'secDelivery', Truck],
];

/**
 * The budget at a glance: every section that has anything in it as a small plate with its
 * own icon, and the total on the right, big enough to be the thing you read first. It was a
 * run-on line of label/figure pairs before, which at this size read as one grey paragraph.
 */
export function BudgetTray({ cost }: { cost: DesignCost }) {
  const t = useT();
  const sections = budgetSections(cost);
  const shown = SECTION_KEY.filter(([k]) => sections[k] > 0);
  return (
    <div className="flex items-stretch gap-2">
      <div className="grid min-w-0 flex-1 auto-rows-fr grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-6">
        {shown.map(([k, label, Icon]) => (
          <div key={k} className="flex min-w-0 items-center gap-1.5 rounded-[8px] bg-bg-base px-2 py-1">
            <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            <span className="min-w-0">
              <span className="block truncate text-[9px] uppercase tracking-wide text-ink-muted">{t.build[label]}</span>
              <span className="block truncate text-[11px] font-semibold tabular-nums text-ink">{formatGEL(sections[k])}</span>
            </span>
          </div>
        ))}
        {shown.length === 0 && <p className="col-span-full py-2 text-xs text-ink-muted">{t.build.budgetEmpty}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-1 border-l border-line pl-2.5">
        <span className="text-[9px] uppercase tracking-wide text-ink-muted">{t.build.budgetTotal}</span>
        <span className="font-serif text-xl font-semibold leading-none tabular-nums text-ink">{formatGEL(cost.grandTotal)}</span>
        <Link href="/design/summary" className="flex h-7 items-center gap-1 rounded-[8px] bg-ink px-2.5 text-[11px] font-semibold text-white hover:bg-brand">
          {t.build.budgetTitle}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
