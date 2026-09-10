'use client';

import { Camera, Eye, Maximize2, Minimize2, Minus, Moon, Plus, RefreshCw, Scan, SquareDashed, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { DAYLIGHT_PRESETS, type DaylightPreset } from '@/lib/design3d/daylight';

export type StudioView = '2d' | '3d' | 'walk';

const PRESET_ICONS: Record<DaylightPreset, LucideIcon> = { morning: Sunrise, noon: Sun, evening: Sunset, night: Moon };

/**
 * Segmented 2D / 3D / walk switch with the wall and regenerate toggles beside it, the time
 * of day, and the camera that asks for a realistic photo of the current view.
 */
export function ViewSwitch({
  view,
  onView,
  showWalls,
  onToggleWalls,
  onRegenerate,
  daylight,
  onDaylight,
  onPhoto,
}: {
  view: StudioView;
  onView: (view: StudioView) => void;
  showWalls: boolean;
  onToggleWalls: () => void;
  onRegenerate: () => void;
  daylight: DaylightPreset;
  onDaylight: (preset: DaylightPreset) => void;
  /** Absent while the 3D view is not up (2D plan, viewer still loading). */
  onPhoto?: () => void;
}) {
  const t = useT();
  const options: Array<{ id: StudioView; label: string }> = [
    { id: '2d', label: '2D' },
    { id: '3d', label: '3D' },
    { id: 'walk', label: t.design.walkthrough },
  ];
  const presetLabel: Record<DaylightPreset, string> = {
    morning: t.design.daylightMorning,
    noon: t.design.daylightNoon,
    evening: t.design.daylightEvening,
    night: t.design.daylightNight,
  };
  return (
    <div className="flex items-center gap-2">
      <div className="glass flex p-1" role="tablist">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={view === o.id}
            onClick={() => onView(o.id)}
            className={cn(
              'flex h-9 items-center gap-1.5 px-4 text-sm font-medium transition-colors',
              view === o.id ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
            )}
          >
            {o.id === 'walk' && <Eye className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        ))}
      </div>
      <IconButton label={t.design.showWalls} pressed={showWalls} disabled={view !== '3d'} onClick={onToggleWalls}>
        <SquareDashed className="h-4 w-4" />
      </IconButton>
      <IconButton label={t.design.regenerate} onClick={onRegenerate}>
        <RefreshCw className="h-4 w-4" />
      </IconButton>
      <div className="glass flex p-1" role="radiogroup" aria-label={t.design.daylight}>
        {DAYLIGHT_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset];
          const active = daylight === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={active}
              title={presetLabel[preset]}
              aria-label={presetLabel[preset]}
              disabled={view === '2d'}
              onClick={() => onDaylight(preset)}
              className={cn('grid h-9 w-9 place-items-center transition-colors disabled:opacity-40', active ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <IconButton label={t.design.photo} disabled={!onPhoto} onClick={() => onPhoto?.()}>
        <Camera className="h-4 w-4" />
      </IconButton>
    </div>
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
