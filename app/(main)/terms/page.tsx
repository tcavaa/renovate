import { getT } from '@/lib/i18n/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { companyDetails, legalSections } from '@/lib/legal';

export const metadata = { title: 'Terms — RenovateGE' };

export default async function TermsPage() {
  const ka = await getT();
  const t = ka.pages.terms;
  return (
    <LegalPage
      title={t.title}
      subtitle={t.subtitle}
      lastUpdatedLabel={t.lastUpdated}
      lastUpdatedValue={t.lastUpdatedValue}
      sections={legalSections(t, 10, companyDetails(ka))}
    />
  );
}
