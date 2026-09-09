import { z } from 'zod';

export const roomTypeEnum = z.enum([
  'living_room',
  'bedroom',
  'kitchen',
  'bathroom',
  'toilet',
  'hallway',
  'balcony',
  'storage',
  'office',
]);

export const roomInputSchema = z.object({
  type: roomTypeEnum,
  nameKa: z.string().min(1).max(255),
  width: z.coerce.number().positive().max(50),
  length: z.coerce.number().positive().max(50),
  height: z.coerce.number().positive().max(10),
});

export type RoomInput = z.infer<typeof roomInputSchema>;

export const homeStateEnum = z.enum(['black_frame', 'white_frame', 'green_frame']);

export const calculatorRequestSchema = z.object({
  homeState: homeStateEnum,
  rooms: z
    .array(
      z.object({
        id: z.string(),
        type: roomTypeEnum,
        nameKa: z.string(),
        width: z.number(),
        length: z.number(),
        height: z.number(),
        floorM2: z.number(),
        wallM2: z.number(),
        ceilingM2: z.number(),
        perimeterM: z.number(),
        isWetRoom: z.boolean(),
        x: z.number().optional(),
        z: z.number().optional(),
      })
    )
    .min(1),
});
