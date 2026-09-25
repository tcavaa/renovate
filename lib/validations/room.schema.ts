import { z } from 'zod';
import { HOME_STATE_VALUES } from '@/lib/calculator/types';

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
  'closet',
  'studio',
]);

/** A studio's dividing line and its two parts (`RoomSplit`). */
export const roomSplitSchema = z.object({
  axis: z.enum(['x', 'z']),
  t: z.number().min(0).max(1),
  parts: z.tuple([roomTypeEnum, roomTypeEnum]),
});

export const roomPartSchema = z.object({
  type: roomTypeEnum,
  floorM2: z.number().min(0),
  wallM2: z.number().min(0),
  perimeterM: z.number().min(0),
});

export const roomInputSchema = z.object({
  type: roomTypeEnum,
  nameKa: z.string().min(1).max(255),
  width: z.coerce.number().positive().max(50),
  length: z.coerce.number().positive().max(50),
  height: z.coerce.number().positive().max(10),
});

export type RoomInput = z.infer<typeof roomInputSchema>;

export const homeStateEnum = z.enum(HOME_STATE_VALUES);

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
        split: roomSplitSchema.optional(),
        parts: z.array(roomPartSchema).max(2).optional(),
      })
    )
    .min(1),
});
