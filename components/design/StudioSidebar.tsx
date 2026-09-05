'use client';

import { Eye, Move3d, RefreshCw, SquareDashed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { PlanRoom } from '@/lib/design/types';
import type { ViewMode } from '@/components/design/Viewer3D';

/** The studio's left column: room focus list plus the camera and wall toggles. */
export function StudioSidebar({
  rooms,
  focusRoomId,
  itemsPerRoom,
  totalItems,
  viewMode,
  showWalls,
  onFocusRoom,
  onViewMode,
  onToggleWalls,
  onRegenerate,
}: {
  rooms: PlanRoom[];
  focusRoomId: string | null;
  itemsPerRoom: Map<string, number>;
  totalItems: number;
  viewMode: ViewMode;
  showWalls: boolean;
  onFocusRoom: (roomId: string | null) => void;
  onViewMode: (mode: ViewMode) => void;
  onToggleWalls: () => void;
  onRegenerate: () => void;
}) {
  const t = useT();

  return (
    <aside className="space-y-2">
      <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {t.design.step2}
      </h2>

      <RoomButton active={focusRoomId === null} label={t.design.wholeFlat} count={totalItems} onClick={() => onFocusRoom(null)} />
      {rooms.map((room) => (
        <RoomButton
          key={room.id}
          active={focusRoomId === room.id}
          label={room.name}
          count={itemsPerRoom.get(room.id) ?? 0}
          onClick={() => onFocusRoom(room.id)}
        />
      ))}

      <div className="space-y-2 pt-3">
        <div className="flex rounded-md border border-line p-0.5">
          {(['orbit', 'walk'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => onViewMode(mode)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                viewMode === mode ? 'bg-brand text-white' : 'text-ink-muted hover:bg-bg-base'
              )}
            >
              {mode === 'orbit' ? <Move3d className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {mode === 'orbit' ? t.design.orbitView : t.design.walkthrough}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant={showWalls ? 'outline' : 'default'}
          size="sm"
          className="w-full"
          aria-pressed={showWalls}
          disabled={viewMode === 'walk'}
          onClick={onToggleWalls}
        >
          <SquareDashed className="h-4 w-4" />
          {t.design.showWalls}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onRegenerate}>
          <RefreshCw className="h-4 w-4" />
          {t.design.regenerate}
        </Button>
      </div>
    </aside>
  );
}

function RoomButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-brand text-white' : 'hover:bg-bg-base'
      )}
    >
      <span className="truncate">{label}</span>
      <Badge variant={active ? 'outline' : 'default'} className={active ? 'border-white/40 text-white' : undefined}>
        {count}
      </Badge>
    </button>
  );
}
