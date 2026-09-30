/**
 * The kitchen maker and the materials a made-to-measure kitchen is made in (`lib/design/kitchen`).
 *
 * Each material is one of the maker's products in the `kitchen-custom` category, priced per m²
 * of façade — the carcases, the fronts, the worktop's share and the fitting, all in — which the
 * studio and the budget multiply by the façade a piece measures (`kitchenFacadeM2`). Its 3D
 * model is a kitchen run in that material (`public/models/kitchens`, `pnpm models:kitchens`,
 * which `models:seed` gives it): chosen for a run, it is drawn in place of the kitchen model
 * placed in the room (`drawnModelUrl`). The store is a fictional placeholder like the others in
 * `seed-design.ts`.
 * The swatches in public/uploads/products were cut from the stock wood textures in
 * public/textures (a flat colour for the painted MDF), with the fronts' gaps and handles drawn over.
 *
 * `seed-design.ts` writes the store with the rest; `models:seed` makes it when it is missing —
 * the cPanel deploy runs that script alone — and writes the materials.
 */

import type { StyleId } from '../../lib/design/types';

export interface SeedStoreSpec {
  slug: string;
  nameKa: string;
  descriptionKa: string;
  city: string;
  address: string;
  phone: string;
  websiteUrl: string;
  rating: string;
  reviewCount: number;
  deliveryDays: number;
  deliveryFeeGel: string;
  commissionRate: string;
}

export const KITCHEN_STORE: SeedStoreSpec = {
  slug: 'kitchen-custom',
  nameKa: 'სამზარეულოს ავეჯი — ინდივიდუალური დამზადება',
  descriptionKa: 'სამზარეულოს ავეჯი ბინის ზომებზე: ლამინირებული ლდსპ, შეღებილი MDF ან მუხის ნატურალური შპონი. ფასი — ფასადის კვადრატულ მეტრზე, ზომების აღებით, სამუშაო ზედაპირითა და მონტაჟით.',
  city: 'თბილისი',
  address: 'თბილისი, დიდუბე, წერეთლის გამზ. 116',
  phone: '+995 322 55 06 41',
  websiteUrl: 'https://kitchen-custom.ge',
  rating: '4.70',
  reviewCount: 58,
  // Made to order: measured, built and fitted — three weeks, delivered and fitted in the price.
  deliveryDays: 21,
  deliveryFeeGel: '0.00',
  commissionRate: '7.00',
};

export interface KitchenMaterialSpec {
  slug: string;
  nameKa: string;
  nameEn: string;
  nameRu: string;
  descriptionKa: string;
  /** All in, per m² of façade. */
  priceGelPerM2: number;
  /** The first is the style it is the default of (`kitchenMaterialCandidates`). */
  styles: StyleId[];
  colorHex: string;
  imageUrl: string;
}

export const KITCHEN_MATERIALS: KitchenMaterialSpec[] = [
  {
    slug: 'kitchen-material-ldsp',
    nameKa: 'ლამინირებული ლდსპ — ნაცრისფერი მუხა',
    nameEn: 'Laminated chipboard — grey oak',
    nameRu: 'ЛДСП — серый дуб',
    descriptionKa: 'კორპუსი და ფასადი — ლამინირებული ლდსპ (18 მმ), ABS კიდით; სამუშაო ზედაპირი — ლამინირებული, 38 მმ. ფასი ფასადის 1 მ²-ზე, ზომების აღებითა და მონტაჟით.',
    priceGelPerM2: 650,
    styles: ['scandinavian', 'industrial'],
    colorHex: '#B4AAA3',
    imageUrl: '/uploads/products/kitchen-material-ldsp-grey-oak.jpg',
  },
  {
    slug: 'kitchen-material-mdf',
    nameKa: 'შეღებილი MDF — მატი, კაშემირი',
    nameEn: 'Painted MDF — matt cashmere',
    nameRu: 'Крашеный МДФ — матовый кашемир',
    descriptionKa: 'ფასადი — შეღებილი MDF (19 მმ, მატი ლაქი), კორპუსი — ლამინირებული ლდსპ; სამუშაო ზედაპირი — კომპაქტ-ლამინატი. ფასი ფასადის 1 მ²-ზე, ზომების აღებითა და მონტაჟით.',
    priceGelPerM2: 850,
    styles: ['modern', 'scandinavian'],
    colorHex: '#DCD5C8',
    imageUrl: '/uploads/products/kitchen-material-mdf.jpg',
  },
  {
    slug: 'kitchen-material-veneer',
    nameKa: 'მუხის ნატურალური შპონი',
    nameEn: 'Natural oak veneer',
    nameRu: 'Натуральный шпон дуба',
    descriptionKa: 'ფასადი — მუხის ნატურალური შპონი (ზეთი-ცვილი), კორპუსი — ლამინირებული ლდსპ; სამუშაო ზედაპირი — მასივი ან კვარცი. ფასი ფასადის 1 მ²-ზე, ზომების აღებითა და მონტაჟით.',
    priceGelPerM2: 1150,
    styles: ['vintage', 'modern', 'industrial'],
    colorHex: '#B8875A',
    imageUrl: '/uploads/products/kitchen-material-veneer.jpg',
  },
];
