import { z } from 'zod';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import { isProductKind } from '@/lib/catalog/kinds';

export const calculationTypeEnum = z.enum([
  'per_m2_floor',
  'per_m2_wall',
  'per_m2_ceiling',
  'per_linear_m',
  'per_unit',
  'per_room',
  'fixed',
]);

const slugSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only');

/**
 * A category of the tree. Its place among its siblings is not part of it: a new one goes
 * last, and the admin's arrows move it (`categoryReorderSchema`).
 */
export const categorySchema = z.object({
  /** The category above; null or absent at the top (`moveError` in `lib/catalog/tree.ts` says where it may go). */
  parentId: z.number().int().positive().nullable().optional(),
  nameKa: z.string().min(1).max(255),
  nameEn: z.string().min(1).max(255),
  nameRu: z.string().max(255).optional().nullable(),
  slug: slugSchema,
  /** A lucide icon's kebab name ('door-open') or one of the studio's own; picked in `IconPicker`. */
  icon: z.string().max(100).optional().nullable(),
  calculationType: calculationTypeEnum,
  /** Shown on the site's catalogue. */
  isVisible: z.boolean().default(true),
  isFurniture: z.boolean().default(false),
  /** Offered as a tab in the calculator. */
  inCalculator: z.boolean().default(false),
  /** The 3D kind whose products belong here. */
  model3dKind: z
    .string()
    .max(64)
    .nullable()
    .optional()
    .refine((v) => v == null || v === '' || isProductKind(v), 'Unknown 3D kind')
    .transform((v) => (v ? v : null)),
  /** The studio rooms that list it (each keeps its own order; one newly added puts it last). */
  shelfRoomIds: z.array(z.number().int().positive()).max(50).optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

/** A parent's children in their new order: every child, each once. */
export const categoryReorderSchema = z.object({
  parentId: z.number().int().positive().nullable(),
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

const ROOM_TYPE_VALUES = Object.keys(ROOM_TYPES) as [RoomType, ...RoomType[]];

/** One of the studio's rooms: its names, icon, the plan's room types it is for, and the categories it lists in order. */
export const shelfRoomSchema = z.object({
  slug: slugSchema.max(100),
  nameKa: z.string().min(1).max(255),
  nameEn: z.string().min(1).max(255),
  nameRu: z.string().max(255).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  roomTypes: z.array(z.enum(ROOM_TYPE_VALUES)).max(ROOM_TYPE_VALUES.length).default([]),
  isVisible: z.boolean().default(true),
  categoryIds: z.array(z.number().int().positive()).max(100).default([]),
});

export type ShelfRoomInput = z.infer<typeof shelfRoomSchema>;

/** The studio's rooms in their new order: every room, each once. */
export const shelfRoomReorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});
