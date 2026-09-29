import type { Dictionary } from '@/lib/i18n';
import { fill } from '@/lib/admin/list';
import type { RecordedFee } from '@/lib/finance/payments';
import { formatGEL, formatM2 } from '@/lib/utils';

/**
 * The fees a project paid, beside the title of its orders block — the customer's project page
 * and the admin's alike: each half's, paid at its hinge (or at checkout, before the fee moved
 * there). Nothing when there are none.
 */
export function FeeSummary({ fees, t }: { fees: RecordedFee[]; t: Dictionary }) {
  if (fees.length === 0) return null;
  return (
    <span className="text-right">
      {t.market.feeRecorded}:
      {fees.map((fee) => (
        <span key={fee.key} className="ml-2 inline-block">
          <span className="text-xs">{fee.kind === 'design' ? t.market.feeDesign : t.market.feeCalculator}</span> <span className="font-semibold text-ink">{formatGEL(fee.amount)}</span>
          <span className="ml-1 text-xs">({fill(t.market.platformFeeHint, { fee: formatGEL(fee.feePerM2), m2: formatM2(fee.totalM2) })})</span>
        </span>
      ))}
    </span>
  );
}
