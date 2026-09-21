/**
 * Reading the brigades.
 *
 * A team is hired as a unit, so the question a customer actually asks is "who can do all of
 * this?" — not "who tiles?". These queries answer it: a team carries the trades of the
 * workers in it, and a project's labour lines say which trades it needs, so the directory
 * can put the teams that cover a job in front of the ones that cover half of it.
 */

import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, teamMembers, teams, workers, type Team } from '@/lib/db/schema';

export interface TeamMemberRow {
  teamId: number;
  workerId: number;
  isLead: boolean;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  specialty: string;
  specialtySlug: string;
  avatarUrl: string | null;
  rating: string | null;
  experienceYears: number | null;
}

export interface TeamWithMembers {
  team: Team;
  members: TeamMemberRow[];
  /** The trades this team covers, deduplicated, in the order its members are listed. */
  trades: string[];
}

/** One team by id or slug, with the workers in it. Inactive teams are not served publicly. */
export async function loadTeam(key: number | string, options: { includeInactive?: boolean } = {}): Promise<TeamWithMembers | null> {
  const match = typeof key === 'number' ? eq(teams.id, key) : eq(teams.slug, key);
  const [team] = await db
    .select()
    .from(teams)
    .where(options.includeInactive ? match : and(match, eq(teams.isActive, true)))
    .limit(1);
  if (!team) return null;
  const members = (await membersOf([team.id])).get(team.id) ?? [];
  return { team, members, trades: tradesOf(members) };
}

/** The members of several teams at once, so a list is two queries and not one per row. */
export async function membersOf(teamIds: number[]): Promise<Map<number, TeamMemberRow[]>> {
  const out = new Map<number, TeamMemberRow[]>();
  if (teamIds.length === 0) return out;
  const rows = await db
    .select({
      teamId: teamMembers.teamId,
      workerId: teamMembers.workerId,
      isLead: teamMembers.isLead,
      nameKa: workers.nameKa,
      nameEn: workers.nameEn,
      nameRu: workers.nameRu,
      specialty: workers.specialty,
      specialtySlug: workers.specialtySlug,
      avatarUrl: workers.avatarUrl,
      rating: workers.rating,
      experienceYears: workers.experienceYears,
    })
    .from(teamMembers)
    .innerJoin(workers, eq(workers.id, teamMembers.workerId))
    .where(inArray(teamMembers.teamId, teamIds))
    .orderBy(desc(teamMembers.isLead), asc(teamMembers.sortOrder));
  for (const row of rows) {
    const list = out.get(row.teamId) ?? [];
    list.push(row);
    out.set(row.teamId, list);
  }
  return out;
}

export function tradesOf(members: TeamMemberRow[]): string[] {
  return [...new Set(members.map((m) => m.specialtySlug))];
}

export interface TeamListFilters {
  city?: string | null;
  search?: string | null;
  /** The trades a job needs; teams that cover more of them come first. */
  covers?: string[];
  verifiedOnly?: boolean;
  includeInactive?: boolean;
  limit?: number;
}

export interface TeamListRow extends TeamWithMembers {
  /** How many of the asked-for trades this team covers, when any were asked for. */
  covered: number;
  /** Jobs the brigade has on its hands right now: orders it has not finished or turned down. */
  openJobs: number;
  /** False when that is as many as it says it can run at once (`capacityJobs`). */
  available: boolean;
}

/** The order statuses that keep a brigade busy. */
const OPEN_STATUSES = ['new', 'confirmed', 'in_progress'] as const;

/** How many jobs each of these teams has open. */
export async function openJobsOf(teamIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (teamIds.length === 0) return out;
  // Joined and grouped rather than a correlated count: Drizzle emits those uncorrelated.
  const rows = await db
    .select({ teamId: orders.teamId, n: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.partnerType, 'team'), inArray(orders.teamId, teamIds), inArray(orders.status, [...OPEN_STATUSES])))
    .groupBy(orders.teamId);
  for (const row of rows) if (row.teamId != null) out.set(row.teamId, Number(row.n));
  return out;
}

/**
 * The directory. When trades are asked for, the teams that cover them all come first, then
 * the ones that cover most — a brigade missing the electrician is still worth showing, with
 * the gap visible, rather than hidden.
 */
export async function listTeams(filters: TeamListFilters = {}): Promise<TeamListRow[]> {
  const where = [];
  if (!filters.includeInactive) where.push(eq(teams.isActive, true));
  if (filters.city) where.push(eq(teams.city, filters.city));
  if (filters.verifiedOnly) where.push(eq(teams.isVerified, true));
  if (filters.search) {
    const q = `%${filters.search}%`;
    where.push(or(like(teams.nameKa, q), like(teams.nameEn, q), like(teams.leadName, q), like(teams.city, q)));
  }
  const rows = await db
    .select()
    .from(teams)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(teams.isVerified), desc(teams.rating), asc(teams.nameKa))
    .limit(filters.limit ?? 60);

  const members = await membersOf(rows.map((r) => r.id));
  const open = await openJobsOf(rows.map((r) => r.id));
  const wanted = filters.covers ?? [];
  const list: TeamListRow[] = rows.map((team) => {
    const own = members.get(team.id) ?? [];
    const trades = tradesOf(own);
    const openJobs = open.get(team.id) ?? 0;
    return { team, members: own, trades, covered: wanted.filter((slug) => trades.includes(slug)).length, openJobs, available: team.capacityJobs == null || openJobs < team.capacityJobs };
  });
  // A brigade that can start comes before one that cannot, whatever it covers; among those,
  // the ones that cover more of the job. The sort is stable, so rating still breaks ties.
  return list.sort((a, b) => Number(b.available) - Number(a.available) || (wanted.length > 0 ? b.covered - a.covered : 0));
}

/** The cities teams work in, for the directory's sidebar. */
export async function teamCities(): Promise<string[]> {
  const rows = await db
    .select({ city: teams.city, n: sql<number>`count(*)` })
    .from(teams)
    .where(eq(teams.isActive, true))
    .groupBy(teams.city)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => r.city).filter((c): c is string => !!c);
}
