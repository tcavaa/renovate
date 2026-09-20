/* eslint-disable no-console */
/**
 * Brigades, built out of the workers that are already seeded.
 *
 *   pnpm db:seed:teams
 *
 * A brigade is the unit a Georgian renovation is actually hired as — a foreman and the
 * trades under him — so each of these is assembled to cover a real job: one full-service
 * team that can take a flat from bare concrete, one finishing team, one that does the wet
 * rooms. The trades a team covers are never typed in; they are read off its members, so a
 * team here is only as good as the workers the seed found. A team with a `team` login is
 * created too, so the portal has someone to sign in as (`TEAM_PASSWORD`, or generated and
 * printed once).
 */
import './lib/loadEnv';

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { teamMembers, teams, users, workers } from '../lib/db/schema';
import { slugify } from '../lib/utils';

interface Plan {
  nameKa: string;
  nameEn: string;
  nameRu: string;
  leadName: string;
  city: string;
  descriptionKa: string;
  markupPct: number | null;
  experienceYears: number;
  completedJobs: number;
  /** The trades this brigade is meant to cover, best-effort from the workers that exist. */
  trades: string[];
}

const PLANS: Plan[] = [
  {
    nameKa: 'ბრიგადა „ალიანსი“',
    nameEn: 'Alliance brigade',
    nameRu: 'Бригада «Альянс»',
    leadName: 'გიორგი ბერიძე',
    city: 'თბილისი',
    descriptionKa: 'სრული ციკლი — შავი კარკასიდან ჩაბარებამდე. ერთი ხელშეკრულება, ერთი ბრიგადირი, ყველა მიმართულება.',
    markupPct: 8,
    experienceYears: 12,
    completedJobs: 84,
    trades: ['plastering', 'tiling', 'electrical', 'plumbing', 'painting', 'carpentry'],
  },
  {
    nameKa: 'ბრიგადა „ფინიში“',
    nameEn: 'Finish brigade',
    nameRu: 'Бригада «Финиш»',
    leadName: 'ლევან კაპანაძე',
    city: 'თბილისი',
    descriptionKa: 'თეთრი კარკასიდან — შპაკლი, საღებავი, იატაკი, პლინტუსი, კარები. სუფთა სამუშაო, მკაცრი ვადები.',
    markupPct: 5,
    experienceYears: 8,
    completedJobs: 51,
    trades: ['plastering', 'painting', 'carpentry'],
  },
  {
    nameKa: 'ბრიგადა „სველი წერტილი“',
    nameEn: 'Wet rooms brigade',
    nameRu: 'Бригада «Мокрые зоны»',
    leadName: 'დავით წიკლაური',
    city: 'ბათუმი',
    descriptionKa: 'სააბაზანო და სამზარეულო — ჰიდროიზოლაცია, კაფელი, სანტექნიკა, ელექტრო. მხოლოდ სველი წერტილები.',
    markupPct: null,
    experienceYears: 10,
    completedJobs: 39,
    trades: ['tiling', 'plumbing', 'electrical'],
  },
];

async function main() {
  const all = await db.select({ id: workers.id, nameKa: workers.nameKa, specialtySlug: workers.specialtySlug }).from(workers).where(eq(workers.isActive, true));
  if (all.length === 0) {
    console.log('No workers — run `pnpm db:seed` and `pnpm db:seed:workers` first.');
    return;
  }
  const byTrade = new Map<string, Array<{ id: number; nameKa: string }>>();
  for (const w of all) {
    const list = byTrade.get(w.specialtySlug) ?? [];
    list.push(w);
    byTrade.set(w.specialtySlug, list);
  }
  // Each brigade takes a different worker per trade where it can, so the three teams are
  // three sets of people rather than the same names three times over.
  const taken = new Set<number>();

  const password = process.env.TEAM_PASSWORD || randomBytes(6).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);
  let created = 0;

  for (const plan of PLANS) {
    const slug = slugify(plan.nameEn);
    const [existing] = await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, slug)).limit(1);
    const members = plan.trades
      .map((trade) => (byTrade.get(trade) ?? []).find((w) => !taken.has(w.id)) ?? (byTrade.get(trade) ?? [])[0])
      .filter((w): w is { id: number; nameKa: string } => !!w);
    for (const m of members) taken.add(m.id);

    const values = {
      nameKa: plan.nameKa,
      nameEn: plan.nameEn,
      nameRu: plan.nameRu,
      slug,
      descriptionKa: plan.descriptionKa,
      leadName: plan.leadName,
      phone: '+995 555 00 00 00',
      email: `${slug}@remonti.ge`,
      city: plan.city,
      experienceYears: plan.experienceYears,
      completedJobs: plan.completedJobs,
      markupPct: plan.markupPct == null ? null : String(plan.markupPct),
      isVerified: true,
      approvalStatus: 'approved' as const,
      isActive: true,
    };

    let teamId: number;
    if (existing) {
      await db.update(teams).set(values).where(eq(teams.id, existing.id));
      teamId = existing.id;
    } else {
      const [row] = await db.insert(teams).values(values);
      teamId = Number(row.insertId);
      created += 1;
    }

    await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
    if (members.length > 0) {
      await db.insert(teamMembers).values(members.map((m, i) => ({ teamId, workerId: m.id, isLead: i === 0, sortOrder: i })));
    }

    const email = `${slug}@remonti.ge`;
    const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (!account) {
      await db.insert(users).values({ name: plan.leadName, email, passwordHash, role: 'team', teamId });
      console.log(`  login ${email} / ${password}`);
    } else {
      await db.update(users).set({ role: 'team', teamId }).where(eq(users.id, account.id));
    }

    console.log(`${plan.nameKa}: ${members.length} workers (${[...new Set(members.map((m) => all.find((w) => w.id === m.id)?.specialtySlug))].join(', ')})`);
  }

  console.log(`\n${PLANS.length} brigades, ${created} new.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
