import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getT, getLocale } from '@/lib/i18n/server';
import { buildProjectSummary } from '@/lib/calculator/materials';
import { loadRateBook } from '@/lib/api/rateBook';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { OpenIn3dButton } from '@/components/projects/OpenIn3dButton';
import { CalculateCostsButton } from '@/components/projects/CalculateCostsButton';
import { OrderProjectButton } from '@/components/projects/OrderProjectButton';
import { savedProjectInput } from '@/lib/projects/saved';
import { ProjectOrders } from '@/components/orders/ProjectOrders';
import { ProjectRenders } from '@/components/projects/ProjectRenders';
import { DeleteProjectButton } from '@/components/projects/DeleteProjectButton';
import type { Room, HomeState, SelectedProduct } from '@/lib/calculator/types';

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

  const selectedProducts = (project.selectedProducts ?? {}) as Record<string, SelectedProduct>;
  const selectedFurniture = (project.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>;

  // Priced with the current rate book, so this page agrees with the calculator.
  const summary = buildProjectSummary(
    (project.rooms ?? []) as Room[],
    project.homeState as HomeState,
    Object.values(selectedProducts),
    Object.values(selectedFurniture).flat(),
    await loadRateBook()
  );

  return (
    <ProjectDetail
      project={project}
      summary={summary}
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
      after={
        <>
          {project.plan != null && <ProjectRenders projectId={project.id} t={ka} locale={locale} />}
          <ProjectOrders projectId={project.id} t={ka} locale={locale} />
        </>
      }
    />
  );
}
