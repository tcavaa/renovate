import { z } from 'zod';

/**
 * Payload for `/api/design/parse-plan`.
 *
 * `imageUrl` names a file this app already uploaded; the route rebuilds the path from its
 * basename rather than trusting it, so the pattern here is a first filter rather than the
 * security boundary.
 */
export const parsePlanRequestSchema = z.object({
  imageUrl: z
    .string()
    .regex(
      /^\/(uploads\/plans|samples)\/[\w.-]+\.(png|jpe?g|webp|gif)$/i,
      'Must reference an uploaded plan image'
    ),
  ceilingHeightM: z.coerce.number().min(1.8).max(6).optional(),
});

export type ParsePlanRequest = z.infer<typeof parsePlanRequestSchema>;
