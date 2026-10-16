'use client';

/**
 * Upload a 2D plan and get a `FloorPlan` back.
 *
 * Two paths, in order of how good the answer is. First the drawing is uploaded and sent to
 * `/api/design/parse-plan`, which reads the room labels and — crucially — the dimension
 * strings printed on it, giving a plan whose walls are the length the architect drew. If
 * that is unavailable (no API key) or comes back empty, it falls back to the local CV
 * parser, which finds rooms geometrically but has no idea how big they are, so the user
 * supplies the total area.
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
 * the plan the moment the area is valid, because its continue button sits further down the
 * page, under the "what do you need" choice.
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
import { buildPlanFromRegions, metresPerPixelFromArea, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { samplePlan } from '@/lib/design/samplePlan';
import { formatM2 } from '@/lib/utils';
import { PlacementGame } from '@/components/design/PlacementGame';
import type { FloorPlan, ParseResult } from '@/lib/design/types';

type Phase = 'idle' | 'pdf' | 'reading' | 'parsing' | 'scale' | 'failed';

interface PlanUploadCardProps {
  /** Called with the finished plan and the uploaded image's URL, if any. */
  onPlan: (plan: FloorPlan, imageUrl: string | null) => void;
  /** A new file started loading, or the area went invalid: whatever plan was handed over is stale. */
  onReset?: () => void;
  /** Offer the bundled sample plan. */
  showSample?: boolean;
  /**
   * Show the card's own "continue" under the area field. Off, the plan is handed over as
   * soon as the area is valid and the page's own button does the continuing.
   */
  showContinue?: boolean;
}

const MIN_AREA_M2 = 8;
const MAX_AREA_M2 = 2000;

