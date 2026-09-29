import type { Metadata } from 'next';
import { ProjectHub, hubView } from '@/components/projects/hub/ProjectHub';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.hub.calculatorEyebrow, description: t.hub.calculatorLead };
}

/** The calculator's hub: the person's calculations and the way into a new one — or their renders and orders (`?view=`). */
export default async function CalculatorHubPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <ProjectHub journey="calculator" view={hubView(view)} />;
}
