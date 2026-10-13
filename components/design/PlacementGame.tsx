'use client';

/**
 * "Where does it go?" — played in the upload card while Claude reads the plan.
 *
 * One real catalogue piece at a time turns on a 3D turntable (`mountModelPreview`); the person
 * drags its card onto the room of a little flat it belongs in, or taps the room. A right room
 * places the piece's photo there and scores (more for a run of first tries); a wrong one shakes
 * and, after two, the right room is lit. The rules and the answers are `lib/design/placementGame`.
 *
 * It only ever adds to the wait: the plan is handed over the moment it is read, and the game
 * then says so and offers to close; someone who never touched it does not see it stay. Without
 * enough pieces with a ready model in the catalogue it shows nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from '@/components/ui/image';
import { Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROOM_TINT_STRONG } from '@/components/plan/palette';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, roomTypeLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';
import type { RoomType } from '@/lib/calculator/types';
import type { CatalogProduct } from '@/lib/design/matcher';
import { answer, currentPiece, hintRoom, pickRound, playablePieces, roundOver, startRound, type GamePiece, type GameState } from '@/lib/design/placementGame';

/** Fewer playable pieces than this and there is no game worth showing. */
const MIN_PIECES = 4;

/** Where each room sits in the little flat: a 3 × 2 grid, the living room two cells wide. */
const ROOM_AREA: Partial<Record<RoomType, string>> = {
  living_room: 'col-span-2 row-start-1 col-start-1',
  kitchen: 'row-start-1 col-start-3',
  bedroom: 'row-start-2 col-start-1',
  bathroom: 'row-start-2 col-start-2',
  hallway: 'row-start-2 col-start-3',
};

export interface PlacementGameProps {
  /** Null while the plan is being read; once it is, how many rooms were found (null: the area is still to give). */
  ready: { rooms: number | null } | null;
  /** The person closes the game. */
  onClose: () => void;
  /** The first answer: from then on the game stays up after the plan is read. */
  onPlayed: () => void;
}

