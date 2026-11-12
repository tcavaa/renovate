'use client';

/**
 * Upload a 2D plan and get a `FloorPlan` back.
 *
 * Two paths, in order of how good the answer is. First the drawing is uploaded and sent to
 * `/api/design/parse-plan`, which reads the room labels and — crucially — the dimension
 * strings printed on it, giving a plan whose walls are the length the architect drew. An
 * upload that is not a floor plan at all (a photo of a room, a car) is refused there, and the
 * card asks for another file. If the reader is unavailable (no API key) or comes back empty,
 * it falls back to the local CV parser, which finds rooms geometrically but has no idea how
 * big they are. Either way, a plan with no size of its own — no sizes printed, or the CV
 * path's — is shown with its longest outside wall picked, and the person types that wall's
 * length (or picks another), or instead one room's area or the whole flat's: the whole plan is
 * scaled from it (`planScale`).
 *
 * A PDF is rasterised in the browser first (`lib/design/planPdf.ts`) and then treated like
 * any other image, so the rest of the pipeline never sees one.
 *
 * Reading takes from twenty seconds to two minutes, so meanwhile the card offers a game
 * (`PlacementGame`): real catalogue pieces to put in their rooms. The plan is handed over the
 * moment it is read either way; the game goes with the spinner unless the person has started
 * playing, in which case it stays, says the plan is ready, and closes when they say so.
 *
 * Shared by the Design Studio's first step and the calculator's first step: one upload, one
 * parser, one plan — whichever door the user came in through. The calculator keeps the
 * card's own "continue" button; the studio hides it (`showContinue={false}`) and receives
 * the plan the moment the wall's length is valid, because its continue button sits further down the
 * page, under the "what do you need" choice.
 *
 * Uploading is Premium's and Professional's (docs/subscriptions.md): on Free the card shows its
 * lock, and a click or a dropped file opens the upgrade dialogue instead of reading anything;
 * the sample flat stays open to everyone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from '@/components/ui/image';
import { AlertCircle, ArrowRight, Loader2, Ruler, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { loadPlanImage, uploadPlanImage } from '@/lib/design/planImage';
import { isPdfFile, rasterizePdfPlan } from '@/lib/design/planPdf';
import { parseFloorPlan } from '@/lib/design/planParser';
import { buildPlanFromRegions, metresPerPixelFromArea, roomEdges, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { MAX_PLAN_AREA_M2, MAX_WALL_LENGTH_M, MIN_PLAN_AREA_M2, MIN_WALL_LENGTH_M, defaultScaleEdge, scaleAreaNow, scaleEdgeLength, scalePlanToArea, scalePlanToEdge, type ScaleEdge } from '@/lib/design/planScale';
import { ensureWalls } from '@/lib/design/walls';
import { samplePlan } from '@/lib/design/samplePlan';
import { formatM2 } from '@/lib/utils';
import { PlacementGame } from '@/components/design/PlacementGame';
import { PlanBadge } from '@/components/plans/PlanBadge';
import { usePlanGate } from '@/hooks/usePlan';
import type { FloorPlan } from '@/lib/design/types';

type Phase = 'idle' | 'pdf' | 'reading' | 'parsing' | 'scale' | 'failed';

interface PlanUploadCardProps {
  /** Called with the finished plan and the uploaded image's URL, if any. */
  onPlan: (plan: FloorPlan, imageUrl: string | null) => void;
  /** A new file started loading, or the area went invalid: whatever plan was handed over is stale. */
  onReset?: () => void;
  /** Offer the bundled sample plan. */
  showSample?: boolean;
  /**
   * Show the card's own "continue" under the wall-length field. Off, the plan is handed over as
   * soon as the length is valid and the page's own button does the continuing.
   */
  showContinue?: boolean;
}

/** The CV path's plan before the person gives a wall's length: sized as a flat of this many m². */
const ASSUMED_AREA_M2 = 70;

/** What the person gives a plan its size by: one wall's length, one room's area, the whole flat's area. */
type ScaleBy = 'wall' | 'room' | 'flat';

type DrawingRead = { plan: FloorPlan; scaleKnown: boolean } | { notPlan: true } | null;

