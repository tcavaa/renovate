import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';

/** The calculator steps are client components; their metadata lives here. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.calculator.title, description: t.calculator.startSubtitle };
}

export default async function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
