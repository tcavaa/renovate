import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, count, eq, isNull, notInArray } from 'drizzle-orm';
import { Send, User } from 'lucide-react';
import { db } from '@/lib/db';
import { orders, projects, users } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { getT, getLocale } from '@/lib/i18n/server';
import { loadProjectSheets } from '@/lib/projects/sheets';
import { loadRateBook } from '@/lib/api/rateBook';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { AdminCrumbs } from '@/components/admin/AdminCrumbs';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { ProjectRenders } from '@/components/projects/ProjectRenders';
import { ProjectOrdersReview } from '@/components/orders/ProjectOrdersReview';
import { requireAdminPage } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export default async function AdminProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireAdminPage('projects');
  const params = await props.params;
  const ka = await getT();
  const locale = await getLocale();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select({ project: projects, userName: users.name, userEmail: users.email })
    .from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(eq(projects.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();
  const { project, userName, userEmail } = row;

  // The customer's two sheets as they left them, with what was worked out beside every edit.
  const [sheets, [awaiting]] = await Promise.all([
    loadProjectSheets(project, await loadRateBook(), ka, locale),
    // The store orders still waiting for the platform: the agent's reason to be on this page.
    db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.projectId, project.id), eq(orders.partnerType, 'store'), isNull(orders.sentAt), notInArray(orders.status, ['cancelled', 'done']))),
  ]);
  const waiting = Number(awaiting?.n ?? 0);

  return (
    <ProjectDetail
      project={project}
      sheets={sheets}
      t={ka}
      locale={locale}
      crumbs={<AdminCrumbs trail={[sectionCrumb(ka, 'projects'), { label: project.nameKa ?? `#${project.id}` }]} />}
      actions={
        waiting > 0 ? (
          <Button asChild variant="ink">
            <Link href="#orders">
              <Send className="h-4 w-4" />
              {ka.orderReview.queueTitle}: {waiting}
            </Link>
          </Button>
        ) : undefined
      }
      extraMeta={[
        {
          icon: User,
          label: ka.admin.table.user,
          value: userName ? `${userName} (${userEmail})` : ka.admin.guestUser,
        },
      ]}
      renders={project.plan != null ? <ProjectRenders projectId={project.id} t={ka} locale={locale} /> : undefined}
      orders={<ProjectOrdersReview projectId={project.id} t={ka} locale={locale} />}
    />
  );
}
