import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';

/** The calculator steps are client components; their metadata lives here. */
export function generateMetadata(): Metadata {
  const t = getT();
  return { title: t.calculator.title, description: t.calculator.startSubtitle };
}

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
