/**
 * The skirting boards and cornices the studio can lay, as catalogue products.
 *
 * A moulding is the one thing in the studio with no model file: it has no fixed length, so
 * it is *swept* — its cross-section (`profile`, with a height and how far it stands out)
 * is run along every wall of the room by `buildMouldingGeometry`, round the corners on the
 * mitre and broken at the doors. What a product has to carry is therefore that profile and
 * its two measurements, which is exactly what `lib/design/trims.ts` reads back out of
 * `specs`. Sold by the running metre, like the real thing.
 *
 * Prices and brands are ours and fictional, like the rest of the seeded catalogue.
 */

import type { StyleId, TrimKind, TrimProfile } from '../../lib/design/types';

export interface TrimProduct {
  slug: string;
  kind: TrimKind;
  profile: TrimProfile;
  heightCm: number;
  depthCm: number;
  colorHex: string;
  priceGelPerM: number;
  brand: string;
  storeSlug: string;
  styles: StyleId[];
  nameKa: string;
  nameEn: string;
  nameRu: string;
  descriptionKa: string;
}

export const TRIM_PRODUCTS: TrimProduct[] = [
  // --- skirting boards ---------------------------------------------------------------
  {
    slug: 'skirting-mdf-white-80',
    kind: 'skirting',
    profile: 'flat',
    heightCm: 8,
    depthCm: 1.6,
    colorHex: '#F4F4F2',
    priceGelPerM: 9,
    brand: 'Domus',
    storeSlug: 'domus-interior',
    styles: ['modern', 'scandinavian'],
    nameKa: 'პლინტუსი MDF — თეთრი, 80 მმ',
    nameEn: 'Skirting board MDF — white, 80 mm',
    nameRu: 'Плинтус МДФ — белый, 80 мм',
    descriptionKa: 'სწორი თეთრი პლინტუსი, 80 მმ — ყველაზე გავრცელებული ზომა ბინებში.',
  },
  {
    slug: 'skirting-mdf-white-120',
    kind: 'skirting',
    profile: 'stepped',
    heightCm: 12,
    depthCm: 1.8,
    colorHex: '#F7F5F0',
    priceGelPerM: 14,
    brand: 'Domus',
    storeSlug: 'domus-interior',
    styles: ['modern', 'scandinavian', 'vintage'],
    nameKa: 'პლინტუსი MDF — თეთრი, 120 მმ, საფეხურიანი',
    nameEn: 'Skirting board MDF — white, 120 mm, stepped',
    nameRu: 'Плинтус МДФ — белый, 120 мм, ступенчатый',
    descriptionKa: 'მაღალი საფეხურიანი პლინტუსი — მაღალჭერიანი ოთახებისთვის.',
  },
  {
    slug: 'skirting-oak-70',
    kind: 'skirting',
    profile: 'rounded',
    heightCm: 7,
    depthCm: 1.5,
    colorHex: '#C9A87C',
    priceGelPerM: 19,
    brand: 'Nordic Home',
    storeSlug: 'nordic-home',
    styles: ['scandinavian'],
    nameKa: 'პლინტუსი მუხა — ნატურალური, 70 მმ',
    nameEn: 'Skirting board oak — natural, 70 mm',
    nameRu: 'Плинтус дуб — натуральный, 70 мм',
    descriptionKa: 'ნატურალური მუხის პლინტუსი მომრგვალებული კიდით — იატაკის ფერში.',
  },
  {
    slug: 'skirting-black-100',
    kind: 'skirting',
    profile: 'flat',
    heightCm: 10,
    depthCm: 1.2,
    colorHex: '#3A3A3C',
    priceGelPerM: 16,
    brand: 'LOFT 42',
    storeSlug: 'loft-42',
    styles: ['industrial', 'modern'],
    nameKa: 'პლინტუსი — შავი მატი, 100 მმ',
    nameEn: 'Skirting board — matte black, 100 mm',
    nameRu: 'Плинтус — чёрный матовый, 100 мм',
    descriptionKa: 'თხელი შავი მატი პლინტუსი — ინდუსტრიული ინტერიერისთვის.',
  },
  {
    slug: 'skirting-classic-140',
    kind: 'skirting',
    profile: 'ogee',
    heightCm: 14,
    depthCm: 2.2,
    colorHex: '#EFE6D4',
    priceGelPerM: 28,
    brand: 'ანტიკვარი',
    storeSlug: 'antikvari',
    styles: ['vintage'],
    nameKa: 'პლინტუსი „კლასიკა“ — პროფილირებული, 140 მმ',
    nameEn: 'Skirting board "Classic" — profiled, 140 mm',
    nameRu: 'Плинтус «Классика» — профилированный, 140 мм',
    descriptionKa: 'მაღალი პროფილირებული პლინტუსი კლასიკური ნაკვთით.',
  },

  // --- cornices ----------------------------------------------------------------------
  {
    slug: 'cornice-cove-60',
    kind: 'cornice',
    profile: 'cove',
    heightCm: 6,
    depthCm: 6,
    colorHex: '#FAF8F4',
    priceGelPerM: 11,
    brand: 'Domus',
    storeSlug: 'domus-interior',
    styles: ['scandinavian', 'modern'],
    nameKa: 'ჭერის პლინტუსი — მარტივი ჩაზნექილი, 60 მმ',
    nameEn: 'Cornice — plain cove, 60 mm',
    nameRu: 'Потолочный плинтус — простая галтель, 60 мм',
    descriptionKa: 'მარტივი ჩაზნექილი გალტელი კედელსა და ჭერს შორის.',
  },
  {
    slug: 'cornice-step-90',
    kind: 'cornice',
    profile: 'stepped',
    heightCm: 9,
    depthCm: 9,
    colorHex: '#FFFFFF',
    priceGelPerM: 18,
    brand: 'Domus',
    storeSlug: 'domus-interior',
    styles: ['modern'],
    nameKa: 'ჭერის პლინტუსი — საფეხურიანი, 90 მმ',
    nameEn: 'Cornice — stepped, 90 mm',
    nameRu: 'Потолочный плинтус — ступенчатый, 90 мм',
    descriptionKa: 'საფეხურიანი კარნიზი — ფარული განათებისთვისაც გამოდგება.',
  },
  {
    slug: 'cornice-classic-110',
    kind: 'cornice',
    profile: 'ogee',
    heightCm: 11,
    depthCm: 11,
    colorHex: '#F3ECDD',
    priceGelPerM: 32,
    brand: 'ანტიკვარი',
    storeSlug: 'antikvari',
    styles: ['vintage'],
    nameKa: 'ჭერის პლინტუსი „კლასიკა“ — 110 მმ',
    nameEn: 'Cornice "Classic" — 110 mm',
    nameRu: 'Потолочный плинтус «Классика» — 110 мм',
    descriptionKa: 'კლასიკური S-ნაკვთის კარნიზი — მაღალ ჭერთან ერთად.',
  },
];
