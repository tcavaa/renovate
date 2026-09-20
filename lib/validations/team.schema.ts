import { z } from 'zod';

/**
 * A brigade as the admin form sends it. The members are worker ids in the order they should
 * be listed, and the lead is one of them — the foreman the customer rings.
 */
export const teamSchema = z.object({
  nameKa: z.string().trim().min(1).max(255),
  nameEn: z.string().trim().max(255).nullable().optional(),
  nameRu: z.string().trim().max(255).nullable().optional(),
  slug: z.string().trim().max(255).optional().default(''),
  descriptionKa: z.string().trim().max(4000).nullable().optional(),
  descriptionEn: z.string().trim().max(4000).nullable().optional(),
  descriptionRu: z.string().trim().max(4000).nullable().optional(),
  leadName: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal('').transform(() => null)),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  experienceYears: z.coerce.number().int().min(0).max(80).nullable().optional(),
  completedJobs: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  markupPct: z.coerce.number().min(0).max(100).nullable().optional(),
  commissionRate: z.coerce.number().min(0).max(100).nullable().optional(),
  capacityJobs: z.coerce.number().int().min(0).max(100).nullable().optional(),
  isVerified: z.boolean().optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  isActive: z.boolean().optional(),
  memberIds: z.array(z.number().int().positive()).max(40).default([]),
  leadWorkerId: z.number().int().positive().nullable().optional(),
});

export type TeamInput = z.infer<typeof teamSchema>;

/**
 * The form's values as the row wants them. Drizzle reads and writes MySQL decimals as
 * strings (see CLAUDE.md), so the percentages go in as text however they arrived.
 */
export function teamRow(input: Omit<TeamInput, 'memberIds' | 'leadWorkerId'>, slug: string) {
  const decimal = (v: number | null | undefined) => (v == null ? null : String(v));
  return {
    ...input,
    slug,
    markupPct: decimal(input.markupPct),
    commissionRate: decimal(input.commissionRate),
  };
}
