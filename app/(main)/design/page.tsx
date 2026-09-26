import type { Metadata } from 'next';
import { ProjectHub } from '@/components/projects/hub/ProjectHub';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.hub.designEyebrow, description: t.hub.designLead };
}

/** The 3D studio's hub: what it does, the person's designs, and the way into a new one. */
export default function DesignHubPage() {
  return <ProjectHub journey="design" />;
}
