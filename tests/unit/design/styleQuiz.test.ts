import { describe, expect, it } from 'vitest';
import { profileConfidence, quizComplete, scoreQuiz, STYLE_QUIZ } from '@/lib/design/styleQuiz';

describe('style quiz', () => {
  it('has five questions with four answers each, every answer leaning to a style', () => {
    expect(STYLE_QUIZ).toHaveLength(5);
    for (const q of STYLE_QUIZ) {
      expect(q.options).toHaveLength(4);
      for (const o of q.options) expect(Math.max(...Object.values(o.weights))).toBeGreaterThanOrEqual(2);
    }
  });

  it('scores a consistent set of answers to one style', () => {
    const answers = { palette: 'oak', materials: 'wool', furniture: 'light', lighting: 'paper', atmosphere: 'hygge' };
    expect(quizComplete(answers)).toBe(true);
    const { styleId, profile } = scoreQuiz(answers);
    expect(styleId).toBe('scandinavian');
    expect(profile.scores.scandinavian).toBe(10);
    expect(profileConfidence(profile, styleId)).toBe(1);
  });

  it('breaks a tie towards the palette answer', () => {
    const answers = { palette: 'brick', materials: 'velvet', furniture: 'workshop', lighting: 'chandelier', atmosphere: 'gallery' };
    const { styleId, profile } = scoreQuiz(answers);
    expect(profile.scores.industrial).toBe(4);
    expect(profile.scores.vintage).toBe(4);
    expect(styleId).toBe('industrial');
    expect(profileConfidence(profile, styleId)).toBeLessThan(0.5);
  });

  it('is incomplete with a question missing or a made-up answer', () => {
    expect(quizComplete({ palette: 'oak' })).toBe(false);
    expect(quizComplete({ palette: 'oak', materials: 'x', furniture: 'light', lighting: 'paper', atmosphere: 'hygge' })).toBe(false);
  });
});
