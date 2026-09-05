import { getT } from '@/lib/i18n/server';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata = { title: 'Privacy — RenovateGE' };

export default function PrivacyPage() {
  const ka = getT();
  const p = ka.pages.privacy;
  const sections = [
    { title: p.s1Title, body: p.s1Body },
    { title: p.s2Title, body: p.s2Body },
    { title: p.s3Title, body: p.s3Body },
    { title: p.s4Title, body: p.s4Body },
    { title: p.s5Title, body: p.s5Body },
    { title: p.s6Title, body: p.s6Body },
  ];

  return (
    <LegalPage
      title={p.title}
      subtitle={p.subtitle}
      lastUpdatedLabel={p.lastUpdated}
      lastUpdatedValue={p.lastUpdatedValue}
      sections={sections}
    />
  );
}
