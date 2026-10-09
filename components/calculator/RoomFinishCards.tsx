'use client';

import Image from '@/components/ui/image';
import { CopyPlus, Plus, X } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, roomTypeLabel, unitLabel } from '@/lib/i18n/labels';
import { roomWallAreasM2, roomWalls } from '@/lib/calculator/quantities';
import type { FinishSurface, RoomFinishes } from '@/lib/calculator/roomFinishes';
import type { Room, SelectedProduct } from '@/lib/calculator/types';
import type { Vec2 } from '@/lib/design/types';
import { cn, formatGEL, formatM2, formatNumber } from '@/lib/utils';
import { WallGlyph } from './PlanGlyphs';

/** A wall shorter than this is left out of the list of walls one by one (see the list). */
const MIN_LISTED_WALL_M = 0.2;
/** Less wall than this to finish is no wall to list (a side opened by a railing end to end). */
const MIN_LISTED_WALL_M2 = 0.01;

/**
 * Whether a wall is in the list of walls one by one: not a room separator's open edge (it
 * measures 0), not a sliver of one (the end face of a partial wall running on as a separator),
 * and not a wall with nothing left of it (a balcony's side a railing runs the whole length of,
 * 0 m²). All of them still count in the room's walls as a whole.
 */
export function isListedWall(lengthM: number, areaM2: number): boolean {
  return lengthM >= MIN_LISTED_WALL_M && areaM2 >= MIN_LISTED_WALL_M2;
}

/** What the product grid under the cards chooses for: one of the floor's two products, the room's walls, or one wall. */
export type FinishTarget = { surface: 'floor'; slot: 0 | 1 } | { surface: 'wall'; wall: number | null };

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

/**
 * A room's floor and walls on the catalogue step (`lib/calculator/roomFinishes`): the floor in
 * one product or two sharing it, split by a slider; the walls in one product for the whole
 * room, or wall by wall — each wall listed with its area and what it is in. Every row says what
 * the product grid below is choosing for (`target`); what a click there does is the page's.
 */
