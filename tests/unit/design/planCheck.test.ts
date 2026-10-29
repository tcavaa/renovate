import { describe, expect, it } from 'vitest';
import { checkIsPlan, parseCheck } from '@/lib/design/planCheck';

describe('parseCheck', () => {
  it('takes the answer as given', () => {
    expect(parseCheck('{"isPlan":false,"depicts":"a red car"}')).toEqual({ isPlan: false, depicts: 'a red car' });
    expect(parseCheck('{"isPlan":true,"depicts":"a CAD floor plan"}').isPlan).toBe(true);
  });

  it('counts anything it cannot read as a plan, so the check never blocks a read', () => {
    expect(parseCheck('not json').isPlan).toBe(true);
    expect(parseCheck('{"depicts":"?"}').isPlan).toBe(true);
  });
});

describe('checkIsPlan', () => {
  it('lets everything through without a key', async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect((await checkIsPlan({ imageBase64: '', mediaType: 'image/jpeg' })).isPlan).toBe(true);
    } finally {
      if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
    }
  });
});
