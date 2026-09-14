/**
 * The style test: five questions, four answers each, one style profile.
 *
 * Each answer leans towards one of the four styles (a little towards a second, where the
 * taste genuinely overlaps); the profile is the sum. The questions themselves are copy and
 * live in the dictionaries under `styleQuiz`; this module holds only the structure and the
 * arithmetic, so it is testable without a language.
 */

import type { StyleId, StyleProfile } from './types';
import { STYLE_IDS } from './styles';

export type QuizQuestionId = 'palette' | 'materials' | 'furniture' | 'lighting' | 'atmosphere';

export interface QuizOption {
  id: string;
  /** How much this answer counts for each style. */
  weights: Partial<Record<StyleId, number>>;
  /** Swatch colours the option card shows. */
  swatches: string[];
}

export interface QuizQuestion {
  id: QuizQuestionId;
  options: QuizOption[];
}

export const STYLE_QUIZ: QuizQuestion[] = [
  {
    id: 'palette',
    options: [
      { id: 'graphite', weights: { modern: 2 }, swatches: ['#2E3238', '#F4F4F2', '#B9BDC2', '#C9A227'] },
      { id: 'oak', weights: { scandinavian: 2 }, swatches: ['#D8B98C', '#F7F4EF', '#9BA7A5', '#6E8B8C'] },
      { id: 'brick', weights: { industrial: 2 }, swatches: ['#8B4A2B', '#2A2A2A', '#B07A4F', '#8E8E8A'] },
      { id: 'walnut', weights: { vintage: 2 }, swatches: ['#5B3A29', '#B08D57', '#3E5C4F', '#7A2E3B'] },
    ],
  },
  {
    id: 'materials',
    options: [
      { id: 'glass', weights: { modern: 2 }, swatches: ['#DCE6EA', '#C7CBD0', '#F4F4F2'] },
      { id: 'wool', weights: { scandinavian: 2 }, swatches: ['#EDE7DC', '#DDBE90', '#C9CCC6'] },
      { id: 'concrete', weights: { industrial: 2, modern: 0.5 }, swatches: ['#8E8E8A', '#4A4A4A', '#A0522D'] },
      { id: 'velvet', weights: { vintage: 2 }, swatches: ['#3E5C4F', '#7A2E3B', '#B08D57'] },
    ],
  },
  {
    id: 'furniture',
    options: [
      { id: 'sleek', weights: { modern: 2 }, swatches: ['#2E3238', '#8D9298'] },
      { id: 'light', weights: { scandinavian: 2 }, swatches: ['#D8B98C', '#F7F4EF'] },
      { id: 'workshop', weights: { industrial: 2 }, swatches: ['#2A2A2A', '#B07A4F'] },
      { id: 'carved', weights: { vintage: 2 }, swatches: ['#5B3A29', '#B08D57'] },
    ],
  },
  {
    id: 'lighting',
    options: [
      { id: 'hidden', weights: { modern: 2, scandinavian: 0.5 }, swatches: ['#FFF3DC', '#2E3238'] },
      { id: 'paper', weights: { scandinavian: 2 }, swatches: ['#FFEFD0', '#F7F4EF'] },
      { id: 'bulbs', weights: { industrial: 2 }, swatches: ['#FFD58A', '#2A2A2A'] },
      { id: 'chandelier', weights: { vintage: 2 }, swatches: ['#FFE8B0', '#B08D57'] },
    ],
  },
  {
    id: 'atmosphere',
    options: [
      { id: 'gallery', weights: { modern: 2 }, swatches: ['#F4F4F2', '#B9BDC2'] },
      { id: 'hygge', weights: { scandinavian: 2 }, swatches: ['#F7F4EF', '#D8B98C'] },
      { id: 'loft', weights: { industrial: 2 }, swatches: ['#8E8E8A', '#8B4A2B'] },
      { id: 'collected', weights: { vintage: 2 }, swatches: ['#5B3A29', '#3E5C4F'] },
    ],
  },
];

export const QUIZ_QUESTION_IDS = STYLE_QUIZ.map((q) => q.id);

/** True once every question has an answer. */
export function quizComplete(answers: Record<string, string>): boolean {
  return STYLE_QUIZ.every((q) => q.options.some((o) => o.id === answers[q.id]));
}

/**
 * Sums the answers into a profile. Ties go to the style the first answered question leaned
 * towards — the palette is what people see first and feel strongest about.
 */
export function scoreQuiz(answers: Record<string, string>): { profile: StyleProfile; styleId: StyleId } {
  const scores: Record<StyleId, number> = { modern: 0, scandinavian: 0, industrial: 0, vintage: 0 };
  let firstLean: StyleId | null = null;
  for (const question of STYLE_QUIZ) {
    const option = question.options.find((o) => o.id === answers[question.id]);
    if (!option) continue;
    for (const [style, weight] of Object.entries(option.weights) as Array<[StyleId, number]>) {
      scores[style] += weight;
      if (!firstLean && weight >= 2) firstLean = style;
    }
  }
  const top = Math.max(...STYLE_IDS.map((id) => scores[id]));
  const leaders = STYLE_IDS.filter((id) => scores[id] === top);
  const styleId = leaders.length === 1 ? leaders[0] : firstLean && leaders.includes(firstLean) ? firstLean : leaders[0];
  return { profile: { answers, scores }, styleId };
}

/** How strongly the profile leans to its winner, 0..1, for the "you are 80 % Scandinavian" line. */
export function profileConfidence(profile: StyleProfile, styleId: StyleId): number {
  const total = Object.values(profile.scores).reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return Math.round((profile.scores[styleId] / total) * 100) / 100;
}
