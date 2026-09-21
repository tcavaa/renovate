import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getT, getLocale } from '@/lib/i18n/server';
import { loadProjectSheets } from '@/lib/projects/sheets';
import { loadRateBook } from '@/lib/api/rateBook';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { OpenIn3dButton } from '@/components/projects/OpenIn3dButton';
import { CalculateCostsButton } from '@/components/projects/CalculateCostsButton';
import { OrderProjectButton } from '@/components/projects/OrderProjectButton';
import { savedProjectInput } from '@/lib/projects/saved';
import { ProjectOrders } from '@/components/orders/ProjectOrders';
import { ProjectRenders } from '@/components/projects/ProjectRenders';
import { DeleteProjectButton } from '@/components/projects/DeleteProjectButton';

export const dynamic = 'force-dynamic';

export default async function UserProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  const ka = await getT();
  const locale = await getLocale();
  const userId = Number(session!.user.id);
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  const project = rows[0];
  if (!project) notFound();

  // Both journeys' sheets, priced with the current rate book so this page agrees with the
  // summaries — as they were left, and as they were worked out before anything was edited.
  const sheets = await loadProjectSheets(project, await loadRateBook(), ka, locale);

  return (
    <ProjectDetail
      project={project}
      sheets={sheets}
      t={ka}
      locale={locale}
      backHref="/profile"
      backLabel={ka.profile.backToProjects}
      actions={
        <>
          <CalculateCostsButton project={savedProjectInput(project)} size="lg" />
          <OpenIn3dButton project={savedProjectInput(project)} size="lg" />
          <OrderProjectButton project={savedProjectInput(project)} />
          {project.status !== 'submitted' && <DeleteProjectButton projectId={project.id} size="default" afterHref="/profile" />}
        </>
      }
      renders={project.plan != null ? <ProjectRenders projectId={project.id} t={ka} locale={locale} /> : undefined}
      orders={<ProjectOrders projectId={project.id} t={ka} locale={locale} />}
    />
  );
}
