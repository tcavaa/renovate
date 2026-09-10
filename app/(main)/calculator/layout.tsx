import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { CalculatorAutosave } from '@/components/calculator/CalculatorAutosave';

/** The calculator steps are client components; their metadata lives here. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.calculator.title, description: t.calculator.startSubtitle };
}

export default async function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* A signed-in user's work is written to their project as they go. */}
      <CalculatorAutosave />
      {children}
    </>
  );
}
