import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, projects } from '@/lib/db/schema';

/**
 * The projects a brigade may look at: the ones it holds a booking for — sent to it, and not
 * turned down or cancelled. A brigade does the whole job, so it sees everything about that flat
 * (the plan, the 3D model, both budgets, the photos, the customer), in view mode only; a
 * booking it turned down takes the project away again.
 */
function bookingsOf(teamId: number) {
  return and(eq(orders.partnerType, 'team'), eq(orders.teamId, teamId), isNotNull(orders.projectId), isNotNull(orders.sentAt), ne(orders.status, 'cancelled'))!;
}

export async function teamMaySeeProject(teamId: number, projectId: number): Promise<boolean> {
  const rows = await db.select({ id: orders.id }).from(orders).where(and(bookingsOf(teamId), eq(orders.projectId, projectId))).limit(1);
  return rows.length > 0;
}

export interface TeamProjectBooking {
  orderId: number;
  projectId: number;
  projectName: string | null;
  totalM2: string | null;
  homeState: string | null;
  status: 'new' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
  partnerType: 'store' | 'worker' | 'team';
  sentAt: Date | null;
  subtotal: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerNote: string | null;
}

/** A brigade's bookings with their projects, newest first — one project, or all of them. */
export async function teamProjectBookings(teamId: number, projectId?: number): Promise<TeamProjectBooking[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      projectId: orders.projectId,
      projectName: projects.nameKa,
      totalM2: projects.totalM2,
      homeState: projects.homeState,
      status: orders.status,
      partnerType: orders.partnerType,
      sentAt: orders.sentAt,
      subtotal: orders.subtotal,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      customerEmail: orders.customerEmail,
      customerNote: orders.customerNote,
    })
    .from(orders)
    .innerJoin(projects, eq(orders.projectId, projects.id))
    .where(projectId ? and(bookingsOf(teamId), eq(orders.projectId, projectId)) : bookingsOf(teamId))
    .orderBy(desc(orders.sentAt), desc(orders.id));
  return rows.map((r) => ({ ...r, projectId: Number(r.projectId) }));
}
