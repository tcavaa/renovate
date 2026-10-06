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
        id: z.string().max(64),
        type: roomTypeEnum,
        nameKa: z.string().max(255),
        // Never negative, never absurd: the fee is charged on the floors' sum (S16 in the audit
        // checklist — a negative `floorM2` once lowered it).
        width: z.number().min(0).max(100),
        length: z.number().min(0).max(100),
        height: z.number().min(0).max(20),
        floorM2: z.number().min(0).max(2000),
        wallM2: z.number().min(0).max(5000),
        ceilingM2: z.number().min(0).max(2000),
        perimeterM: z.number().min(0).max(1000),
        isWetRoom: z.boolean(),
        x: z.number().optional(),
        z: z.number().optional(),
        split: roomSplitSchema.optional(),
        parts: z.array(roomPartSchema).max(2).optional(),
        /** Each wall's length off the board (`Room.walls`), what a wall chosen on its own is counted by. */
        walls: z.array(z.number().min(0).max(100)).max(64).optional(),
        /** Each of those walls as the estimate counts it, m² — less its doors and windows (`Room.wallsM2`). */
        wallsM2: z.array(z.number().min(0).max(1000)).max(64).optional(),
      })
    )
    .min(1)
    .max(80),
});
