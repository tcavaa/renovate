import { getT } from '@/lib/i18n/server';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata = { title: 'Terms — RenovateGE' };

export default async function TermsPage() {
  const ka = await getT();
  const t = ka.pages.terms;
  const sections = [
    { title: t.s1Title, body: t.s1Body },
    { title: t.s2Title, body: t.s2Body },
    { title: t.s3Title, body: t.s3Body },
    { title: t.s4Title, body: t.s4Body },
    { title: t.s5Title, body: t.s5Body },
    { title: t.s6Title, body: t.s6Body },
    { title: t.s7Title, body: t.s7Body },
  ];

  return (
    <LegalPage
      title={t.title}
      subtitle={t.subtitle}
      lastUpdatedLabel={t.lastUpdated}
      lastUpdatedValue={t.lastUpdatedValue}
      sections={sections}
    />
  );
}
