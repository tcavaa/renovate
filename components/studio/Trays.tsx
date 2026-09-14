'use client';

/**
 * The smaller trays of the build bar: the build tools with the wall thickness, the
 * electrical kinds with the automatic wiring, the finishes' scope, and the budget at a glance.
 */

import Link from 'next/link';
import { ArrowUpRight, Sparkles, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';
import { WALL_THICKNESS_OPTIONS_M } from '@/lib/design/walls';
import { ELECTRICAL_KINDS } from '@/lib/design/electrical';
import { ELECTRICAL_ICON } from '@/components/plan/icons';
import type { ElectricalKind } from '@/lib/design/types';
import type { DesignCost } from '@/lib/design/types';
import { budgetSections } from '@/lib/design/pricing';
import type { EditorTool } from '@/components/plan/PlanEditor';
import { electricalLabel, toolLabel } from '@/components/plan/PlanToolbar';
import { BrickWall, DoorOpen, Hand, Minus, MousePointer2, RectangleHorizontal, Square, SquareDashed, type LucideIcon } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';

const BUILD_TOOLS: Array<{ id: EditorTool; icon: LucideIcon }> = [
  { id: 'select', icon: MousePointer2 },
  { id: 'pan', icon: Hand },
  { id: 'wall', icon: BrickWall },
  { id: 'room', icon: Square },
  { id: 'door', icon: DoorOpen },
  { id: 'window', icon: RectangleHorizontal },
  { id: 'column', icon: SquareDashed },
  { id: 'beam', icon: Minus },
];

export function BuildTray({ tool, onTool, thicknessM, onThickness, in3d, locked, onUnlock }: { tool: EditorTool; onTool: (tool: EditorTool) => void; thicknessM: number; onThickness: (m: number) => void; in3d: boolean; locked: boolean; onUnlock: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1" role="toolbar">
        {BUILD_TOOLS.map(({ id, icon: Icon }) => (
          <button key={id} type="button" onClick={() => onTool(id)} aria-pressed={tool === id} title={toolLabel(t, id)} className={cn('flex h-[52px] w-[60px] flex-col items-center justify-center gap-1 rounded-[10px] text-[9px] font-semibold', tool === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}>
            <Icon className="h-5 w-5" />
            <span className="truncate px-1">{toolLabel(t, id)}</span>
          </button>
        ))}
      </div>
      {(tool === 'wall' || tool === 'room') && (
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t.build.thickness}>
          {WALL_THICKNESS_OPTIONS_M.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={Math.abs(thicknessM - m) < 1e-6} onClick={() => onThickness(m)} className={cn('h-8 rounded-[8px] px-2.5 text-xs font-semibold tabular-nums', Math.abs(thicknessM - m) < 1e-6 ? 'bg-ink text-white' : 'border border-line text-ink-soft hover:border-ink')}>
              {fill(t.build.thicknessCm, { n: Math.round(m * 100) })}
            </button>
          ))}
        </div>
      )}
      <p className="min-w-[200px] flex-1 text-[11px] leading-snug text-ink-muted">{in3d ? t.build.trayHintBuild : t.build.hintSelect}</p>
      {locked && (
        <button type="button" onClick={onUnlock} className="h-9 rounded-[10px] bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark">
          {t.build.unlockStructure}
        </button>
      )}
    </div>
  );
}

const LIGHT_KINDS: ElectricalKind[] = ['light_ceiling', 'light_wall', 'light_spot', 'light_strip', 'light_furniture'];
const POWER_KINDS: ElectricalKind[] = ['socket', 'socket_double', 'socket_high', 'socket_kitchen', 'switch', 'tv', 'internet'];

export const ELECTRICAL_DRAG_TYPE = 'application/x-renovate-electrical';

/**
 * Sockets, switches and lights as tiles: click one to arm a click on the 3D floor (or the
 * 2D board), or drag it straight into the 3D view — the fitting rides on the pointer and
 * sticks to the nearest wall at its usual height until it is let go.
 */
