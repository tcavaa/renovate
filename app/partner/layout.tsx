import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { canOpenPartnerPortal } from '@/lib/auth/roles';
import { getT } from '@/lib/i18n/server';
import { loadPartnerContext } from '@/lib/partner/context';
import { partnerStats } from '@/lib/finance/orders';
import { PartnerSidebar } from '@/components/partner/PartnerSidebar';

export const metadata = { title: 'Partner' };

/**
 * The partner portal: a store's or a worker's own view of the marketplace — their orders,
 * their share, nothing else. The proxy has already turned away everyone without a partner
 * role; this layout checks again server-side and resolves the partner.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const t = await getT();
  if (!session?.user) redirect('/login?callbackUrl=/partner');
  if (!canOpenPartnerPortal(session.user.role)) redirect('/');

  // The layout cannot read search params, so admin's preview target is resolved by each
  // page; the sidebar shows the account's own link, or the admin placeholder.
  const ctx = await loadPartnerContext();
  const stats = ctx?.type ? await partnerStats(ctx.ref) : null;

  return (
    <div className="flex min-h-screen bg-bg-base">
      <PartnerSidebar partnerName={ctx?.name ?? null} partnerType={ctx?.type ?? null} unread={stats?.unread ?? 0} />
      <main className="min-w-0 flex-1 overflow-x-auto p-6 md:p-8">
        {ctx && !ctx.type && !ctx.isAdmin ? (
          <div className="mx-auto mt-16 max-w-md border border-line bg-bg-surface p-8 text-center">
            <h1 className="font-serif text-xl font-semibold">{t.partner.notLinkedTitle}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t.partner.notLinkedDesc}</p>
          </div>
        ) : (
          <>
            {/* A self-registered partner sees where their application stands. */}
            {ctx?.approvalStatus === 'pending' && (
              <div className="mb-6 border border-warning/50 bg-warning/5 px-5 py-4">
                <p className="font-serif text-base font-semibold text-ink">{t.partner.pendingTitle}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.partner.pendingDesc}</p>
              </div>
            )}
            {ctx?.approvalStatus === 'rejected' && (
              <div className="mb-6 border border-danger/40 bg-danger/5 px-5 py-4">
                <p className="font-serif text-base font-semibold text-ink">{t.partner.rejectedTitle}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.partner.rejectedDesc}</p>
              </div>
            )}
            {children}
          </>
        )}
      </main>
    </div>
  );
}
