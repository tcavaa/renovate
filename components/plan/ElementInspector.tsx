'use client';

/**
 * The properties of whatever is selected on the plan: a wall's thickness, height and
 * material; a door's width, height, sill, material, hinge and swing; a column's size; a
 * beam's; a technical point's kind and height; an electrical point's height, outlets and
 * whether the light is on; a room's name, type and height. Each field writes straight to the
 * store through the actions it is given.
 */

import { ChevronLeft, ChevronRight, Lock, LockOpen, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL, formatM2 } from '@/lib/utils';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import { roomEdges } from '@/lib/design/planGeometry';
import { WALL_THICKNESS_OPTIONS_M, wallLength } from '@/lib/design/walls';
import { AC_CEILING_GAP_M, TECHNICAL_KIND_LIST, technicalElevation } from '@/lib/design/technical';
import { ELECTRICAL_KINDS, ELECTRICAL_KIND_LIST, LIGHT_CATEGORIES, isLight } from '@/lib/design/electrical';
import { zoneAreaM2 } from '@/lib/design/zones';
import { isAutoRoomName, nextRoomName } from '@/lib/design/planGeometry';
import type { Beam, BuildMaterial, Column, ElectricalKind, ElectricalPoint, FloorPlan, LightCategory, Opening, PlanRoom, SurfaceFinish, TechnicalKind, TechnicalPoint, Wall } from '@/lib/design/types';
import type { Dictionary } from '@/lib/i18n';
import type { ElementSelection } from '@/store/designStore';
import { MAX_SECTIONS, radiatorCandidates, radiatorRoom, radiatorSections, roomHeatDemandW, sectionsForRoom } from '@/lib/design/radiators';
import { useLocale } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { StyleId } from '@/lib/design/types';
import { electricalLabel, technicalLabel } from './PlanToolbar';
import { ELECTRICAL_ICON, TECHNICAL_ICON } from './icons';
import { TECHNICAL_COLOR } from './palette';

export const MATERIALS: BuildMaterial[] = ['concrete', 'brick', 'block', 'drywall', 'wood', 'metal', 'aluminium', 'pvc', 'glass'];
const MATERIAL_KEY: Record<BuildMaterial, keyof Dictionary['build']> = {
  concrete: 'matConcrete',
  brick: 'matBrick',
  block: 'matBlock',
  drywall: 'matDrywall',
  wood: 'matWood',
  metal: 'matMetal',
  aluminium: 'matAluminium',
  pvc: 'matPvc',
  glass: 'matGlass',
};
export function materialLabel(t: Dictionary, m: BuildMaterial): string {
  return t.build[MATERIAL_KEY[m]];
}
const LIGHT_CATEGORY_KEY: Record<LightCategory, keyof Dictionary['build']> = { primary: 'lcPrimary', secondary: 'lcSecondary', furniture: 'lcFurniture', bedside: 'lcBedside', indirect: 'lcIndirect', decorative: 'lcDecorative' };

