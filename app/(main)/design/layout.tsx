import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { DesignAutosave } from '@/components/design/DesignAutosave';

/** The design studio steps are client components; their metadata lives here. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.design.title, description: t.design.subtitle };
}

export default async function DesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* A signed-in user's design is written to their project as they go. */}
      <DesignAutosave />
      {children}
    </>
  );
}
