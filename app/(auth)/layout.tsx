import Link from 'next/link';
import { Hammer } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const ka = getT();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-bg-surface">
        <div className="container flex h-16 items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white">
              <Hammer className="h-5 w-5" />
            </span>
            <span className="font-serif text-lg font-bold">{ka.app.name}</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center bg-bg-base px-4 py-12">
        {children}
      </main>
    </div>
  );
}