export interface InspectorActions {
  updateWall: (id: string, patch: Partial<Pick<Wall, 'thicknessM' | 'heightM' | 'material' | 'locked'>>) => void;
  /** Stretches the wall to a typed length; without it the length is shown and not edited. */
  resizeWall?: (id: string, lengthM: number) => void;
  removeWall: (id: string) => void;
  updateOpening: (roomId: string, id: string, patch: Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM' | 'kind' | 'material' | 'hinge' | 'swing' | 'openAngleDeg' | 'locked'>>) => void;
  removeOpening: (roomId: string, id: string) => void;
  addOpening?: (roomId: string, kind: 'door' | 'window' | 'archway', wallIndex: number) => void;
  updateColumn: (id: string, patch: Partial<Omit<Column, 'id'>>) => void;
  removeColumn: (id: string) => void;
  updateBeam: (id: string, patch: Partial<Omit<Beam, 'id'>>) => void;
  removeBeam: (id: string) => void;
  updateTechnical: (id: string, patch: Partial<Omit<TechnicalPoint, 'id'>>) => void;
  removeTechnical: (id: string) => void;
  updateElectrical: (id: string, patch: Partial<Omit<ElectricalPoint, 'id'>>) => void;
  /** Slides a wall-mounted point along its wall to `t` (0..1 of the edge). */
  slideElectrical?: (id: string, t: number) => void;
  removeElectrical: (id: string) => void;
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void;
  resizeRoom?: (id: string, widthM: number, depthM: number) => void;
  removeRoom: (id: string) => void;
  removeZone?: (roomId: string, zoneId: string) => void;
  /** The catalogue product a radiator is (null: back to the estimate). */
  setRadiatorProduct?: (id: string, product: CatalogProduct | null) => void;
}

export function ElementInspector({ plan, electrical, finishes = [], selection, actions, locked, className, roomExtras, catalog = [], styleId = 'scandinavian' }: { plan: FloorPlan; electrical: ElectricalPoint[]; finishes?: SurfaceFinish[]; selection: ElementSelection; actions: InspectorActions; locked?: boolean; className?: string; /** Rendered under the room fields (the finishes, say). */ roomExtras?: (room: PlanRoom) => React.ReactNode; /** The design catalogue, for what a radiator can be bought as. */ catalog?: CatalogProduct[]; styleId?: StyleId }) {
  const t = useT();
  const locale = useLocale();
  if (!selection) {
    return <p className={cn('rounded-[12px] border border-dashed border-line p-4 text-center text-xs text-ink-muted', className)}>{t.build.nothingSelected}</p>;
  }

  if (selection.kind === 'wall') {
    const wall = plan.walls?.find((w) => w.id === selection.id);
    if (!wall) return null;
    const rooms = plan.rooms.filter((r) => r.wallIds?.includes(wall.id));
    return (
      <Section title={t.build.inspectorWall} onDelete={locked ? undefined : () => actions.removeWall(wall.id)} className={className}>
        {actions.resizeWall && !locked && !wall.locked ? (
          <NumberField label={`${t.build.length} (${t.units.m})`} value={Number(wallLength(wall).toFixed(2))} min={0.1} max={80} step={0.01} onCommit={(v) => actions.resizeWall!(wall.id, v)} />
        ) : (
          <Fact label={t.build.length} value={`${wallLength(wall).toFixed(2)} ${t.units.m}`} />
        )}
        <Field label={t.build.thickness}>
          <div className="flex flex-wrap gap-1">
            {WALL_THICKNESS_OPTIONS_M.map((m) => (
              <Chip key={m} active={Math.abs(wall.thicknessM - m) < 1e-6} onClick={() => actions.updateWall(wall.id, { thicknessM: m })} disabled={locked}>
                {fill(t.build.thicknessCm, { n: Math.round(m * 100) })}
              </Chip>
            ))}
          </div>
        </Field>
        <NumberField label={`${t.build.height} (${t.units.m})`} value={wall.heightM ?? plan.wallHeightM ?? rooms[0]?.heightM ?? 2.8} min={1} max={8} step={0.05} onCommit={(v) => actions.updateWall(wall.id, { heightM: v })} disabled={locked} />
        <MaterialField value={wall.material ?? 'block'} options={['concrete', 'brick', 'block', 'drywall', 'wood']} onChange={(m) => actions.updateWall(wall.id, { material: m })} disabled={locked} />
        <OriginRow origin={wall.origin} />
        <LockRow locked={!!wall.locked} onToggle={() => actions.updateWall(wall.id, { locked: !wall.locked })} />
        {actions.addOpening && rooms.length > 0 && (
          <Field label={t.build.addOpeningOnWall}>
            <div className="flex flex-wrap gap-1">
              {(['door', 'window', 'archway'] as const).map((kind) => {
                const room = rooms[0];
                const index = room.wallIds?.indexOf(wall.id) ?? -1;
                return (
                  <Chip key={kind} onClick={() => index >= 0 && actions.addOpening?.(room.id, kind, index)} disabled={locked || index < 0}>
                    {kind === 'door' ? t.design.door : kind === 'window' ? t.design.window : t.build.archway}
                  </Chip>
                );
              })}
            </div>
          </Field>
        )}
      </Section>
    );
  }

  if (selection.kind === 'opening') {
    const room = plan.rooms.find((r) => r.id === selection.roomId);
    const opening = room?.openings.find((o) => o.id === selection.id);
    if (!room || !opening) return null;
    const edge = roomEdges(room.polygon).find((e) => e.index === opening.wallIndex);
    const maxWidth = Math.max(0.5, (edge?.length ?? 10) - 0.3);
    const kindLabel = opening.kind === 'door' ? t.design.door : opening.kind === 'window' ? t.design.window : t.build.archway;
    return (
      <Section title={`${t.build.inspectorOpening} · ${kindLabel}`} subtitle={room.name} onDelete={locked ? undefined : () => actions.removeOpening(room.id, opening.id)} className={className}>
        <Field label={t.build.kind}>
          <div className="flex gap-1">
            {(['door', 'window', 'archway'] as const).map((kind) => (
              <Chip key={kind} active={opening.kind === kind} onClick={() => kind !== opening.kind && actions.updateOpening(room.id, opening.id, { kind })} disabled={locked}>
                {kind === 'door' ? t.design.door : kind === 'window' ? t.design.window : t.build.archway}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`${t.build.width} (${t.units.m})`} value={opening.widthM} min={0.4} max={maxWidth} step={0.05} onCommit={(v) => actions.updateOpening(room.id, opening.id, { widthM: v })} disabled={locked} />
          <NumberField label={`${t.build.height} (${t.units.m})`} value={opening.heightM} min={0.3} max={room.heightM} step={0.05} onCommit={(v) => actions.updateOpening(room.id, opening.id, { heightM: v })} disabled={locked} />
        </div>
        {opening.kind === 'window' && <NumberField label={`${t.build.sillHeight} (${t.units.m})`} value={opening.sillM} min={0} max={room.heightM - 0.3} step={0.05} onCommit={(v) => actions.updateOpening(room.id, opening.id, { sillM: v })} disabled={locked} />}
        <MaterialField value={opening.material ?? (opening.kind === 'window' ? 'pvc' : 'wood')} options={opening.kind === 'window' ? ['pvc', 'aluminium', 'wood', 'metal'] : ['wood', 'metal', 'glass', 'aluminium', 'pvc']} onChange={(m) => actions.updateOpening(room.id, opening.id, { material: m })} disabled={locked} />
        {opening.kind === 'door' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t.build.hinge}>
                <div className="flex gap-1">
                  {(['left', 'right'] as const).map((h) => (
                    <Chip key={h} active={(opening.hinge ?? 'left') === h} onClick={() => actions.updateOpening(room.id, opening.id, { hinge: h })} disabled={locked}>
                      {h === 'left' ? t.build.hingeLeft : t.build.hingeRight}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label={t.build.swing}>
                <div className="flex gap-1">
                  {(['in', 'out'] as const).map((s) => (
                    <Chip key={s} active={(opening.swing ?? 'in') === s} onClick={() => actions.updateOpening(room.id, opening.id, { swing: s })} disabled={locked}>
                      {s === 'in' ? t.build.swingIn : t.build.swingOut}
                    </Chip>
                  ))}
                </div>
              </Field>
            </div>
            <RangeField label={t.build.openAngle} value={opening.openAngleDeg ?? 75} min={0} max={110} step={5} unit="°" onChange={(v) => actions.updateOpening(room.id, opening.id, { openAngleDeg: v })} />
          </>
        )}
        {opening.exterior && <Fact label="" value="ext" />}
        <OriginRow origin={opening.origin ?? 'existing'} />
        <LockRow locked={!!opening.locked} onToggle={() => actions.updateOpening(room.id, opening.id, { locked: !opening.locked })} />
      </Section>
    );
  }

  if (selection.kind === 'column') {
    const column = plan.columns?.find((c) => c.id === selection.id);
    if (!column) return null;
    return (
      <Section title={t.build.inspectorColumn} onDelete={locked ? undefined : () => actions.removeColumn(column.id)} className={className}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`${t.build.width} (${t.units.m})`} value={column.widthM} min={0.1} max={2} step={0.05} onCommit={(v) => actions.updateColumn(column.id, { widthM: v })} disabled={locked} />
          <NumberField label={`${t.build.depth} (${t.units.m})`} value={column.depthM} min={0.1} max={2} step={0.05} onCommit={(v) => actions.updateColumn(column.id, { depthM: v })} disabled={locked} />
        </div>
        <NumberField label={`${t.build.height} (${t.units.m})`} value={column.heightM ?? plan.wallHeightM ?? 2.8} min={0.3} max={8} step={0.05} onCommit={(v) => actions.updateColumn(column.id, { heightM: v })} disabled={locked} />
        <MaterialField value={column.material ?? 'concrete'} options={['concrete', 'brick', 'metal', 'wood']} onChange={(m) => actions.updateColumn(column.id, { material: m })} disabled={locked} />
        <OriginRow origin={column.origin} />
      </Section>
    );
  }

  if (selection.kind === 'beam') {
    const beam = plan.beams?.find((b) => b.id === selection.id);
    if (!beam) return null;
    return (
      <Section title={t.build.inspectorBeam} onDelete={locked ? undefined : () => actions.removeBeam(beam.id)} className={className}>
        <Fact label={t.build.length} value={`${Math.hypot(beam.b.x - beam.a.x, beam.b.z - beam.a.z).toFixed(2)} ${t.units.m}`} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={`${t.build.width} (${t.units.m})`} value={beam.widthM} min={0.05} max={2} step={0.05} onCommit={(v) => actions.updateBeam(beam.id, { widthM: v })} disabled={locked} />
          <NumberField label={`${t.build.beamDepth} (${t.units.m})`} value={beam.depthM} min={0.05} max={2} step={0.05} onCommit={(v) => actions.updateBeam(beam.id, { depthM: v })} disabled={locked} />
        </div>
        <NumberField label={`${t.build.beamBottom} (${t.units.m})`} value={beam.elevationM} min={0.5} max={8} step={0.05} onCommit={(v) => actions.updateBeam(beam.id, { elevationM: v })} disabled={locked} />
        <MaterialField value={beam.material ?? 'concrete'} options={['concrete', 'metal', 'wood']} onChange={(m) => actions.updateBeam(beam.id, { material: m })} disabled={locked} />
        <OriginRow origin={beam.origin} />
      </Section>
    );
  }

  if (selection.kind === 'technical') {
    const point = plan.technical?.points.find((p) => p.id === selection.id);
    if (!point) return null;
    const room = plan.rooms.find((r) => r.id === point.roomId);
    return (
      <Section title={t.build.inspectorTechnical} subtitle={room?.name} onDelete={() => actions.removeTechnical(point.id)} className={className}>
        <Field label={t.build.kind}>
          <div className="flex flex-wrap gap-1">
            {TECHNICAL_KIND_LIST.map((kind) => {
              const Icon = TECHNICAL_ICON[kind];
              return (
                <Chip key={kind} active={point.kind === kind} onClick={() => actions.updateTechnical(point.id, { kind })} title={technicalLabel(t, kind)}>
                  <span className="grid h-4 w-4 place-items-center rounded-full text-white" style={{ backgroundColor: TECHNICAL_COLOR[kind] }}>
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  {technicalLabel(t, kind)}
                </Chip>
              );
            })}
          </div>
        </Field>
        <NumberField label={`${t.build.elevation} (${t.units.m})`} value={point.elevationM ?? 0} min={0} max={Math.max(4, room?.heightM ?? 0)} step={0.05} onCommit={(v) => actions.updateTechnical(point.id, { elevationM: v })} />
        {/*
          An air conditioner is measured from the ceiling down, not from the floor up, so
          its suggested height is the room's, and saying so explains a number that would
          otherwise look arbitrary. Everything else has one usual height.
        */}
        <p className="-mt-1 text-[11px] text-ink-muted">
          {point.kind === 'ac_unit'
            ? fill(t.build.acHeightHint, { gap: Math.round(AC_CEILING_GAP_M * 100), n: Math.round(technicalElevation('ac_unit', room) * 100) })
            : fill(t.build.standardHeightHint, { n: Math.round(technicalElevation(point.kind, room) * 100) })}
        </p>
        {point.kind === 'radiator' && <RadiatorFields plan={plan} point={point} catalog={catalog} styleId={styleId} locale={locale} actions={actions} />}
        <Field label={t.build.note}>
          <input value={point.note ?? ''} onChange={(e) => actions.updateTechnical(point.id, { note: e.target.value })} maxLength={300} className="h-9 w-full rounded-[8px] border border-line bg-white px-2 text-sm" />
        </Field>
        <OriginRow origin={point.origin} />
      </Section>
    );
  }

  if (selection.kind === 'electrical') {
    const point = electrical.find((p) => p.id === selection.id);
    if (!point) return null;
    const room = plan.rooms.find((r) => r.id === point.roomId);
    const info = ELECTRICAL_KINDS[point.kind];
    const light = isLight(point.kind);
    const edge = room && point.wallIndex != null ? roomEdges(room.polygon).find((e) => e.index === point.wallIndex) : null;
    const alongM = edge ? (point.t ?? 0.5) * edge.length : null;
    // The nearest few standard heights to this kind's own, so the row stays one line.
    const presets = [...new Set([info.defaultElevationM, ...[0.3, 0.45, 0.6, 0.9, 1.05, 1.1, 1.15, 1.45, 1.7, 1.8, 1.95, 2.1].filter((h) => Math.abs(h - info.defaultElevationM) > 0.001).sort((a, b) => Math.abs(a - info.defaultElevationM) - Math.abs(b - info.defaultElevationM)).slice(0, 4)])].sort((a, b) => a - b);
    const setKind = (kind: ElectricalKind) => actions.updateElectrical(point.id, { kind, elevationM: ELECTRICAL_KINDS[kind].placement === 'ceiling' ? (room?.heightM ?? point.elevationM) : ELECTRICAL_KINDS[kind].defaultElevationM });
    const slide = (tt: number) => actions.slideElectrical?.(point.id, Math.max(0.02, Math.min(0.98, tt)));
    const Icon = ELECTRICAL_ICON[point.kind];
    return (
      <Section title={electricalLabel(t, point.kind)} subtitle={room?.name} icon={<Icon className="h-4 w-4" />} onDelete={() => actions.removeElectrical(point.id)} className={className}>
        <Field label={t.build.kind}>
          <div className="flex flex-wrap gap-1">
            {ELECTRICAL_KIND_LIST.map((kind) => {
              const KindIcon = ELECTRICAL_ICON[kind];
              return (
                <Chip key={kind} active={point.kind === kind} onClick={() => kind !== point.kind && setKind(kind)} title={electricalLabel(t, kind)}>
                  <KindIcon className="h-3.5 w-3.5" />
                  <span className="max-w-[92px] truncate">{electricalLabel(t, kind)}</span>
                </Chip>
              );
            })}
          </div>
        </Field>
        {info.placement !== 'ceiling' && (
          <div className="space-y-1.5">
            <NumberField label={`${t.build.elevation} (${t.units.m})`} value={point.elevationM} min={0} max={room?.heightM ?? 3} step={0.05} onCommit={(v) => actions.updateElectrical(point.id, { elevationM: v })} />
            <div className="flex flex-wrap gap-1">
              {presets.map((h) => (
                <Chip key={h} active={Math.abs(point.elevationM - h) < 0.011} onClick={() => actions.updateElectrical(point.id, { elevationM: h })} small>
                  {Math.round(h * 100)} {t.units.cm}
                </Chip>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted">{fill(t.build.standardHeightHint, { n: Math.round(info.defaultElevationM * 100) })}</p>
          </div>
        )}
        {edge && alongM != null && (
          <Field label={`${t.build.alongWall} · ${fill(t.build.wallN, { n: edge.index + 1 })} · ${edge.length.toFixed(2)} ${t.units.m}`}>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => slide((alongM - 0.05) / edge.length)} aria-label={t.build.nudgeLeft} title={t.build.nudgeLeft} disabled={!actions.slideElectrical} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-line text-ink-soft hover:border-ink disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input type="range" min={0.02} max={0.98} step={0.005} value={point.t ?? 0.5} onChange={(e) => slide(Number(e.target.value))} disabled={!actions.slideElectrical} aria-label={t.build.alongWall} className="min-w-0 flex-1 accent-ink" />
              <button type="button" onClick={() => slide((alongM + 0.05) / edge.length)} aria-label={t.build.nudgeRight} title={t.build.nudgeRight} disabled={!actions.slideElectrical} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-line text-ink-soft hover:border-ink disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink">{alongM.toFixed(2)} {t.units.m}</span>
            </div>
          </Field>
        )}
        {!light && point.kind !== 'switch' && point.kind !== 'tv' && point.kind !== 'internet' && (
          <Field label={t.build.outlets}>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((n) => (
                <Chip key={n} active={(point.count ?? 1) === n} onClick={() => actions.updateElectrical(point.id, { count: n })}>
                  {n}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        {light && (
          <>
            <Field label={t.build.lightCategory}>
              <div className="flex flex-wrap gap-1">
                {LIGHT_CATEGORIES.map((c) => (
                  <Chip key={c} active={(point.category ?? info.category ?? 'primary') === c} onClick={() => actions.updateElectrical(point.id, { category: c })} small>
                    {t.build[LIGHT_CATEGORY_KEY[c]]}
                  </Chip>
                ))}
              </div>
            </Field>
            {(point.kind === 'light_strip' || point.kind === 'light_furniture') && <NumberField label={`${t.build.stripLength} (${t.units.m})`} value={point.lengthM ?? 1.5} min={0.2} max={20} step={0.1} onCommit={(v) => actions.updateElectrical(point.id, { lengthM: v })} />}
            <button type="button" role="switch" aria-checked={point.on !== false} onClick={() => actions.updateElectrical(point.id, { on: point.on === false })} className="flex h-9 w-full items-center justify-between rounded-[10px] border border-line px-3 text-xs font-semibold text-ink transition-colors hover:border-ink">
              <span>{point.on !== false ? t.build.lightOn : t.build.lightOff}</span>
              <span className={cn('relative h-5 w-9 rounded-full transition-colors', point.on !== false ? 'bg-[#F5B400]' : 'bg-line')}>
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', point.on !== false ? 'left-[18px]' : 'left-0.5')} />
              </span>
            </button>
          </>
        )}
        <OriginRow origin={point.origin ?? 'generated'} />
      </Section>
    );
  }

  if (selection.kind === 'zone') {
    const finish = finishes.find((f) => f.zone?.id === selection.id);
    const room = plan.rooms.find((r) => r.id === selection.roomId);
    if (!finish?.zone || !room) return null;
    return (
      <Section title={t.build.inspectorZone} subtitle={room.name} onDelete={actions.removeZone ? () => actions.removeZone!(room.id, finish.zone!.id) : undefined} className={className}>
        <Fact label={t.build.zoneArea} value={formatM2(zoneAreaM2(finish.zone))} />
        {finish.product && <Fact label={t.build.material} value={finish.product.nameKa} />}
      </Section>
    );
  }

  if (selection.kind === 'room') {
    const room = plan.rooms.find((r) => r.id === selection.id);
    if (!room) return null;
    return (
      <Section title={t.build.inspectorRoom} onDelete={locked ? undefined : () => actions.removeRoom(room.id)} className={className}>
        <RoomFields room={room} plan={plan} actions={actions} locked={locked} />
        {roomExtras?.(room)}
      </Section>
    );
  }
  return null;
}

/** Name, type, height and size of a room — shared by the inspector and the rooms panel. */
export function RoomFields({ room, plan, actions, locked, compact }: { room: PlanRoom; plan: FloorPlan; actions: Pick<InspectorActions, 'updateRoom' | 'resizeRoom'>; locked?: boolean; compact?: boolean }) {
  const t = useT();
  const xs = room.polygon.map((p) => p.x);
  const zs = room.polygon.map((p) => p.z);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...zs) - Math.min(...zs);
  return (
    <>
      <Field label={t.design.roomNameLabel}>
        <input value={room.name} onChange={(e) => actions.updateRoom(room.id, { name: e.target.value })} maxLength={120} className="h-9 w-full rounded-[8px] border border-line bg-white px-2 text-sm" aria-label={t.design.roomNameLabel} />
      </Field>
      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2')}>
        <Field label={t.design.roomTypeLabel}>
          <select
            value={room.type}
            onChange={(e) => {
              const type = e.target.value as RoomType;
              const name = isAutoRoomName(room.name) ? nextRoomName(plan.rooms, type, room.id) : room.name;
              actions.updateRoom(room.id, { type, name });
            }}
            className="h-9 w-full rounded-[8px] border border-line bg-white px-2 text-sm"
            aria-label={t.design.roomTypeLabel}
          >
            {(Object.keys(ROOM_TYPES) as RoomType[]).map((type) => (
              <option key={type} value={type}>
                {roomTypeLabel(t, type)}
              </option>
            ))}
          </select>
        </Field>
        <NumberField label={t.design.ceilingHeightLabel} value={room.heightM} min={1.8} max={6} step={0.05} onCommit={(v) => actions.updateRoom(room.id, { heightM: v })} />
      </div>
      {actions.resizeRoom && room.polygon.length === 4 && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t.design.roomWidth} value={width} min={0.8} max={40} step={0.01} onCommit={(v) => actions.resizeRoom!(room.id, v, depth)} disabled={locked} />
          <NumberField label={t.design.roomDepth} value={depth} min={0.8} max={40} step={0.01} onCommit={(v) => actions.resizeRoom!(room.id, width, v)} disabled={locked} />
        </div>
      )}
      <p className="text-xs text-ink-muted">
        {t.design.roomAreaLabel}: <span className="font-semibold text-ink">{formatM2(room.areaM2)}</span>
        <span className="mx-1.5 text-ink-faint">·</span>
        {t.design.openingsTitle}: {room.openings.length}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------


/**
 * A radiator's card: what its room needs (watts, and the sections that makes of the chosen
 * radiator), the sections this one has — counted from the room unless set by hand — and
 * what it is bought as, priced by the section.
 */
function RadiatorFields({ plan, point, catalog, styleId, locale, actions }: { plan: FloorPlan; point: TechnicalPoint; catalog: CatalogProduct[]; styleId: StyleId; locale: 'ka' | 'en' | 'ru'; actions: InspectorActions }) {
  const t = useT();
  const room = radiatorRoom(plan, point);
  const watts = point.radiator?.wattsPerSection;
  const sections = radiatorSections(plan, point);
  const roomSections = room ? sectionsForRoom(plan, room, watts) : 0;
  const candidates = radiatorCandidates(catalog, styleId);
  const price = point.product ? point.product.pricePerUnit * sections : null;
  return (
    <div className="space-y-2 rounded-[10px] border border-line bg-bg-base/60 p-2.5">
      {room && (
        <p className="text-[11px] leading-snug text-ink-muted">
          {fill(t.build.radiatorDemand, { room: room.name, m2: formatM2(room.areaM2), w: roomHeatDemandW(plan, room), n: roomSections })}
        </p>
      )}
      <div className="flex items-end gap-2">
        <NumberField label={t.build.radiatorSections} value={sections} min={1} max={40} step={1} onCommit={(v) => actions.updateTechnical(point.id, { sections: Math.round(v) })} />
        <Chip active={!point.sections} onClick={() => actions.updateTechnical(point.id, { sections: null })}>
          {t.build.radiatorAuto}
        </Chip>
      </div>
      {sections >= MAX_SECTIONS && !point.sections && <p className="text-[11px] leading-snug text-warning">{t.build.radiatorSplitHint}</p>}
      {actions.setRadiatorProduct && candidates.length > 0 && (
        <Field label={t.build.radiatorProduct}>
          <div className="flex flex-col gap-1">
            {candidates.map((product) => {
              const active = point.product?.productId === product.id;
              return (
                <button key={product.id} type="button" onClick={() => actions.setRadiatorProduct?.(point.id, active ? null : product)} aria-pressed={active} className={cn('flex items-center gap-2 rounded-[8px] border bg-white p-1.5 text-left text-[11px] transition-colors', active ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-ink')}>
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-[6px] bg-bg-base object-contain" />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-[6px] bg-bg-base" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{localizedName(locale, product)}</span>
                    <span className="block tabular-nums text-ink-muted">
                      {formatGEL(product.pricePerUnit)} / {t.build.radiatorSection}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      )}
      {price != null && (
        <p className="flex items-baseline justify-between text-xs">
          <span className="text-ink-muted">
            {sections} × {formatGEL(point.product!.pricePerUnit)}
          </span>
          <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatGEL(price)}</span>
        </p>
      )}
    </div>
  );
}

export function Section({ title, subtitle, icon, onDelete, className, children }: { title: string; subtitle?: string | null; icon?: React.ReactNode; onDelete?: () => void; className?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className={cn('space-y-2 rounded-[14px] border border-line bg-white p-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-sand-light text-ink">{icon}</span>}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{title}</p>
            {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {onDelete && (
          <button type="button" onClick={onDelete} aria-label={t.build.deleteElement} title={t.build.deleteElement} className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-ink-faint hover:bg-danger/10 hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline justify-between text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </p>
  );
}

export function Chip({ active, onClick, disabled, title, small, children }: { active?: boolean; onClick: () => void; disabled?: boolean; title?: string; small?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} title={title} className={cn('inline-flex items-center gap-1.5 rounded-[8px] font-medium transition-colors disabled:opacity-50', small ? 'h-7 px-2 text-[11px]' : 'h-7 px-2.5 text-xs', active ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft hover:border-ink')}>
      {children}
    </button>
  );
}

/** A number that commits on blur or Enter, so typing "2." does not fire a half-typed value. */
export function NumberField({ label, value, min, max, step, onCommit, disabled }: { label: string; value: number; min: number; max: number; step: number; onCommit: (value: number) => void; disabled?: boolean }) {
  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max) return;
    if (Math.abs(n - value) > 1e-6) onCommit(Math.round(n * 100) / 100);
  };
  return (
    <Field label={label}>
      <input
        key={value}
        type="number"
        inputMode="decimal"
        defaultValue={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-full rounded-[8px] border border-line bg-white px-2 text-[13px] tabular-nums disabled:opacity-50"
      />
    </Field>
  );
}

export function RangeField({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  return (
    <Field label={`${label} · ${value}${unit}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
    </Field>
  );
}

export function MaterialField({ value, options, onChange, disabled }: { value: BuildMaterial; options: BuildMaterial[]; onChange: (m: BuildMaterial) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <Field label={t.build.material}>
      <div className="flex flex-wrap gap-1">
        {options.map((m) => (
          <Chip key={m} active={value === m} onClick={() => onChange(m)} disabled={disabled}>
            {materialLabel(t, m)}
          </Chip>
        ))}
      </div>
    </Field>
  );
}

export function OriginRow({ origin }: { origin: 'existing' | 'user' | 'generated' }) {
  const t = useT();
  const label = origin === 'existing' ? t.build.originExisting : origin === 'user' ? t.build.originUser : t.build.originGenerated;
  const color = origin === 'existing' ? '#3A3733' : origin === 'user' ? '#E85D26' : '#2E8B85';
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </p>
  );
}

/**
 * One square icon button — mirror, duplicate, lock, delete. The word beside the icon is
 * what made the side panels scroll; the tooltip and the aria-label carry it instead.
 */
export function IconAction({ label, onClick, active, danger, disabled, children }: { label: string; onClick: () => void; active?: boolean; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border transition-colors disabled:opacity-40',
        active ? 'border-ink bg-ink text-white' : danger ? 'border-line bg-white text-ink-soft hover:border-danger hover:text-danger' : 'border-line bg-white text-ink-soft hover:border-ink hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}

export function LockRow({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onToggle} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-line px-2.5 text-xs text-ink-soft hover:border-ink">
      {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
      {locked ? t.build.unlock : t.build.lock}
    </button>
  );
}
