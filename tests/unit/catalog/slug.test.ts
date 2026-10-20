import { describe, expect, it } from 'vitest';
import { freeSlug, latinSlug, likePrefix, SLUG_MAX, transliterate } from '@/lib/slug';

describe('a slug from a name', () => {
  it('writes Georgian in Latin letters, lower case, with hyphens', () => {
    expect(latinSlug('ჟურნალის მაგიდა')).toBe('zhurnalis-magida');
    expect(latinSlug('შავი ხის ღია თარო — ჭადრაკი, წყალი, ყავა')).toBe('shavi-khis-ghia-taro-chadraki-tsqali-qava');
    expect(latinSlug('ძველი ფიცარი')).toBe('dzveli-pitsari');
  });

  it('keeps Latin words and digits, drops accents and anything else', () => {
    expect(latinSlug('  Oslo 120×60 — Café!  ')).toBe('oslo-120-60-cafe');
    expect(latinSlug('დივანი «Oslo» 3-ადგილიანი')).toBe('divani-oslo-3-adgiliani');
    expect(latinSlug('***')).toBe('');
  });

  it('writes Russian in Latin letters too', () => {
    expect(latinSlug('Журнальный столик')).toBe('zhurnalnyy-stolik');
    expect(latinSlug('Ёлка щётка')).toBe('elka-shchetka');
  });

  it('lowers upper-case Georgian (Mtavruli) first', () => {
    expect(transliterate('ᲛᲐᲒᲘᲓᲐ')).toBe('magida');
  });

  it('stops at SLUG_MAX without a hyphen at the end', () => {
    const slug = latinSlug('ა '.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('a free slug', () => {
  it('is the slug itself when nobody has it, else the first free number after it', () => {
    expect(freeSlug('stoli', [])).toBe('stoli');
    expect(freeSlug('stoli', ['stoli', 'stoli-oslo'])).toBe('stoli-2');
    expect(freeSlug('stoli', ['stoli', 'stoli-2', 'stoli-3', 'stoli-5'])).toBe('stoli-4');
  });

  it('matches everything starting with the slug, its LIKE wildcards escaped', () => {
    expect(likePrefix('stoli')).toBe('stoli%');
    expect(likePrefix('50%_off\\x')).toBe('50\\%\\_off\\\\x%');
  });
});
