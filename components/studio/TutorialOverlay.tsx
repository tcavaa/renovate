'use client';

/**
 * The introduction before editing: eight short cards — next, next, next — each lighting up
 * the part of the studio it talks about. Everything else is dimmed and blurred; the target
 * (the rail, the lock button, the help card, the canvas) stays sharp inside a ring, and the
 * card sits beside it. Shown once, on the first visit to the studio (remembered in this
 * browser), and again from the help button.
 *
 * Targets are found by `data-tour` attributes in the studio's markup; a step whose target
 * is not on screen (the help card folded away) falls back to lighting up the whole canvas.
 */

import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowRight, Check, Compass, Hammer, Lock, MousePointer2, Move3d, PaintBucket, RotateCcw, Sofa, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export const TUTORIAL_KEY = 'renovate-studio-tour-v3';

/** Each step: its icon and the `data-tour` target it lights up. */
const STEPS: Array<{ icon: typeof Sofa; target: string; /** Padding around the target, px. */ pad?: number }> = [
  { icon: Sofa, target: 'canvas', pad: -24 },
  { icon: Compass, target: 'navhelp' },
  { icon: MousePointer2, target: 'canvas', pad: -24 },
  { icon: Move3d, target: 'canvas', pad: -24 },
  { icon: Hammer, target: 'rail-furniture' },
  { icon: Lock, target: 'lock' },
  { icon: PaintBucket, target: 'rail-finishes' },
  { icon: RotateCcw, target: 'history' },
];

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // Storage may be unavailable (a private window); the tour will simply show again.
  }
}

interface Hole {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function TutorialOverlay({ open, onClose, container, onStep }: { open: boolean; onClose: () => void; /** The studio workspace the overlay covers and searches for targets. */ container: HTMLElement | null; /** Told which step is showing, so the studio can open what the step points at. */ onStep?: (index: number) => void }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const b = t.build as unknown as Record<string, string>;
  const total = STEPS.length;

  useEffect(() => {
    if (open) onStep?.(index);
  }, [open, index, onStep]);

  // Measure the target after the studio has reacted to the step (a tray opening, say).
  useLayoutEffect(() => {
    if (!open || !container) return;
    let frame = 0;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      setSize({ width: bounds.width, height: bounds.height });
      const step = STEPS[index];
      const element = container.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!element || step.target === 'canvas') {
        const pad = step.pad ?? 0;
        setHole({ x: -pad, y: -pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 });
        return;
      }
      const rect = element.getBoundingClientRect();
      const pad = step.pad ?? 8;
      setHole({ x: rect.left - bounds.left - pad, y: rect.top - bounds.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 });
    };
    frame = window.requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 320);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [open, index, container]);

  if (!open) return null;
  const step = STEPS[index];
  const Icon = step.icon;
  const last = index === total - 1;
  const finish = () => {
    markTutorialSeen();
    setIndex(0);
    onClose();
  };
  const whole = step.target === 'canvas';
  const card = placeCard(hole, size, whole);

  return (
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.build.tutorial}>
      {/* Four dimmed, blurred panels around the hole; the target shows through sharp. */}
      {hole && !whole ? (
        <>
          <Shade style={{ left: 0, top: 0, width: '100%', height: Math.max(0, hole.y) }} />
          <Shade style={{ left: 0, top: hole.y + hole.height, width: '100%', height: Math.max(0, size.height - hole.y - hole.height) }} />
          <Shade style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.height }} />
          <Shade style={{ left: hole.x + hole.width, top: hole.y, width: Math.max(0, size.width - hole.x - hole.width), height: hole.height }} />
          <div className="pointer-events-none absolute rounded-[16px] ring-4 ring-brand/90 shadow-[0_0_0_9999px_rgba(0,0,0,0)] transition-all duration-300" style={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height }} />
        </>
      ) : (
        <Shade style={{ inset: 0 }} soft />
      )}

      <div className="absolute w-[min(92vw,400px)] rounded-[20px] border border-white/60 bg-white p-5 shadow-float transition-all duration-300" style={card}>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={cn('h-1.5 w-5 rounded-full', i < index ? 'bg-ink' : i === index ? 'bg-brand' : 'bg-line')} />
            ))}
          </div>
          <button type="button" onClick={finish} aria-label={t.build.tutorialSkip} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-muted hover:bg-sand-light hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-brand/10 text-brand">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="eyebrow">{`${index + 1} / ${total}`}</p>
            <h3 className="mt-1 font-serif text-lg font-semibold text-ink">{b[`tut${index + 1}Title`]}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{b[`tut${index + 1}Body`]}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={finish} className="text-xs text-ink-muted hover:text-ink">
              {t.build.tutorialSkip}
            </button>
            {index > 0 && (
              <button type="button" onClick={() => setIndex(index - 1)} className="text-xs text-ink-muted hover:text-ink">
                {t.build.quizBack}
              </button>
            )}
          </div>
          <button type="button" onClick={() => (last ? finish() : setIndex(index + 1))} className="flex h-9 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white hover:bg-brand">
            {last ? t.build.tutorialDone : index === 0 ? t.build.tutorialStart : t.build.tutorialNext}
            {last ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shade({ style, soft }: { style: React.CSSProperties; soft?: boolean }) {
  return <div className={cn('absolute transition-all duration-300', soft ? 'bg-ink/35 backdrop-blur-[1.5px]' : 'bg-ink/55 backdrop-blur-[3px]')} style={style} />;
}

/**
 * Where the card goes: beside the hole, on whichever side has the room — right, then left,
 * then below, then above — and in the middle when the whole canvas is lit.
 */
function placeCard(hole: Hole | null, size: { width: number; height: number }, whole: boolean): React.CSSProperties {
  const cardW = Math.min(400, size.width * 0.92);
  const cardH = 260;
  const gap = 16;
  if (whole || !hole || size.width === 0) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const clampY = (y: number) => Math.max(12, Math.min(size.height - cardH - 12, y));
  const clampX = (x: number) => Math.max(12, Math.min(size.width - cardW - 12, x));
  const centreY = clampY(hole.y + hole.height / 2 - cardH / 2);
  if (hole.x + hole.width + gap + cardW <= size.width) return { left: hole.x + hole.width + gap, top: centreY };
  if (hole.x - gap - cardW >= 0) return { left: hole.x - gap - cardW, top: centreY };
  const centreX = clampX(hole.x + hole.width / 2 - cardW / 2);
  if (hole.y + hole.height + gap + cardH <= size.height) return { left: centreX, top: hole.y + hole.height + gap };
  return { left: centreX, top: clampY(hole.y - gap - cardH) };
}