async function readPlanFromDrawing(imageUrl: string): Promise<DrawingRead> {
  try {
    const res = await fetch('/api/design/parse-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    });
    const json = await res.json();
    if (json?.notPlan) return { notPlan: true };
    if (!res.ok || !json.data?.plan) return null;
    return { plan: json.data.plan as FloorPlan, scaleKnown: json.data.scaleKnown !== false };
  } catch {
    return null;
  }
}

export function PlanUploadCard({ onPlan, onReset, showSample = false, showContinue = true }: PlanUploadCardProps) {
  const t = useT();
  const { gate, needs } = usePlanGate();
  const locked = needs('planUpload');
  const [phase, setPhase] = useState<Phase>('idle');
  /** A plan read with no size of its own, waiting for one wall's length (phase `scale`). */
  const [unsized, setUnsized] = useState<FloorPlan | null>(null);
  const [scaleEdge, setScaleEdge] = useState<ScaleEdge | null>(null);
  const [scaleBy, setScaleBy] = useState<ScaleBy>('wall');
  const [scaleRoom, setScaleRoom] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [wallLength, setWallLength] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readNotice, setReadNotice] = useState<'fallback' | null>(null);
  /** The sample flat is what was handed over (`samplePlan`): drawn here instead of a picture. */
  const [sample, setSample] = useState<FloorPlan | null>(null);
  // The game while the plan is read: `ready` once it is (rooms found, or null for the CV path).
  const [game, setGame] = useState<{ ready: { rooms: number | null } | null } | null>(null);
  const played = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Read done: the game stays for someone playing it, and goes for anyone else.
  const settleGame = (ready: { rooms: number | null } | null) => setGame(ready && played.current ? { ready } : null);

  // The parent's callbacks are read through refs so the live-area effect below does not
  // re-run — and hand the plan over again — every time the parent re-renders.
  const onPlanRef = useRef(onPlan);
  onPlanRef.current = onPlan;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /** A plan with no size of its own: the card asks for one wall's length before handing it over. */
  const askForLength = (plan: FloorPlan) => {
    setUnsized(plan);
    setScaleEdge(defaultScaleEdge(plan));
    setScaleBy('wall');
    // The room offered first: the largest that is not a balcony.
    setScaleRoom([...plan.rooms].sort((a, b) => Number(a.type === 'balcony') - Number(b.type === 'balcony') || b.areaM2 - a.areaM2)[0]?.id ?? null);
    setWallLength('');
    setPhase('scale');
  };

  const handleFile = useCallback(async (picked: File) => {
    setError(null);
    setReadNotice(null);
    setUnsized(null);
    setSample(null);
    onResetRef.current?.();

    let file = picked;
    if (isPdfFile(picked)) {
      setPhase('pdf');
      try {
        file = await rasterizePdfPlan(picked);
      } catch {
        setError(t.design.pdfFailed);
        setPhase('failed');
        return;
      }
    }

    setPhase('reading');
    played.current = false;
    setGame({ ready: null });
    // A plain timeout, not requestAnimationFrame: rAF never fires in a background tab.
    await new Promise((resolve) => setTimeout(resolve, 16));

    let loaded: Awaited<ReturnType<typeof loadPlanImage>> | null = null;
    try {
      loaded = await loadPlanImage(file);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return loaded!.previewUrl;
      });
    } catch {
      setPhase('failed');
      setGame(null);
      return;
    }

    // --- read it properly ---
    const url = await uploadPlanImage(file);
    setUploadedUrl(url);
    if (url) {
      const read = await readPlanFromDrawing(url);
      if (read && 'notPlan' in read) {
        setError(t.design.notAPlan);
        setPhase('failed');
        setGame(null);
        return;
      }
      if (read) {
        settleGame({ rooms: read.plan.rooms.length });
        if (read.scaleKnown) {
          setPhase('idle');
          onPlanRef.current(read.plan, url);
        } else {
          askForLength(read.plan);
        }
        return;
      }
    }

    // --- fall back to geometry alone ---
    try {
      const result = parseFloorPlan(loaded.raster);
      if (result.regions.length === 0) {
        setPhase('failed');
        setGame(null);
        return;
      }
      // Sized as a typical flat for now; the wall the person measures gives it its real size.
      const mpp = metresPerPixelFromArea(result.regions, ASSUMED_AREA_M2);
      setReadNotice('fallback');
      askForLength(ensureWalls(buildPlanFromRegions(result, { metresPerPixel: mpp })));
      settleGame({ rooms: null });
    } catch {
      setPhase('failed');
      setGame(null);
    }
    // `settleGame` and `askForLength` read only refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.design.pdfFailed, t.design.notAPlan]);

  const lengthValue = Number(wallLength.replace(',', '.'));
  const [minValue, maxValue] = scaleBy === 'wall' ? [MIN_WALL_LENGTH_M, MAX_WALL_LENGTH_M] : [MIN_PLAN_AREA_M2, MAX_PLAN_AREA_M2];
  const lengthValid = Number.isFinite(lengthValue) && lengthValue >= minValue && lengthValue <= maxValue;
  /** The wall, the room or the flat the number is about is there to scale by. */
  const scaleTarget = scaleBy === 'wall' ? scaleEdge != null : scaleBy === 'room' ? scaleRoom != null : true;
  const scaleLabel = scaleBy === 'wall' ? t.design.wallLengthLabel : scaleBy === 'room' ? t.design.scaleRoomAreaLabel : t.design.flatAreaLabel;
  const scaled = (plan: FloorPlan): FloorPlan =>
    scaleBy === 'wall' ? (scaleEdge ? scalePlanToEdge(plan, scaleEdge, lengthValue) : plan) : scalePlanToArea(plan, scaleBy === 'room' ? scaleRoom : null, lengthValue);

  const confirmScale = () => {
    if (!unsized || !scaleTarget) return;
    if (!lengthValid) {
      setError(scaleLabel);
      return;
    }
    onPlanRef.current(scaled(unsized), uploadedUrl);
  };

  // Without its own button, the card hands the plan over as soon as the length makes sense —
  // and takes it back when the field is cleared or goes out of range.
  useEffect(() => {
    if (showContinue || phase !== 'scale' || !unsized) return;
    if (!lengthValid || !scaleTarget) {
      onResetRef.current?.();
      return;
    }
    onPlanRef.current(scaled(unsized), uploadedUrl);
    // `scaled` reads only what is listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showContinue, phase, unsized, scaleBy, scaleEdge, scaleRoom, scaleTarget, lengthValid, lengthValue, uploadedUrl]);

  /**
   * The sample flat: a plan with every kind of room, doors, windows and balconies already in it
   * (`lib/design/samplePlan`), handed over at once — nothing to read, no area to give, the same
   * with or without a Claude key.
   */
  const trySample = () => {
    setError(null);
    setReadNotice(null);
    setUnsized(null);
    setGame(null);
    setUploadedUrl(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    const plan = samplePlan();
    setSample(plan);
    setPhase('idle');
    onPlanRef.current(plan, null);
  };

  const busy = phase === 'reading' || phase === 'parsing' || phase === 'pdf';

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped && gate('planUpload')) void handleFile(dropped);
        }}
        onClick={() => !busy && gate('planUpload') && inputRef.current?.click()}
        className={cn(
          'flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center transition-colors',
          dragging ? 'border-ink bg-lime-soft' : 'border-stone-dark bg-mist-light hover:border-ink hover:bg-lime-soft'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void handleFile(picked);
            // The same file picked twice should read again.
            e.target.value = '';
          }}
        />

        {busy ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-ink" />
            <p className="text-sm font-bold tracking-tight">
              {phase === 'pdf' ? t.design.pdfRendering : phase === 'reading' ? t.design.readingPlan : t.design.parsing}
            </p>
            {phase === 'reading' && (
              <p className="max-w-xs text-center text-xs text-ink-muted">{t.design.readingPlanHint}</p>
            )}
          </>
        ) : sample ? (
          <>
            <SamplePlanDrawing plan={sample} />
            <p className="text-xs font-medium text-ink">{t.design.sampleLoaded.replace('{rooms}', String(sample.rooms.length)).replace('{area}', formatM2(totalFloorAreaM2(sample)))}</p>
            <p className="text-xs text-ink-muted">{t.design.uploadReplace}</p>
          </>
        ) : previewUrl ? (
          <>
            <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-xl bg-bg-surface shadow-card">
              <Image src={previewUrl} alt={t.design.planPreview} fill unoptimized className="object-contain" />
            </div>
            <p className="text-xs text-ink-muted">{t.design.uploadReplace}</p>
          </>
        ) : (
          <>
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bg-surface text-ink shadow-card">
              <Upload className="h-6 w-6" />
            </span>
            {locked && <PlanBadge plan={locked} />}
            <p className="font-display text-lg">{t.design.uploadHint}</p>
            <p className="text-xs text-ink-muted">{t.design.uploadFormats}</p>
            <Button type="button" variant="outline" size="sm">
              {t.design.uploadButton}
            </Button>
            {showSample && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void trySample();
                }}
                className="text-xs font-bold text-ink underline decoration-lime decoration-[3px] underline-offset-4 hover:decoration-ink"
              >
                {t.design.trySample}
              </button>
            )}
          </>
        )}
      </div>

      {game && (
        <PlacementGame
          ready={game.ready}
          onClose={() => setGame(null)}
          onPlayed={() => {
            played.current = true;
          }}
        />
      )}

      {phase === 'scale' && readNotice === 'fallback' && (
        <p className="mt-4 rounded-xl bg-mist-light px-4 py-3 text-sm text-ink-muted">
          {t.design.aiReadFallback}
        </p>
      )}

      {phase === 'failed' && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-xl bg-sun-soft px-4 py-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-bold text-ink">{t.design.parseFailedTitle}</p>
            <p className="mt-1 text-ink-muted">{error ?? t.design.parseFailedDesc}</p>
          </div>
        </div>
      )}

      {phase === 'scale' && unsized && (
        <Card className="mt-4 border-ink">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles className="h-4 w-4" />
              {unsized.rooms.length} {t.design.detectedRooms}
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-display text-lg">
                <Ruler className="h-4 w-4 text-ink" />
                {scaleBy === 'wall' ? t.design.scaleTitle : scaleBy === 'room' ? t.design.scaleTitleRoom : t.design.scaleTitleFlat}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">{t.design.scaleDesc}</p>
            </div>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {(['wall', 'room', 'flat'] as const).map((by) => (
                <button
                  key={by}
                  type="button"
                  role="radio"
                  aria-checked={scaleBy === by}
                  onClick={() => {
                    setScaleBy(by);
                    setWallLength('');
                    setError(null);
                  }}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
                    scaleBy === by ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface text-ink hover:border-ink'
                  )}
                >
                  {by === 'wall' ? t.design.scaleByWall : by === 'room' ? t.design.scaleByRoom : t.design.scaleByFlat}
                </button>
              ))}
            </div>
            <ScalePlanDrawing
              plan={unsized}
              by={scaleBy}
              picked={scaleEdge}
              onPick={(edge) => setScaleEdge(edge)}
              pickedRoom={scaleRoom}
              onPickRoom={setScaleRoom}
              label={scaleBy === 'wall' ? t.design.pickWallHint : scaleBy === 'room' ? t.design.pickRoomHint : t.design.flatAreaHint}
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56">
                <Label htmlFor="plan-wall-length">{scaleLabel}</Label>
                <Input
                  id="plan-wall-length"
                  type="number"
                  min={minValue}
                  max={maxValue}
                  step={0.01}
                  inputMode="decimal"
                  value={wallLength}
                  onChange={(e) => setWallLength(e.target.value)}
                  placeholder={
                    scaleBy === 'wall'
                      ? scaleEdge ? (scaleEdgeLength(unsized, scaleEdge) ?? 0).toFixed(2) : '4.50'
                      : (scaleAreaNow(unsized, scaleBy === 'room' ? scaleRoom : null) ?? 0).toFixed(1)
                  }
                  autoFocus
                />
              </div>
              {showContinue && (
                <Button type="button" variant="ink" onClick={confirmScale} disabled={!wallLength || !scaleTarget}>
                  {t.design.applyScale}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
            {error && showContinue && <p className="text-sm text-danger">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * The plan read without a size, its rooms and walls. By a wall, every inside edge of a room is
 * clickable and the edge picked — the wall the person measures — is drawn in the brand colour;
 * by a room, the rooms are clickable and the one picked is outlined; by the flat, all of them are.
 */
function ScalePlanDrawing({
  plan,
  by,
  picked,
  onPick,
  pickedRoom,
  onPickRoom,
  label,
}: {
  plan: FloorPlan;
  by: ScaleBy;
  picked: ScaleEdge | null;
  onPick: (edge: ScaleEdge) => void;
  pickedRoom: string | null;
  onPickRoom: (roomId: string) => void;
  label: string;
}) {
  const points = [...plan.rooms.flatMap((r) => r.polygon), ...(plan.walls ?? []).flatMap((w) => [w.a, w.b])];
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const pad = 0.5;
  const minX = Math.min(...xs) - pad;
  const minZ = Math.min(...zs) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...zs) - minZ + pad;
  const stroke = Math.max(w, h) / 120;
  return (
    <div>
      <svg viewBox={`${minX} ${minZ} ${w} ${h}`} className="dots max-h-72 w-full rounded-xl border border-line bg-bg-surface" role="img" aria-label={label}>
        {plan.rooms.map((room) => (
          <polygon
            key={room.id}
            points={room.polygon.map((p) => `${p.x},${p.z}`).join(' ')}
            fill={ROOM_FILL[room.type] ?? '#FFFFFF'}
            className={by === 'room' ? 'cursor-pointer' : undefined}
            onClick={by === 'room' ? () => onPickRoom(room.id) : undefined}
          />
        ))}
        {(plan.walls ?? [])
          .filter((wall) => !wall.separator)
          .map((wall) => (
            <line key={wall.id} x1={wall.a.x} y1={wall.a.z} x2={wall.b.x} y2={wall.b.z} stroke="#0B0B0C" strokeWidth={Math.max(wall.thicknessM, stroke)} strokeLinecap="square" />
          ))}
        {by !== 'wall' &&
          plan.rooms
            .filter((room) => by === 'flat' || room.id === pickedRoom)
            .map((room) => (
              <polygon
                key={`${room.id}-picked`}
                points={room.polygon.map((p) => `${p.x},${p.z}`).join(' ')}
                strokeWidth={stroke * 2.5}
                strokeLinejoin="round"
                className="fill-brand/15 stroke-brand"
                pointerEvents="none"
              />
            ))}
        {by === 'wall' && plan.rooms.flatMap((room) =>
          roomEdges(room.polygon).map((edge) => {
            const on = picked?.roomId === room.id && picked.edgeIndex === edge.index;
            return (
              <line
                key={`${room.id}-${edge.index}`}
                x1={edge.a.x}
                y1={edge.a.z}
                x2={edge.b.x}
                y2={edge.b.z}
                strokeWidth={on ? stroke * 2.5 : stroke * 6}
                className={cn('cursor-pointer', on ? 'stroke-brand' : 'stroke-transparent')}
                onClick={() => onPick({ roomId: room.id, edgeIndex: edge.index })}
              />
            );
          })
        )}
        {plan.rooms.map((room) => {
          const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
          const cz = room.polygon.reduce((s, p) => s + p.z, 0) / room.polygon.length;
          return (
            <text key={`${room.id}-name`} x={cx} y={cz} fontSize={stroke * 3.2} textAnchor="middle" dominantBaseline="middle" fill="#0B0B0C" pointerEvents="none">
              {room.name}
            </text>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-ink-muted">{label}</p>
    </div>
  );
}

/** Fills by kind of room, so the sample reads at a glance: wet rooms blue, outside green, the rest warm. */
const ROOM_FILL: Record<string, string> = { bathroom: '#E3EAFF', toilet: '#E3EAFF', kitchen: '#FFF3C9', balcony: '#F0FBCB', hallway: '#F4F4F6', closet: '#EFEAFF', office: '#EFEAFF' };

/** The sample flat drawn as its rooms with their names — what the picture of an uploaded plan is for an upload. */
function SamplePlanDrawing({ plan }: { plan: FloorPlan }) {
  const xs = plan.rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const zs = plan.rooms.flatMap((r) => r.polygon.map((p) => p.z));
  const minX = Math.min(...xs) - 0.3;
  const minZ = Math.min(...zs) - 0.3;
  const w = Math.max(...xs) - minX + 0.3;
  const h = Math.max(...zs) - minZ + 0.3;
  return (
    <svg viewBox={`${minX} ${minZ} ${w} ${h}`} className="h-40 w-full max-w-sm rounded-xl border border-line bg-bg-surface" role="img" aria-label={plan.rooms.map((r) => r.name).join(', ')}>
      {plan.rooms.map((room) => {
        const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
        const cz = room.polygon.reduce((s, p) => s + p.z, 0) / room.polygon.length;
        return (
          <g key={room.id}>
            <polygon points={room.polygon.map((p) => `${p.x},${p.z}`).join(' ')} fill={ROOM_FILL[room.type] ?? '#FFFFFF'} stroke="#0B0B0C" strokeWidth={0.08} strokeLinejoin="miter" />
            <text x={cx} y={cz} fontSize={room.areaM2 < 6 ? 0.32 : 0.42} textAnchor="middle" dominantBaseline="middle" fill="#0B0B0C">
              {room.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