export function RoomFinishCards({
  room,
  finishes,
  target,
  onTarget,
  oneByOne,
  onOneByOne,
  outline,
  like,
  onCopy,
  onClearFloor,
  onClearWalls,
  onClearWall,
  onShare,
}: {
  room: Room;
  finishes: RoomFinishes;
  target: FinishTarget;
  onTarget: (target: FinishTarget) => void;
  /** The walls are chosen one by one: the room's picks say so, or the person switched to it. */
  oneByOne: boolean;
  onOneByOne: (oneByOne: boolean) => void;
  /** The room's outline on the board, edge i being wall i — the little drawing beside each wall. */
  outline: Vec2[];
  /** The rooms of the same kind with nothing chosen for each surface: the "the same in N more rooms" shortcut. */
  like: Record<FinishSurface, Room[]>;
  onCopy: (surface: FinishSurface) => void;
  onClearFloor: (slot: 0 | 1) => void;
  onClearWalls: () => void;
  onClearWall: (wallIndex: number) => void;
  /** The first floor product's share, 0–1. */
  onShare: (share: number) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [first, second] = finishes.floor.map(([, pick]) => pick);
  const adding = !!first && !second && target.surface === 'floor' && target.slot === 1;
  const walls = finishes.walls?.[1] ?? null;
  const wallAreas = roomWallAreasM2(room);
  const wallLengths = roomWalls(room);
  const share = first && second ? Math.round((first.share ?? 0.5) * 100) : 100;
  const isTarget = (next: FinishTarget) => target.surface === next.surface && (next.surface === 'floor' ? target.surface === 'floor' && target.slot === next.slot : target.surface === 'wall' && target.wall === next.wall);

  const copy = (surface: FinishSurface) => {
    const rooms = like[surface];
    if (rooms.length === 0) return null;
    return (
      <div className="border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={() => onCopy(surface)}
          title={fill(t.calculator.sameInRoomsLikeHint, { rooms: rooms.map((r) => r.nameKa || roomTypeLabel(t, r.type)).join(', ') })}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs font-medium text-ink underline-offset-2 hover:underline"
        >
          <CopyPlus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{fill(t.calculator.sameInRoomsLike, { n: rooms.length })}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {/* The floor: one product, or two sharing it. */}
      <div className={cn('min-w-0 self-start border bg-bg-surface', target.surface === 'floor' ? 'border-ink' : 'border-line')}>
        <div className="flex min-h-[44px] items-center justify-between gap-2 px-3 py-2">
          <p className="eyebrow">{t.calculator.summaryFloor}</p>
          {first && !second && !adding && (
            <button type="button" onClick={() => onTarget({ surface: 'floor', slot: 1 })} className="inline-flex items-center gap-1 text-xs font-medium text-ink underline-offset-2 hover:underline">
              <Plus className="h-3.5 w-3.5" />
              {t.calculator.floorSecond}
            </button>
          )}
        </div>
        <ul>
          <PickRow pick={first ?? null} selected={isTarget({ surface: 'floor', slot: 0 })} onSelect={() => onTarget({ surface: 'floor', slot: 0 })} onClear={first ? () => onClearFloor(0) : undefined} />
          {(second || adding) && (
            <PickRow
              pick={second ?? null}
              empty={t.calculator.floorSecondHint}
              selected={isTarget({ surface: 'floor', slot: 1 })}
              onSelect={() => onTarget({ surface: 'floor', slot: 1 })}
              // Taking off a second product, or thinking better of adding one.
              onClear={() => (second ? onClearFloor(1) : onTarget({ surface: 'floor', slot: 0 }))}
            />
          )}
        </ul>
        {first && second && (
          <div className="border-t border-line px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Swatch pick={first} size={14} />
                <span className="font-medium text-ink">{share}%</span> · {formatM2((room.floorM2 * share) / 100)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {formatM2((room.floorM2 * (100 - share)) / 100)} · <span className="font-medium text-ink">{100 - share}%</span>
                <Swatch pick={second} size={14} />
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={share}
              onChange={(e) => onShare(Number(e.target.value) / 100)}
              aria-label={t.calculator.floorShareLabel}
              aria-valuetext={`${share}% / ${100 - share}%`}
              className="mt-1.5 w-full accent-ink"
            />
          </div>
        )}
        {first && copy('floor')}
      </div>

      {/* The walls: one product for the whole room, or wall by wall. */}
      <div className={cn('min-w-0 self-start border bg-bg-surface', target.surface === 'wall' ? 'border-ink' : 'border-line')}>
        <div className="flex min-h-[44px] items-center justify-between gap-2 px-3 py-2">
          <p className="eyebrow">{t.calculator.summaryWalls}</p>
          <div role="radiogroup" aria-label={t.calculator.summaryWalls} className="inline-flex shrink-0 border border-line text-xs">
            {([false, true] as const).map((mode) => (
              <button
                key={String(mode)}
                type="button"
                role="radio"
                aria-checked={oneByOne === mode}
                onClick={() => onOneByOne(mode)}
                className={cn('px-2.5 py-1 transition-colors', oneByOne === mode ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}
              >
                {mode ? t.calculator.wallsPerWall : t.calculator.wallsWhole}
              </button>
            ))}
          </div>
        </div>
        {oneByOne ? (
          <ul>
            {wallAreas.map((area, i) => {
              if (!isListedWall(wallLengths[i], area)) return null;
              const pick = finishes.byWall?.[i] ?? null;
              const selected = isTarget({ surface: 'wall', wall: i });
              return (
                <li key={i} className={cn('relative flex items-center border-t border-line', selected && 'bg-bg-base')}>
                  <span className={cn('absolute inset-y-0 left-0 w-[2px]', selected ? 'bg-ink' : 'bg-transparent')} />
                  <button type="button" onClick={() => onTarget({ surface: 'wall', wall: i })} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3 pr-2 text-left">
                    <WallGlyph outline={outline} index={i} active={selected} />
                    <span className="w-[76px] shrink-0 leading-tight">
                      <span className="block text-xs font-medium text-ink">{fill(t.calculator.wallN, { n: i + 1 })}</span>
                      <span className="block text-[11px] tabular-nums text-ink-muted">{formatM2(area)}</span>
                    </span>
                    <Swatch pick={pick} size={24} />
                    <span className={cn('min-w-0 flex-1 truncate text-xs', pick ? 'text-ink' : 'text-ink-muted')}>{pick ? localizedName(locale, pick) : t.calculator.notChosen}</span>
                  </button>
                  {pick && <ClearButton onClick={() => onClearWall(i)} />}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul>
            <PickRow pick={walls} selected={isTarget({ surface: 'wall', wall: null })} onSelect={() => onTarget({ surface: 'wall', wall: null })} onClear={walls ? onClearWalls : undefined} />
          </ul>
        )}
        {!oneByOne && walls && copy('wall')}
      </div>
    </div>
  );
}

/** One product of a surface: what it is, how much of it and what that comes to; the row picks what the grid chooses for. */
function PickRow({ pick, empty, selected, onSelect, onClear }: { pick: SelectedProduct | null; empty?: string; selected: boolean; onSelect: () => void; onClear?: () => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <li className={cn('relative flex items-center border-t border-line', selected && 'bg-bg-base')}>
      <span className={cn('absolute inset-y-0 left-0 w-[2px]', selected ? 'bg-ink' : 'bg-transparent')} />
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 pr-2 text-left">
        <Swatch pick={pick} size={32} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm', pick ? 'font-medium text-ink' : 'text-ink-muted')}>{pick ? localizedName(locale, pick) : (empty ?? t.calculator.notChosen)}</span>
          {pick && (
            <span className="block truncate text-xs tabular-nums text-ink-muted">
              {formatNumber(pick.qty, pick.unit === 'm2' ? 1 : 0)} {unitLabel(t, pick.unit)} × {formatGEL(pick.pricePerUnit)} = <span className="text-ink">{formatGEL(pick.totalPrice)}</span>
            </span>
          )}
        </span>
      </button>
      {onClear && <ClearButton onClick={onClear} />}
    </li>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={t.calculator.removeChoice} title={t.calculator.removeChoice} className="mr-1.5 grid h-7 w-7 shrink-0 place-items-center text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger">
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

/** A product's look: its photo, else its colour; an empty dashed square when nothing is chosen. */
function Swatch({ pick, size }: { pick: SelectedProduct | null; size: number }) {
  return (
    <span className={cn('relative block shrink-0 overflow-hidden border bg-bg-base', pick ? 'border-line' : 'border-dashed border-ink-faint')} style={{ width: size, height: size }}>
      {pick?.imageUrl ? <Image src={pick.imageUrl} alt="" fill sizes={`${size}px`} className="object-cover" /> : pick?.colorHex ? <span className="block h-full w-full" style={{ backgroundColor: pick.colorHex }} /> : null}
    </span>
  );
}
