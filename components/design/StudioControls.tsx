'use client';

import { Eye, Maximize2, Minus, Plus, RefreshCw, SquareDashed } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type StudioView = '2d' | '3d' | 'walk';

/** Segmented 2D / 3D / walk switch with the wall and regenerate toggles beside it. */
export function ViewSwitch({
  view,
  onView,
  showWalls,
  onToggleWalls,
  onRegenerate,
}: {
  view: StudioView;
  onView: (view: StudioView) => void;
  showWalls: boolean;
  onToggleWalls: () => void;
  onRegenerate: () => void;
}) {
  const t = useT();
  const options: Array<{ id: StudioView; label: string }> = [
    { id: '2d', label: '2D' },
    { id: '3d', label: '3D' },
    { id: 'walk', label: t.design.walkthrough },
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="glass flex rounded-full p-1" role="tablist">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={view === o.id}
            onClick={() => onView(o.id)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
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
    </div>
  );
}

/** Zoom in, zoom out, frame the flat. */
export function ZoomControls({ onZoom, onReset, disabled }: { onZoom: (factor: number) => void; onReset: () => void; disabled?: boolean }) {
  return (
    <div className="glass flex flex-col rounded-2xl p-1">
      <IconButton label="+" onClick={() => onZoom(0.8)} disabled={disabled} plain>
        <Plus className="h-4 w-4" />
      </IconButton>
      <IconButton label="−" onClick={() => onZoom(1.25)} disabled={disabled} plain>
        <Minus className="h-4 w-4" />
      </IconButton>
      <IconButton label="fit" onClick={onReset} disabled={disabled} plain>
        <Maximize2 className="h-4 w-4" />
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
        'grid h-10 w-10 place-items-center rounded-xl transition-colors disabled:opacity-40',
        !plain && 'glass rounded-full',
        pressed ? 'bg-ink text-white hover:bg-ink' : 'text-ink-soft hover:bg-white hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}