async function readPlanFromDrawing(imageUrl: string): Promise<FloorPlan | null> {
  try {
    const res = await fetch('/api/design/parse-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    });
    const json = await res.json();
    if (!res.ok || !json.data?.plan) return null;
    return json.data.plan as FloorPlan;
  } catch {
    return null;
  }
}

export function PlanUploadCard({ onPlan, onReset, showSample = false, showContinue = true }: PlanUploadCardProps) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('idle');
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [totalArea, setTotalArea] = useState('');
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

  const handleFile = useCallback(async (picked: File) => {
    setError(null);
    setReadNotice(null);
    setParse(null);
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
      const plan = await readPlanFromDrawing(url);
      if (plan) {
        setPhase('idle');
        settleGame({ rooms: plan.rooms.length });
        onPlanRef.current(plan, url);
        return;
      }
    }

    // --- fall back to geometry alone ---
    try {
      const result = parseFloorPlan(loaded.raster);
      setParse(result);
      if (result.regions.length === 0) {
        setPhase('failed');
        setGame(null);
        return;
      }
      setReadNotice('fallback');
      setPhase('scale');
      settleGame({ rooms: null });
    } catch {
      setPhase('failed');
      setGame(null);
    }
    // `settleGame` reads only a ref and a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.design.pdfFailed]);

  const areaValue = Number(totalArea);
  const areaValid = Number.isFinite(areaValue) && areaValue >= MIN_AREA_M2 && areaValue <= MAX_AREA_M2;

  const confirmScale = () => {
    if (!parse) return;
    if (!areaValid) {
      setError(t.design.totalAreaLabel);
      return;
    }
    const mpp = metresPerPixelFromArea(parse.regions, areaValue);
    onPlanRef.current(buildPlanFromRegions(parse, { metresPerPixel: mpp }), uploadedUrl);
  };

  // Without its own button, the card hands the plan over as soon as the area makes sense —
  // and takes it back when the field is cleared or goes out of range.
  useEffect(() => {
    if (showContinue || phase !== 'scale' || !parse) return;
    if (!areaValid) {
      onResetRef.current?.();
      return;
    }
    const mpp = metresPerPixelFromArea(parse.regions, areaValue);
    onPlanRef.current(buildPlanFromRegions(parse, { metresPerPixel: mpp }), uploadedUrl);
  }, [showContinue, phase, parse, areaValid, areaValue, uploadedUrl]);

  /**
   * The sample flat: a plan with every kind of room, doors, windows and balconies already in it
   * (`lib/design/samplePlan`), handed over at once — nothing to read, no area to give, the same
   * with or without a Claude key.
   */
  const trySample = () => {
    setError(null);
    setReadNotice(null);
    setParse(null);
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
          if (dropped) void handleFile(dropped);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={cn(
          'flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 border border-dashed p-8 text-center transition-colors',
          dragging ? 'border-ink bg-sand-light' : 'border-line bg-bg-surface hover:border-ink/50'
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
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm font-medium">
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
            <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-md border border-line bg-white">
              <Image src={previewUrl} alt={t.design.planPreview} fill unoptimized className="object-contain" />
            </div>
            <p className="text-xs text-ink-muted">{t.design.uploadReplace}</p>
          </>
        ) : (
          <>
            <span className="grid h-12 w-12 place-items-center border border-line bg-bg-surface text-ink">
              <Upload className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium">{t.design.uploadHint}</p>
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
                className="text-xs font-medium text-brand underline-offset-4 hover:underline"
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
        <p className="mt-4 rounded-lg border border-line bg-bg-base px-4 py-3 text-sm text-ink-muted">
          {t.design.aiReadFallback}
        </p>
      )}

      {phase === 'failed' && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-ink">{t.design.parseFailedTitle}</p>
            <p className="mt-1 text-ink-muted">{error ?? t.design.parseFailedDesc}</p>
          </div>
        </div>
      )}

      {phase === 'scale' && parse && (
        <Card className="mt-4 border-ink/30">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <Sparkles className="h-4 w-4" />
              {parse.regions.length} {t.design.detectedRooms}
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-serif text-lg font-semibold">
                <Ruler className="h-4 w-4 text-brand" />
                {t.design.scaleTitle}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">{t.design.scaleDesc}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <Label htmlFor="plan-total-area">{t.design.totalAreaLabel}</Label>
                <Input
                  id="plan-total-area"
                  type="number"
                  min={MIN_AREA_M2}
                  max={MAX_AREA_M2}
                  step={0.5}
                  inputMode="decimal"
                  value={totalArea}
                  onChange={(e) => setTotalArea(e.target.value)}
                  placeholder="85"
                  autoFocus
                />
              </div>
              {showContinue && (
                <Button type="button" variant="ink" onClick={confirmScale} disabled={!totalArea}>
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

/** Fills by kind of room, so the sample reads at a glance: wet rooms blue, outside green, the rest warm. */
const ROOM_FILL: Record<string, string> = { bathroom: '#DCE9F2', toilet: '#DCE9F2', kitchen: '#F4E7D3', balcony: '#E3EEDB', hallway: '#EFECE6', closet: '#EDE7F0' };

/** The sample flat drawn as its rooms with their names — what the picture of an uploaded plan is for an upload. */
function SamplePlanDrawing({ plan }: { plan: FloorPlan }) {
  const xs = plan.rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const zs = plan.rooms.flatMap((r) => r.polygon.map((p) => p.z));
  const minX = Math.min(...xs) - 0.3;
  const minZ = Math.min(...zs) - 0.3;
  const w = Math.max(...xs) - minX + 0.3;
  const h = Math.max(...zs) - minZ + 0.3;
  return (
    <svg viewBox={`${minX} ${minZ} ${w} ${h}`} className="h-40 w-full max-w-sm rounded-md border border-line bg-white" role="img" aria-label={plan.rooms.map((r) => r.name).join(', ')}>
      {plan.rooms.map((room) => {
        const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
        const cz = room.polygon.reduce((s, p) => s + p.z, 0) / room.polygon.length;
        return (
          <g key={room.id}>
            <polygon points={room.polygon.map((p) => `${p.x},${p.z}`).join(' ')} fill={ROOM_FILL[room.type] ?? '#FBF8F3'} stroke="#2A2622" strokeWidth={0.08} strokeLinejoin="miter" />
            <text x={cx} y={cz} fontSize={room.areaM2 < 6 ? 0.32 : 0.42} textAnchor="middle" dominantBaseline="middle" fill="#2A2622">
              {room.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
