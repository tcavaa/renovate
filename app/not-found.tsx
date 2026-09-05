import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { NotFoundContent } from '@/components/layout/NotFoundContent';

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <NotFoundContent />
      </main>
      <Footer />
    </div>
  );
}
