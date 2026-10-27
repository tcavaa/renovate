import { describe, expect, it } from 'vitest';
import { STYLE_GUIDES, guideFit, styleGuideText, subStyleFor } from '@/lib/design/styleGuide';
import { STYLE_IDS } from '@/lib/design/styles';
import { seededRng } from '@/lib/design/random';
import type { StyleProfile } from '@/lib/design/types';

const answered = (answers: Record<string, string>): StyleProfile => ({ answers, scores: { modern: 0, scandinavian: 0, industrial: 0, vintage: 0 } });

describe('the styles’ guides', () => {
  it('has a guide for each of the four styles, with its sub-styles', () => {
    for (const id of STYLE_IDS) expect(STYLE_GUIDES[id].subStyles.length).toBeGreaterThan(0);
    expect(STYLE_GUIDES.industrial.subStyles.map((s) => s.id)).toEqual(['urban-industrial', 'loft', 'concrete-minimal']);
    expect(STYLE_GUIDES.vintage.subStyles.map((s) => s.id)).toEqual(['traditional', 'french-country', 'farmhouse', 'bohemian']);
  });

  it('takes the sub-style the style test points to, or draws one when the plate was picked', () => {
    expect(subStyleFor('industrial', answered({ palette: 'brick', atmosphere: 'loft' })).id).toBe('loft');
    expect(subStyleFor('industrial', answered({ materials: 'concrete', lighting: 'hidden' })).id).toBe('concrete-minimal');
    expect(subStyleFor('vintage', answered({ materials: 'velvet', atmosphere: 'collected' })).id).toBe('bohemian');
    expect(subStyleFor('modern', answered({ palette: 'graphite', furniture: 'sleek' })).id).toBe('contemporary');
    const direct = { ...answered({ palette: 'brick' }), direct: true };
    expect(subStyleFor('industrial', direct).id).toBe('urban-industrial');
    const drawn = new Set(Array.from({ length: 30 }, (_, i) => subStyleFor('vintage', null, seededRng(i)).id));
    expect(drawn.size).toBeGreaterThan(1);
  });

  it('writes the guide for the model, the sub-style when the style has more than one', () => {
    const loft = STYLE_GUIDES.industrial.subStyles[1];
    const text = styleGuideText('industrial', loft);
    expect(text).toMatch(/Style guide — industrial: raw, textured/);
    expect(text).toMatch(/This flat's sub-style: Loft — palette: brick red/);
    expect(styleGuideText('scandinavian', STYLE_GUIDES.scandinavian.subStyles[0])).not.toMatch(/sub-style/);
  });

  it('weights a product of the style’s colours and materials up, and leaves an unknown one alone', () => {
    expect(guideFit({ colorHex: '#EDE7DC', nameEn: 'Linen sofa' }, 'scandinavian')).toBeCloseTo(1.6, 6);
    expect(guideFit({ colorHex: '#C8372D' }, 'scandinavian')).toBe(1);
    expect(guideFit({ colorHex: '#C8372D', tags: ['brick'] }, 'industrial')).toBeCloseTo(1.6, 6);
    expect(guideFit({}, 'modern')).toBe(1);
  });
});
