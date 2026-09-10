import { z } from 'zod';

/**
 * Self-registration of partners, and what a partner may edit about themselves.
 *
 * A store or worker who registers gets an account with the partner role and a store /
 * worker row that starts `pending` and inactive: invisible in the catalogue until admin
 * approves it. The fields here are the ones a person can sensibly fill in about their own
 * business; ratings, verification, commission and activation stay with admin.
 */
const account = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const urlOrEmpty = z.union([z.string().url().max(500), z.literal('')]).optional().nullable();

export const registerStoreSchema = account.extend({
  kind: z.literal('store'),
  storeName: z.string().min(2).max(255),
  phone: z.string().max(50).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  websiteUrl: urlOrEmpty,
  description: z.string().max(2000).optional().nullable(),
  deliveryDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  deliveryFeeGel: z.coerce.number().min(0).max(100000).optional().nullable(),
});

export const workerServiceSchema = z.object({
  specialty: z.string().min(2).max(255),
  specialtySlug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only'),
  priceUnit: z.enum(['m2', 'unit', 'fixed']),
  pricePerM2: z.coerce.number().nonnegative().optional().nullable(),
  pricePerUnit: z.coerce.number().nonnegative().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  experienceYears: z.coerce.number().int().min(0).max(80).optional().nullable(),
  bio: z.string().max(5000).optional().nullable(),
});

export const registerWorkerSchema = account.merge(workerServiceSchema).extend({
  kind: z.literal('worker'),
});

export const registerPartnerSchema = z.discriminatedUnion('kind', [registerStoreSchema, registerWorkerSchema]);

/** What a worker may change on their own card: the service, the price, the contact and the story. */
export const workerSelfSchema = workerServiceSchema.extend({
  nameKa: z.string().min(2).max(255),
  nameEn: z.string().max(255).optional().nullable(),
  nameRu: z.string().max(255).optional().nullable(),
  bioEn: z.string().max(5000).optional().nullable(),
  bioRu: z.string().max(5000).optional().nullable(),
  email: z.union([z.string().email().max(255), z.literal('')]).optional().nullable(),
  avatarUrl: z.union([z.string().url(), z.string().regex(/^\/[\w\-./]+$/), z.literal('')]).optional().nullable(),
});

export const approvalDecisionSchema = z.object({ decision: z.enum(['approved', 'rejected']) });

export type RegisterPartnerInput = z.infer<typeof registerPartnerSchema>;
export type WorkerSelfInput = z.infer<typeof workerSelfSchema>;
