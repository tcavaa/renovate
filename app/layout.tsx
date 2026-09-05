import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale, getT } from '@/lib/i18n/server';

export function generateMetadata(): Metadata {
  const t = getT();
  return {
    title: {
      default: `${t.app.name} — ${t.app.tagline}`,
      template: `%s · ${t.app.name}`,
    },
    description: t.app.description,
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    ),
    openGraph: {
      title: `${t.app.name} — ${t.app.tagline}`,
      description: t.app.description,
      type: 'website',
    },
    icons: {
      icon: '/favicon.ico',
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>
          <SessionProvider>{children}</SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
