'use client';

import { useEffect, useRef, useState } from 'react';
import { BrickWall, Camera, Check, ChevronDown, Eraser, Eye, Maximize2, Minimize2, Minus, Moon, PanelBottom, Plus, Scan, SquareDashed, SquareDashedBottom, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { DAYLIGHT_PRESETS, type DaylightPreset } from '@/lib/design3d/daylight';
import { WALL_MODES, type WallMode } from '@/lib/design3d/wallMode';

export type StudioView = '2d' | '3d' | 'walk';

const PRESET_ICONS: Record<DaylightPreset, LucideIcon> = { morning: Sunrise, noon: Sun, evening: Sunset, night: Moon };
export const WALL_MODE_ICONS: Record<WallMode, LucideIcon> = { up: BrickWall, cutaway: SquareDashed, cutawayLow: SquareDashedBottom, down: PanelBottom };

/**
 * The studio's view controls as one bar: 2D / 3D / the walk-through (its eye alone), then the
 * walls and the time of day — each one button showing what is on, opening its choices below —
 * then "start from scratch" and the camera that asks for a realistic photo of the view. It
 * was eleven buttons in five pills before, and read as a row of icons nobody could tell apart.
 */
export function ViewSwitch({
  view,
  onView,
  wallMode,
  onWallMode,
  onClear,
  daylight,
  onDaylight,
  onPhoto,
}: {
  view: StudioView;
  onView: (view: StudioView) => void;
  wallMode: WallMode;
  onWallMode: (mode: WallMode) => void;
  /** Empties the flat so the person can furnish it themselves, from nothing. */
  onClear: () => void;
  daylight: DaylightPreset;
  onDaylight: (preset: DaylightPreset) => void;
  /** Absent while the 3D view is not up (2D plan, viewer still loading). */
  onPhoto?: () => void;
}) {
  const t = useT();
  const views: Array<{ id: StudioView; label: string }> = [
    { id: '2d', label: '2D' },
    { id: '3d', label: '3D' },
    { id: 'walk', label: t.design.walkthrough },
  ];
  return (
    <div className="glass flex items-center gap-0.5 p-1">
      <div className="flex" role="tablist">
        {views.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={view === o.id}
            aria-label={o.label}
            title={o.label}
            onClick={() => onView(o.id)}
            className={cn('grid h-9 min-w-9 place-items-center px-2.5 text-sm font-medium transition-colors', view === o.id ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}
          >
            {o.id === 'walk' ? <Eye className="h-4 w-4" /> : o.label}
          </button>
        ))}
      </div>
      <Divider />
      <WallModeMenu value={wallMode} onChange={onWallMode} disabled={view !== '3d'} />
      <DaylightMenu value={daylight} onChange={onDaylight} disabled={view === '2d'} />
      <Divider />
      {/*
        There is no "lay it out again" here any more. The layout is the journey's hinge: by
        the time the studio is open somebody may have spent an hour moving furniture, and a
        second generation would sweep all of it away. Emptying the flat deliberately is what
        is left, and version 01 is always there to go back to.
      */}
      <BarButton label={t.build.emptyRooms} onClick={onClear}>
        <Eraser className="h-4 w-4" />
      </BarButton>
      <BarButton label={t.design.photo} disabled={!onPhoto} onClick={() => onPhoto?.()}>
        <Camera className="h-4 w-4" />
      </BarButton>
    </div>
  );
}

/** How the walls show in 3D: up, the cutaway, the cutaway with low walls, down (`lib/design3d/wallMode`). */
export function WallModeMenu({ value, onChange, disabled, compact }: { value: WallMode; onChange: (mode: WallMode) => void; disabled?: boolean; compact?: boolean }) {
  const t = useT();
  const label: Record<WallMode, string> = { up: t.design.wallsUp, cutaway: t.design.wallsCutaway, cutawayLow: t.design.wallsCutawayLow, down: t.design.wallsDown };
  const hint: Record<WallMode, string> = { up: t.design.wallsUpHint, cutaway: t.design.wallsCutawayHint, cutawayLow: t.design.wallsCutawayLowHint, down: t.design.wallsDownHint };
  return <MenuButton title={t.design.showWalls} value={value} onChange={onChange} disabled={disabled} compact={compact} options={WALL_MODES.map((id) => ({ id, icon: WALL_MODE_ICONS[id], label: label[id], hint: hint[id] }))} />;
}

