import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';

/** The design studio steps are client components; their metadata lives here. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.design.title, description: t.design.subtitle };
}

export default async function DesignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
