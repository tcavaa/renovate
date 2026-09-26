import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';

/** The calculator's hub and its steps; the steps' own layout opens the project (`[id]/layout.tsx`). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.calculator.title, description: t.calculator.startSubtitle };
}

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
