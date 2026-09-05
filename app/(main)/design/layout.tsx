import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';

/** The design studio steps are client components; their metadata lives here. */
export function generateMetadata(): Metadata {
  const t = getT();
  return { title: t.design.title, description: t.design.subtitle };
}

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
