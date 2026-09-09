import { z } from 'zod';

/**
 * Payload for `/api/design/parse-plan`.
 *
 * `imageUrl` names a file this app already stored — a local `/uploads/plans/…` path, the
 * bundled sample, or a bucket URL when `STORAGE_DRIVER=s3`. The route resolves it back to a
 * storage key it produced itself, so the pattern here is a first filter rather than the
 * security boundary.
 */
const LOCAL_PLAN = /^\/(uploads\/plans|samples)\/[\w.-]+\.(png|jpe?g|webp|gif)$/i;
const BUCKET_PLAN = /^https?:\/\/[^\s?#]+\/plans\/[\w.-]+\.(png|jpe?g|webp|gif)$/i;

export const parsePlanRequestSchema = z.object({
  imageUrl: z
    .string()
    .max(500)
    .refine((value) => LOCAL_PLAN.test(value) || BUCKET_PLAN.test(value), 'Must reference an uploaded plan image'),
  ceilingHeightM: z.coerce.number().min(1.8).max(6).optional(),
});

export type ParsePlanRequest = z.infer<typeof parsePlanRequestSchema>;
