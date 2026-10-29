/**
 * The roller blinds the studio hangs over a window (the owner's notes: Modern and Industrial
 * windows, and every kitchen's and bathroom's whatever the style — `windowDressing` in
 * lib/design/rules.ts), as catalogue products.
 *
 * Each is one model written in code (`pnpm models:blinds`, scripts/blind-models.ts): a cassette,
 * the cloth let down and its weighted bar, in the blind's colours. The studio sizes it to its
 * window — the curtain's slot — so one product fits every window, and it is sold by the piece,
 * made to the window's measure and fitted.
 *
 * They reach a database two ways, which must say the same (tests/unit/catalog/blindMigration.test.ts):
 * `pnpm models:seed` and the insert-only migration a deploy runs (`0013_roller_blinds.sql`).
 * Prices are ours and fictional, like the rest of the seeded catalogue.
 */

import type { StyleId } from '../../lib/design/types';

export interface BlindProduct {
  slug: string;
  /** The cloth's colour, sRGB. */
  fabric: string;
  /** The cassette's and the bar's colour, sRGB, and how metallic they look. */
  frame: string;
  frameMetallic: number;
  priceGel: number;
  storeSlug: string;
  /** The store as the migration finds it, by its Georgian name. */
  storeNameKa: string;
  styles: StyleId[];
  nameKa: string;
  nameEn: string;
  nameRu: string;
  descriptionKa: string;
}

/** The blinds' category: under decor, beside the curtains, of the `blind` 3D kind. */
export const BLIND_CATEGORY = 'roller-blinds';

const STORE = { storeSlug: 'textil-plus', storeNameKa: 'ტექსტილ+ ხალიჩები' } as const;
const MADE_TO_MEASURE = 'ფანჯრის ზომაზე დამზადებული, კასეტით და მონტაჟით.';

export const BLIND_PRODUCTS: BlindProduct[] = [
  {
    slug: 'roller-blind-white',
    fabric: '#efede6',
    frame: '#f4f4f1',
    frameMetallic: 0.1,
    priceGel: 160,
    ...STORE,
    styles: ['modern', 'scandinavian'],
    nameKa: 'რულონური ფარდა — თეთრი',
    nameEn: 'Roller blind — white',
    nameRu: 'Рулонная штора — белая',
    descriptionKa: `თეთრი რულონური ფარდა, შუქგამტარი ქსოვილი, თეთრი კასეტა. ${MADE_TO_MEASURE}`,
  },
  {
    slug: 'roller-blind-charcoal',
    fabric: '#3d3e41',
    frame: '#2b2c2e',
    frameMetallic: 0.45,
    priceGel: 180,
    ...STORE,
    styles: ['industrial', 'modern'],
    nameKa: 'რულონური ფარდა — ნახშირისფერი',
    nameEn: 'Roller blind — charcoal',
    nameRu: 'Рулонная штора — графитовая',
    descriptionKa: `ნახშირისფერი რულონური ფარდა, ჩამაბნელებელი ქსოვილი, შავი ლითონის კასეტა. ${MADE_TO_MEASURE}`,
  },
  {
    slug: 'roller-blind-linen',
    fabric: '#d8cab0',
    frame: '#ece5d6',
    frameMetallic: 0.1,
    priceGel: 170,
    ...STORE,
    styles: ['scandinavian', 'vintage'],
    nameKa: 'რულონური ფარდა — სელისფერი',
    nameEn: 'Roller blind — linen',
    nameRu: 'Рулонная штора — льняная',
    descriptionKa: `სელისფერი რულონური ფარდა, სელის ტექსტურის ქსოვილი, კრემისფერი კასეტა. ${MADE_TO_MEASURE}`,
  },
];

/** The blind's model in the frame every placed piece is drawn in, in centimetres (`pnpm models:blinds`). */
export const BLIND_MODEL_CM = { width: 100, height: 60, depth: 6 } as const;

export const blindModelUrl = (slug: string) => `/models/blinds/${slug}.glb`;
export const blindPhotoUrl = (slug: string) => `/uploads/furniture/${slug}.webp`;
