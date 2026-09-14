'use client';

/**
 * The style test: five questions as swatch cards, one at a time, and the verdict. The four
 * style plates stay under it for anyone who already knows what they like.
 */

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { styleLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';
import { profileConfidence, quizComplete, scoreQuiz, STYLE_QUIZ, type QuizQuestionId } from '@/lib/design/styleQuiz';
import { STYLES } from '@/lib/design/styles';
import type { StyleId, StyleProfile } from '@/lib/design/types';
import type { Dictionary } from '@/lib/i18n';

const QUESTION_KEY: Record<QuizQuestionId, keyof Dictionary['build']> = { palette: 'qPalette', materials: 'qMaterials', furniture: 'qFurniture', lighting: 'qLighting', atmosphere: 'qAtmosphere' };
const OPTION_KEY: Record<string, keyof Dictionary['build']> = {
  graphite: 'qPaletteGraphite',
  oak: 'qPaletteOak',
  brick: 'qPaletteBrick',
  walnut: 'qPaletteWalnut',
  glass: 'qMatGlass',
  wool: 'qMatWool',
  concrete: 'qMatConcrete',
  velvet: 'qMatVelvet',
  sleek: 'qFurSleek',
  light: 'qFurLight',
  workshop: 'qFurWorkshop',
  carved: 'qFurCarved',
  hidden: 'qLightHidden',
  paper: 'qLightPaper',
  bulbs: 'qLightBulbs',
  chandelier: 'qLightChandelier',
  gallery: 'qAtmGallery',
  hygge: 'qAtmHygge',
  loft: 'qAtmLoft',
  collected: 'qAtmCollected',
};

export function StyleQuiz({ profile, styleId, onResult, onRetake, className }: { profile: StyleProfile | null; styleId: StyleId; onResult: (styleId: StyleId, profile: StyleProfile) => void; onRetake: () => void; className?: string }) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, string>>(profile?.answers ?? {});
  const [index, setIndex] = useState(() => (profile && !profile.direct ? STYLE_QUIZ.length : 0));
  const question = STYLE_QUIZ[Math.min(index, STYLE_QUIZ.length - 1)];
  const finished = index >= STYLE_QUIZ.length && quizComplete(answers);
  const verdict = finished ? scoreQuiz(answers) : null;

  const pick = (optionId: string) => {
    const next = { ...answers, [question.id]: optionId };
    setAnswers(next);
    if (index < STYLE_QUIZ.length - 1) {
      setIndex(index + 1);
    } else {
      setIndex(STYLE_QUIZ.length);
      const result = scoreQuiz(next);
      onResult(result.styleId, result.profile);
    }
  };

  const retake = () => {
    setAnswers({});
    setIndex(0);
    onRetake();
  };

  if (finished && verdict) {
    const style = STYLES[verdict.styleId];
    const confidence = Math.round(profileConfidence(verdict.profile, verdict.styleId) * 100);
    return (
      <div className={cn('rounded-[20px] border border-line bg-white p-6', className)}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex gap-1">
            {style.swatches.map((hex) => (
              <span key={hex} className="h-10 w-10 rounded-[10px] border border-white/60 shadow-card" style={{ backgroundColor: hex }} />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              {t.build.quizResult}
            </p>
            <p className="mt-1 font-serif text-3xl font-bold text-ink">{styleLabel(t, verdict.styleId)}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {fill(t.build.quizConfidence, { n: confidence, style: styleLabel(t, verdict.styleId) })} · {t.styleBlurbs[verdict.styleId]}
            </p>
          </div>
          <button type="button" onClick={retake} className="flex h-10 items-center gap-2 rounded-[12px] border border-line px-4 text-sm font-medium text-ink-soft hover:border-ink hover:text-ink">
            <RotateCcw className="h-4 w-4" />
            {t.build.quizRetake}
          </button>
        </div>
        {styleId !== verdict.styleId && <p className="mt-4 text-xs text-ink-muted">{t.build.quizPicked}: {styleLabel(t, styleId)}</p>}
      </div>
    );
  }

  return (
    <div className={cn('rounded-[20px] border border-line bg-white p-6', className)}>
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow">{fill(t.build.quizQuestionN, { n: index + 1 })}</p>
        <div className="flex gap-1">
          {STYLE_QUIZ.map((q, i) => (
            <span key={q.id} className={cn('h-1.5 w-8 rounded-full', i < index ? 'bg-ink' : i === index ? 'bg-brand' : 'bg-line')} />
          ))}
        </div>
      </div>
      <h2 className="mt-3 font-serif text-2xl font-semibold text-ink">{t.build[QUESTION_KEY[question.id]]}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup">
        {question.options.map((option) => {
          const active = answers[question.id] === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(option.id)}
              className={cn('group flex flex-col gap-3 rounded-[16px] border p-4 text-left transition-colors', active ? 'border-ink bg-sand-light' : 'border-line hover:border-ink/50')}
            >
              <span className="flex gap-1">
                {option.swatches.map((hex) => (
                  <span key={hex} className="h-9 flex-1 rounded-[8px] border border-black/5" style={{ backgroundColor: hex }} />
                ))}
              </span>
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-snug text-ink">{t.build[OPTION_KEY[option.id]]}</span>
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', active ? 'border-ink bg-ink text-white' : 'border-line text-transparent group-hover:border-ink/40')}>
                  <Check className="h-3 w-3" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} className="flex h-9 items-center gap-1.5 text-sm text-ink-soft hover:text-ink disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" />
          {t.build.quizBack}
        </button>
        {answers[question.id] && index < STYLE_QUIZ.length - 1 && (
          <button type="button" onClick={() => setIndex(index + 1)} className="flex h-9 items-center gap-1.5 text-sm font-medium text-ink hover:text-brand">
            {t.build.quizNext}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
