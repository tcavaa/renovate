import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { User } from 'lucide-react';
import { db } from '@/lib/db';
import { projects, users } from '@/lib/db/schema';
import { getT, getLocale } from '@/lib/i18n/server';
import { loadProjectSheets } from '@/lib/projects/sheets';
import { loadRateBook } from '@/lib/api/rateBook';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { ProjectRenders } from '@/components/projects/ProjectRenders';
import { ProjectOrders } from '@/components/orders/ProjectOrders';

export const dynamic = 'force-dynamic';

export default async function AdminProjectDetailPage(props: { params: Promise<{ id: string }> }) {
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
  const sheets = await loadProjectSheets(project, await loadRateBook(), ka, locale);

  return (
    <ProjectDetail
      project={project}
      sheets={sheets}
      t={ka}
      locale={locale}
      backHref="/admin/projects"
      backLabel={ka.admin.projectsList.backToAll}
      extraMeta={[
        {
          icon: User,
          label: ka.admin.table.user,
          value: userName ? `${userName} (${userEmail})` : ka.admin.guestUser,
        },
      ]}
      renders={project.plan != null ? <ProjectRenders projectId={project.id} t={ka} locale={locale} /> : undefined}
      orders={<ProjectOrders projectId={project.id} t={ka} locale={locale} orderHref={(id) => `/admin/orders/${id}`} />}
    />
  );
}