/** The time of day: the sun, the sky and whether the lamps are on. */
export function DaylightMenu({ value, onChange, disabled, compact }: { value: DaylightPreset; onChange: (preset: DaylightPreset) => void; disabled?: boolean; compact?: boolean }) {
  const t = useT();
  const label: Record<DaylightPreset, string> = { morning: t.design.daylightMorning, noon: t.design.daylightNoon, evening: t.design.daylightEvening, night: t.design.daylightNight };
  return <MenuButton title={t.design.daylight} value={value} onChange={onChange} disabled={disabled} compact={compact} options={DAYLIGHT_PRESETS.map((id) => ({ id, icon: PRESET_ICONS[id], label: label[id] }))} />;
}

/**
 * One button showing the choice that is on, with a small chevron; pressed, the choices open
 * under it, each with its icon and name. A click outside or Escape folds the list — Escape
 * only that: the studio's own Escape listens on the window, further up, and must not hear it.
 */
function MenuButton<T extends string>({ title, value, onChange, options, disabled, compact }: { title: string; value: T; onChange: (value: T) => void; options: Array<{ id: T; icon: LucideIcon; label: string; hint?: string }>; disabled?: boolean; /** The smaller size of the project page's toolbar. */ compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const current = options.find((o) => o.id === value) ?? options[0];
  const Icon = current.icon;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${title}: ${current.label}`}
        title={`${title}: ${current.label}`}
        className={cn('flex items-center gap-0.5 pl-2 pr-1 transition-colors disabled:opacity-40', compact ? 'h-8 border border-line' : 'h-9', open ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white hover:text-ink')}
      >
        <Icon className="h-4 w-4" />
        <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" aria-label={title} className="absolute left-0 top-full z-50 mt-2 flex w-max min-w-[180px] max-w-[260px] flex-col gap-0.5 rounded-[12px] border border-line bg-white p-1.5 shadow-float animate-fade-in">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{title}</p>
          {options.map((o) => {
            const OptionIcon = o.icon;
            const active = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={cn('flex items-start gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors', active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-light hover:text-ink')}
              >
                <OptionIcon className="mt-px h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">{o.label}</span>
                  {o.hint && <span className={cn('block text-[10px] leading-snug', active ? 'text-white/70' : 'text-ink-muted')}>{o.hint}</span>}
                </span>
                {active && <Check className="mt-px h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
}

/** A plain icon button inside the bar. */
function BarButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="grid h-9 w-9 place-items-center text-ink-soft transition-colors hover:bg-white hover:text-ink disabled:opacity-40">
      {children}
    </button>
  );
}

/** Zoom in, zoom out, frame the flat, and take the workspace full screen. */
export function ZoomControls({
  onZoom,
  onReset,
  onFullscreen,
  fullscreen,
  disabled,
}: {
  onZoom: (factor: number) => void;
  onReset: () => void;
  onFullscreen: () => void;
  fullscreen: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="glass flex flex-col p-1">
      <IconButton label={t.design.zoomIn} onClick={() => onZoom(0.8)} disabled={disabled} plain>
        <Plus className="h-4 w-4" />
      </IconButton>
      <IconButton label={t.design.zoomOut} onClick={() => onZoom(1.25)} disabled={disabled} plain>
        <Minus className="h-4 w-4" />
      </IconButton>
      <IconButton label={t.design.fitView} onClick={onReset} disabled={disabled} plain>
        <Scan className="h-4 w-4" />
      </IconButton>
      <span className="mx-2 my-0.5 h-px bg-line" />
      <IconButton label={fullscreen ? t.design.exitFullscreen : t.design.fullscreen} pressed={fullscreen} onClick={onFullscreen} plain>
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </IconButton>
    </div>
  );
}

export function IconButton({
  label,
  pressed,
  disabled,
  onClick,
  plain,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-10 w-10 place-items-center transition-colors disabled:opacity-40',
        !plain && 'glass',
        pressed ? 'bg-ink text-white hover:bg-ink' : 'text-ink-soft hover:bg-white hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}