export function ElectricTray({ kind, onKind, armed, onArm, onSuggest, onClear, lightsOn, onDragKind }: { kind: ElectricalKind; onKind: (kind: ElectricalKind) => void; armed: boolean; onArm: (armed: boolean) => void; onSuggest: () => void; onClear: () => void; lightsOn: number; /** A tile started or finished being dragged. */ onDragKind?: (kind: ElectricalKind | null) => void }) {
  const t = useT();
  const group = (kinds: ElectricalKind[], label: string) => (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
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
                onKind(k);
                onDragKind?.(k);
              }}
              onDragEnd={() => onDragKind?.(null)}
              onClick={() => {
                onKind(k);
                onArm(!active);
              }}
              title={`${electricalLabel(t, k)} · ${fill(t.build.standardHeightHint, { n: Math.round(ELECTRICAL_KINDS[k].defaultElevationM * 100) })}`}
              className={cn('flex h-[56px] w-[68px] flex-col items-center justify-center gap-1 rounded-[10px] border text-[9px] font-semibold leading-tight transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-ink hover:text-ink')}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate px-1">{electricalLabel(t, k)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-4">
        {group(POWER_KINDS, t.build.secElectrical)}
        {group(LIGHT_KINDS, t.build.secLighting)}
        <div className="ml-auto flex flex-col items-end gap-1.5">
          <span className="text-[10px] text-ink-muted">{fill(t.build.lightsOnCount, { n: lightsOn })}</span>
          <button type="button" onClick={onSuggest} className="flex h-8 items-center gap-1.5 rounded-[8px] bg-ink px-3 text-[11px] font-semibold text-white hover:bg-brand">
            <Sparkles className="h-3.5 w-3.5" />
            {t.build.suggestWiring}
          </button>
          <button type="button" onClick={onClear} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-line px-3 text-[11px] text-ink-soft hover:border-danger hover:text-danger">
            <Trash2 className="h-3.5 w-3.5" />
            {t.build.clearWiring}
          </button>
        </div>
      </div>
      <p className="text-[10px] leading-snug text-ink-muted">{t.build.wiringDragHint}</p>
    </div>
  );
}

export type FinishScope = 'room' | 'wall' | 'zone' | 'half-left' | 'half-right' | 'half-top' | 'half-bottom';

export function FinishesTray({ scope, onScope, hasWall, roomName, in3d, onGo2d }: { scope: FinishScope; onScope: (scope: FinishScope) => void; hasWall: boolean; roomName: string | null; in3d: boolean; onGo2d: () => void }) {
  const t = useT();
  const chips: Array<{ id: FinishScope; label: string; disabled?: boolean }> = [
    { id: 'room', label: t.build.applyRoom },
    { id: 'wall', label: t.build.applyWall, disabled: !hasWall },
    { id: 'half-left', label: `${t.build.applyHalf} · ${t.build.halfLeft}` },
    { id: 'half-right', label: `${t.build.applyHalf} · ${t.build.halfRight}` },
    { id: 'half-top', label: `${t.build.applyHalf} · ${t.build.halfTop}` },
    { id: 'half-bottom', label: `${t.build.applyHalf} · ${t.build.halfBottom}` },
    { id: 'zone', label: t.build.applyZone },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {t.build.applyTo} {roomName && <span className="ml-1 normal-case tracking-normal text-ink">{roomName}</span>}
      </p>
      <div className="flex flex-wrap gap-1" role="radiogroup">
        {chips.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={scope === c.id} disabled={c.disabled} onClick={() => onScope(c.id)} className={cn('h-8 rounded-[8px] px-2.5 text-[11px] font-medium disabled:opacity-40', scope === c.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft hover:border-ink')}>
            {c.label}
          </button>
        ))}
      </div>
      {scope === 'zone' && in3d && (
        <button type="button" onClick={onGo2d} className="h-8 rounded-[8px] bg-brand px-3 text-[11px] font-semibold text-white hover:bg-brand-dark">
          {t.build.goTo2d}
        </button>
      )}
      <p className="w-full text-[11px] text-ink-muted">{scope === 'zone' ? t.build.zoneDrawHint : t.design.finishHint}</p>
    </div>
  );
}

const SECTION_KEY: Array<[keyof ReturnType<typeof budgetSections>, keyof Dictionary['build']]> = [
  ['furniture', 'secFurniture'],
  ['lighting', 'secLighting'],
  ['finishes', 'secFinishes'],
  ['openings', 'secOpenings'],
  ['electrical', 'secElectrical'],
  ['plumbing', 'secPlumbing'],
  ['heating', 'secHeating'],
  ['climate', 'secClimate'],
  ['materials', 'secMaterials'],
  ['labour', 'secLabour'],
  ['delivery', 'secDelivery'],
];

export function BudgetTray({ cost }: { cost: DesignCost }) {
  const t = useT();
  const sections = budgetSections(cost);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {SECTION_KEY.filter(([k]) => sections[k] > 0).map(([k, label]) => (
          <p key={k} className="text-xs">
            <span className="text-ink-muted">{t.build[label]}</span> <span className="font-semibold tabular-nums text-ink">{formatGEL(sections[k])}</span>
          </p>
        ))}
      </div>
      <p className="ml-auto text-sm">
        <span className="text-ink-muted">{t.build.budgetTotal}</span> <span className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(cost.grandTotal)}</span>
      </p>
      <Link href="/design/summary" className="flex h-9 items-center gap-1.5 rounded-[10px] bg-ink px-3 text-xs font-semibold text-white hover:bg-brand">
        {t.build.budgetTitle}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
