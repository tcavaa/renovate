import { z } from 'zod';

const imageUrlField = z
  .union([
    z.string().url(),
    z.string().regex(/^\/[\w\-./]+$/, 'Must be an absolute URL or root-relative path'),
    z.literal(''),
  ])
  .optional()
  .nullable();

export const workerSchema = z.object({
  nameKa: z.string().min(2).max(255),
  nameEn: z.string().max(255).optional().nullable(),
  nameRu: z.string().max(255).optional().nullable(),
  specialty: z.string().min(2).max(255),
  specialtySlug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only'),
  phone: z.string().max(50).optional().nullable(),
  pricePerM2: z.coerce.number().nonnegative().optional().nullable(),
  pricePerUnit: z.coerce.number().nonnegative().optional().nullable(),
  priceUnit: z.enum(['m2', 'unit', 'fixed']),
  rating: z.coerce.number().min(0).max(5).optional(),
  reviewCount: z.coerce.number().int().min(0).optional(),
  bio: z.string().max(5000).optional().nullable(),
  bioEn: z.string().max(5000).optional().nullable(),
  bioRu: z.string().max(5000).optional().nullable(),
  avatarUrl: imageUrlField,
  isVerified: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type WorkerInput = z.infer<typeof workerSchema>;
