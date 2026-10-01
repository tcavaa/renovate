import { describe, expect, it } from 'vitest';
import { legalSections } from '@/lib/legal';
import { ka } from '@/lib/i18n/ka';
import { en } from '@/lib/i18n/en';
import { ru } from '@/lib/i18n/ru';

const details = { company: 'ACME LLC', companyId: '400000000', legalAddress: 'Tbilisi, 1 Rustaveli Ave' };

describe('the legal pages', () => {
  it('fill the company details in and keep the numbered order', () => {
    const page = { s1Title: '1. A', s1Body: 'by {company}', s2Title: '2. B', s2Body: '{companyId} · {legalAddress}' };
    expect(legalSections(page, 2, details)).toEqual([
      { title: '1. A', body: 'by ACME LLC' },
      { title: '2. B', body: '400000000 · Tbilisi, 1 Rustaveli Ave' },
    ]);
  });

  it('skip a section a language does not have', () => {
    expect(legalSections({ s1Title: 'A', s1Body: 'a' }, 3, details)).toHaveLength(1);
  });

  it('have every section in all three languages: terms 10, privacy 7, refund 6', () => {
    for (const dict of [ka, en, ru]) {
      expect(legalSections(dict.pages.terms, 10, details)).toHaveLength(10);
      expect(legalSections(dict.pages.privacy, 7, details)).toHaveLength(7);
      expect(legalSections(dict.pages.refund, 6, details)).toHaveLength(6);
    }
  });

  it('name the company where the terms and the refund policy promise to', () => {
    for (const dict of [ka, en, ru]) {
      expect(legalSections(dict.pages.terms, 10, details).at(-1)?.body).toContain('ACME LLC');
      expect(legalSections(dict.pages.refund, 6, details).at(-1)?.body).toContain('400000000');
    }
  });
});
