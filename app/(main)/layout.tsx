import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { UpgradeHost } from '@/components/plans/UpgradeHost';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    // `site-shell`: a step that is a workspace turns this into the whole window (app/globals.css).
    <div className="site-shell flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      {/* The upgrade dialogue every locked feature opens (docs/subscriptions.md). */}
      <UpgradeHost />
    </div>
  );
}
