import { getT } from '@/lib/i18n/server';
import { LegalPage } from '@/components/legal/LegalPage';
import { companyDetails, legalSections } from '@/lib/legal';

export const metadata = { title: 'Refund policy — RenovateGE' };

/** When a card payment for the platform's own services is returned, and how (docs/payments.md). */
export default async function RefundPage() {
  const ka = await getT();
  const r = ka.pages.refund;
  return (
    <LegalPage
      title={r.title}
      subtitle={r.subtitle}
      lastUpdatedLabel={r.lastUpdated}
      lastUpdatedValue={r.lastUpdatedValue}
      sections={legalSections(r, 6, companyDetails(ka))}
    />
  );
}
