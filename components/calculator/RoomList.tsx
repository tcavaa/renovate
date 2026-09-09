'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/lib/i18n/client';
import { formatM2L, roomTypeLabel } from '@/lib/i18n/labels';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { Room, RoomType } from '@/lib/calculator/types';
import { cn } from '@/lib/utils';

/**
 * The rooms as a hairline ledger, in the order they will be listed everywhere else. Each
 * row edits its name and type in place, moves up or down, or goes; the selected row is the
 * one highlighted on the layout.
 */
export function RoomList({
  rooms,
  selectedId,
  onSelect,
  onUpdate,
  onReorder,
  onRemove,
}: {
  rooms: Room[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Room>) => void;
  onReorder?: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const totalM2 = rooms.reduce((s, r) => s + r.floorM2, 0);

  return (
    <div className="border border-line bg-bg-surface">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <p className="eyebrow">
          {t.rooms.total} <span className="text-ink">{rooms.length}</span>
        </p>
        <p className="text-sm text-ink-muted">
          {t.rooms.totalM2} <span className="ml-1 font-serif text-lg font-semibold text-ink">{formatM2L(t, totalM2)}</span>
        </p>
      </div>

      {rooms.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-ink-muted">{t.rooms.empty}</p>
      ) : (
        <ul>
          {rooms.map((room, i) => {
            const active = room.id === selectedId;
            return (
              <li
                key={room.id}
                onClick={() => onSelect?.(room.id)}
                className={cn('relative grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3 pl-4 pr-3 last:border-b-0', active ? 'bg-sand-light' : 'hover:bg-sand-light/50')}
              >
                <span className={cn('absolute inset-y-0 left-0 w-[2px]', active ? 'bg-ink' : 'bg-transparent')} />
                <span className="text-xs tabular-nums text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  {onUpdate ? (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                      <Input value={room.nameKa} onChange={(e) => onUpdate(room.id, { nameKa: e.target.value })} className="h-9" aria-label={t.rooms.name} onClick={(e) => e.stopPropagation()} />
                      <Select value={room.type} onValueChange={(v) => onUpdate(room.id, { type: v as RoomType, isWetRoom: ['bathroom', 'toilet', 'kitchen'].includes(v) })}>
                        <SelectTrigger className="h-9" aria-label={t.rooms.type} onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(ROOM_TYPES).map((key) => (
                            <SelectItem key={key} value={key}>
                              {roomTypeLabel(t, key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="truncate font-serif text-base font-semibold text-ink">{room.nameKa}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                    {onUpdate ? (
                      <span className="inline-flex items-center gap-1 tabular-nums" onClick={(e) => e.stopPropagation()}>
                        <SizeInput value={room.width} label={t.rooms.width} onCommit={(v) => onUpdate(room.id, { width: v })} />
                        ×
                        <SizeInput value={room.length} label={t.rooms.length} onCommit={(v) => onUpdate(room.id, { length: v })} />
                        ×
                        <SizeInput value={room.height} label={t.rooms.height} min={2} onCommit={(v) => onUpdate(room.id, { height: v })} />
                        {t.units.m}
                      </span>
                    ) : (
                      <span className="tabular-nums">
                        {room.width} × {room.length} × {room.height} {t.units.m}
                      </span>
                    )}
                    <span className="text-ink-faint">·</span>
                    <span className="font-semibold tabular-nums text-ink">{formatM2L(t, room.floorM2)}</span>
                    {room.isWetRoom && <span className="border border-line px-1 py-px text-[10px] uppercase tracking-wide">{t.rooms.wet}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  {onReorder && (
                    <>
                      <IconBtn label={t.calculator.moveUp} disabled={i === 0} onClick={() => onReorder(room.id, -1)}>
                        <ChevronUp className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn label={t.calculator.moveDown} disabled={i === rooms.length - 1} onClick={() => onReorder(room.id, 1)}>
                        <ChevronDown className="h-4 w-4" />
                      </IconBtn>
                    </>
                  )}
                  <IconBtn label={t.rooms.remove} onClick={() => onRemove(room.id)} danger>
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function IconBtn({ label, disabled, danger, onClick, children }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('grid h-8 w-8 place-items-center text-ink-faint transition-colors disabled:opacity-30', danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-line/60 hover:text-ink')}
    >
      {children}
    </button>
  );
}

/**
 * A dimension typed exactly — 3.32 is 3.32, no step to snap to. Uncontrolled while typing
 * (so "3." is not rewritten to "3" under the cursor) and committed on blur or Enter; the key
 * resets the field when the room's own value changes, for example from a handle drag.
 */
function SizeInput({ value, label, min = 0.5, onCommit }: { value: number; label: string; min?: number; onCommit: (value: number) => void }) {
  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n) && n >= min && n <= 50 && n !== value) onCommit(Number(n.toFixed(2)));
  };
  return (
    <input
      key={value}
      type="number"
      inputMode="decimal"
      step="0.01"
      min={min}
      max={50}
      defaultValue={value}
      aria-label={label}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="h-6 w-14 border border-line bg-white px-1 text-center text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
    />
  );
}