export function PlacementGame({ ready, onClose, onPlayed }: PlacementGameProps) {
  const t = useT();
  const locale = useLocale();
  const g = t.design.game;
  const [pool, setPool] = useState<GamePiece[] | 'none' | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  // Bumped on every answer so the room's animation plays again for the same room.
  const [feedback, setFeedback] = useState<{ room: RoomType; right: boolean; serial: number } | null>(null);
  const [dragOver, setDragOver] = useState<RoomType | null>(null);
  const played = useRef(false);

  // --- the pieces: real catalogue products with a model and one right room ---
  useEffect(() => {
    let cancelled = false;
    fetch('/api/design/catalog')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        const pieces = playablePieces((json?.data?.products ?? []) as CatalogProduct[]);
        if (pieces.length < MIN_PIECES) {
          setPool('none');
          return;
        }
        setPool(pieces);
        setState(startRound(pickRound(pieces)));
      })
      .catch(() => !cancelled && setPool('none'));
    return () => {
      cancelled = true;
    };
  }, []);

  const piece = state ? currentPiece(state) : null;
  const next = state ? state.pieces[state.index + 1] ?? null : null;
  const over = state ? roundOver(state) : false;
  const hint = state ? hintRoom(state) : null;

  const place = useCallback(
    (room: RoomType) => {
      if (!state || roundOver(state)) return;
      const after = answer(state, room);
      setState(after);
      setFeedback((f) => ({ room, right: !!after.last?.right, serial: (f?.serial ?? 0) + 1 }));
      if (!played.current) {
        played.current = true;
        onPlayed();
      }
    },
    [state, onPlayed]
  );

  const playAgain = () => {
    if (!Array.isArray(pool) || !state) return;
    setState(startRound(pickRound(pool, new Set(state.pieces.map((p) => p.product.id)))));
    setFeedback(null);
  };

  const byId = useMemo(() => new Map((state?.pieces ?? []).map((p) => [p.product.id, p.product])), [state?.pieces]);

  if (pool === 'none') return null;

  return (
    <section className="mt-4 overflow-hidden rounded-[16px] border border-line bg-white" aria-live="polite">
      {ready && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-success/10 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <Check className="h-4 w-4" />
            {ready.rooms != null ? fill(g.planReady, { n: ready.rooms }) : g.planReadyFallback}
          </p>
          <Button type="button" variant="ink" size="sm" onClick={onClose}>
            {g.close}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h3 className="flex items-center gap-2 font-serif text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-brand" />
            {g.title}
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted">{g.subtitle}</p>
        </div>
        {state && (
          <div className="flex items-baseline gap-3 text-sm tabular-nums">
            <span key={state.score} className="animate-pop">
              <span className="text-lg font-semibold text-ink">{state.score}</span> <span className="text-ink-muted">{g.points}</span>
            </span>
            {state.streak > 1 && (
              <span className="rounded-[8px] bg-brand/10 px-2 py-0.5 font-medium text-brand">
                ×{state.streak} {g.streak}
              </span>
            )}
          </div>
        )}
      </div>

      {!state ? (
        <p className="flex items-center gap-2 px-4 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {g.loading}
        </p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          {/* --- the piece --- */}
          <div className="flex min-w-0 flex-col gap-3">
            {over ? (
              <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 rounded-[12px] bg-bg-base p-4 text-center">
                <p className="font-serif text-xl font-semibold">{g.roundOver}</p>
                <p className="text-sm text-ink-muted">
                  {fill(g.summary, { score: state.score, perfect: state.perfect, n: state.pieces.length, best: state.bestStreak })}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={playAgain}>
                    <RotateCcw className="h-4 w-4" />
                    {g.playAgain}
                  </Button>
                  {ready && (
                    <Button type="button" variant="ink" size="sm" onClick={onClose}>
                      <X className="h-4 w-4" />
                      {g.close}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              piece && (
                <>
                  <PieceTurntable key={piece.product.id} piece={piece} preload={next} />
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(piece.product.id));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    aria-label={fill(g.dragPiece, { name: localizedName(locale, piece.product) })}
                    className="flex cursor-grab items-center gap-3 rounded-[12px] border border-line bg-bg-surface p-2.5 active:cursor-grabbing"
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[8px] bg-white">
                      {piece.product.imageUrl && (
                        <Image src={piece.product.imageUrl} alt="" fill sizes="44px" className="object-contain" draggable={false} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{localizedName(locale, piece.product)}</span>
                      <span className="block text-xs text-ink-muted">
                        {fill(g.pieceOf, { i: state.index + 1, n: state.pieces.length })} · {g.dragHint}
                      </span>
                    </span>
                  </div>
                </>
              )
            )}
            <Feedback state={state} hint={hint} t={g} locale={locale} byId={byId} />
          </div>

          {/* --- the flat --- */}
          <div role="group" aria-label={g.roomsLabel} className="grid h-60 grid-cols-3 grid-rows-2 gap-[3px] rounded-[10px] bg-ink p-[3px] md:h-auto md:min-h-[17rem]">
            {(Object.keys(ROOM_AREA) as RoomType[]).map((room) => {
              const placed = (state.placed[room] ?? []).map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p);
              const shaking = feedback && !feedback.right && feedback.room === room;
              const landed = feedback?.right && feedback.room === room;
              return (
                <button
                  key={`${room}-${shaking || landed ? feedback!.serial : 0}`}
                  type="button"
                  disabled={over}
                  onClick={() => place(room)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(room);
                  }}
                  onDragLeave={() => setDragOver((r) => (r === room ? null : r))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    place(room);
                  }}
                  style={dragOver === room || landed ? { backgroundColor: ROOM_TINT_STRONG[room] } : undefined}
                  className={cn(
                    'relative flex min-w-0 flex-col items-start justify-between overflow-hidden rounded-[6px] bg-white p-2 text-left transition-colors',
                    ROOM_AREA[room],
                    !over && 'hover:bg-sand-light',
                    // An outline, not a tint: the flat's walls are the black behind the rooms.
                    shaking && 'animate-shake ring-2 ring-inset ring-danger',
                    hint === room && 'ring-2 ring-inset ring-brand motion-safe:animate-pulse'
                  )}
                >
                  <span className="flex min-w-0 items-start gap-1.5 text-[11px] font-semibold leading-tight text-ink sm:text-xs">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ROOM_TINT_STRONG[room] }} />
                    {/* A Georgian room name is one long word: on a phone it breaks inside it rather than run out of its room. */}
                    <span className="min-w-0 [overflow-wrap:anywhere]">{roomTypeLabel(t, room)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {placed.map((p, i) => (
                      <span
                        key={p.id}
                        className={cn('relative h-8 w-8 overflow-hidden rounded-[6px] border border-line bg-white', landed && i === placed.length - 1 && 'animate-pop')}
                      >
                        {p.imageUrl && <Image src={p.imageUrl} alt={localizedName(locale, p)} fill sizes="32px" className="object-contain" />}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** What the last answer did: points and the real product behind the piece, a nudge, or the hint. */
function Feedback({
  state,
  hint,
  t,
  locale,
  byId,
}: {
  state: GameState;
  hint: RoomType | null;
  t: ReturnType<typeof useT>['design']['game'];
  locale: ReturnType<typeof useLocale>;
  byId: Map<number, CatalogProduct>;
}) {
  const last = state.last;
  if (!last) return <p className="min-h-[2.5rem] text-xs text-ink-faint">&nbsp;</p>;
  if (!last.right) {
    return <p className="min-h-[2.5rem] text-sm font-medium text-danger">{hint ? t.hint : t.wrong}</p>;
  }
  const productId = state.placed[last.room]?.at(-1);
  const product = productId != null ? byId.get(productId) : undefined;
  return (
    <p className="min-h-[2.5rem] text-sm">
      <span className="font-semibold text-success">{last.points > 0 ? fill(t.right, { points: last.points }) : t.rightLate}</span>
      {product && (
        <span className="block text-xs text-ink-muted">
          {fill(t.realProduct, { price: formatGEL(product.pricePerUnit), store: product.store ? localizedName(locale, product.store) : product.brand ?? '' })}
        </span>
      )}
    </p>
  );
}

/**
 * The piece on its turntable, with its photo shown until the model is in. The next piece's
 * model is fetched meanwhile, so it is in the browser's cache by the time it is needed.
 */
function PieceTurntable({ piece, preload }: { piece: GamePiece; preload: GamePiece | null }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const url = piece.product.model3dUrl!;

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    let handle: { dispose: () => void } | null = null;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('@/lib/design3d/modelPreview')
      .then(({ mountModelPreview }) => mountModelPreview(host, url, { autoRotate: !still }))
      .then((h) => {
        if (cancelled) return h.dispose();
        handle = h;
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [host, url]);

  useEffect(() => {
    const nextUrl = preload?.product.model3dUrl;
    if (nextUrl) fetch(nextUrl).catch(() => {});
  }, [preload]);

  return (
    <div className="relative h-48 overflow-hidden rounded-[12px] bg-bg-base md:h-56">
      <div ref={setHost} className="absolute inset-0" />
      {status !== 'ready' && piece.product.imageUrl && (
        <Image src={piece.product.imageUrl} alt="" fill sizes="320px" className={cn('object-contain p-6', status === 'loading' && 'motion-safe:animate-pulse')} />
      )}
    </div>
  );
}
