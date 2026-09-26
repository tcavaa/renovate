import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';

/** The design's hub and its steps; the steps' own layout opens the project (`[id]/layout.tsx`). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.design.title, description: t.design.subtitle };
}

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
