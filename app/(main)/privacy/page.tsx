import { getT } from '@/lib/i18n/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { companyDetails, legalSections } from '@/lib/legal';

export const metadata = { title: 'Privacy — RenovateGE' };

export default async function PrivacyPage() {
  const ka = await getT();
  const p = ka.pages.privacy;
  return (
    <LegalPage
      title={p.title}
      subtitle={p.subtitle}
      lastUpdatedLabel={p.lastUpdated}
      lastUpdatedValue={p.lastUpdatedValue}
      sections={legalSections(p, 7, companyDetails(ka))}
    />
  );
}
