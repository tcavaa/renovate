import type { Metadata } from 'next';
import { ProjectHub } from '@/components/projects/hub/ProjectHub';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.hub.calculatorEyebrow, description: t.hub.calculatorLead };
}

/** The calculator's hub: what it does, the person's calculations, and the way into a new one. */
export default function CalculatorHubPage() {
  return <ProjectHub journey="calculator" />;
}
