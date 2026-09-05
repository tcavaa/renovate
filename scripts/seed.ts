/* eslint-disable no-console */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db, pool } from '../lib/db';
import {
  categories,
  products,
  workers,
  users,
  stores,
} from '../lib/db/schema';

type SeedCategory = {
  nameKa: string;
  nameEn: string;
  slug: string;
  phase: number;
  calculationType:
    | 'per_m2_floor'
    | 'per_m2_wall'
    | 'per_m2_ceiling'
    | 'per_linear_m'
    | 'per_unit'
    | 'per_room'
    | 'fixed';
  isFurniture: boolean;
};

const seedCategories: SeedCategory[] = [
  { nameKa: 'იატაკის ფილა', nameEn: 'Floor Tiles', slug: 'floor-tiles', phase: 9, calculationType: 'per_m2_floor', isFurniture: false },
  { nameKa: 'კედლის ფილა', nameEn: 'Wall Tiles', slug: 'wall-tiles', phase: 9, calculationType: 'per_m2_wall', isFurniture: false },
  { nameKa: 'ლამინატი', nameEn: 'Laminate Flooring', slug: 'laminate', phase: 11, calculationType: 'per_m2_floor', isFurniture: false },
  { nameKa: 'კარები', nameEn: 'Doors', slug: 'doors', phase: 10, calculationType: 'per_unit', isFurniture: false },
  { nameKa: 'ფანჯრები', nameEn: 'Windows', slug: 'windows', phase: 10, calculationType: 'per_unit', isFurniture: false },
  { nameKa: 'საღებავი', nameEn: 'Paint', slug: 'paint', phase: 13, calculationType: 'per_m2_wall', isFurniture: false },
  { nameKa: 'სანიტარია', nameEn: 'Sanitary', slug: 'sanitary', phase: 16, calculationType: 'per_unit', isFurniture: false },
  { nameKa: 'განათება', nameEn: 'Lighting', slug: 'lighting', phase: 15, calculationType: 'per_unit', isFurniture: false },
  { nameKa: 'როზეტები/ამომრთველები', nameEn: 'Sockets & Switches', slug: 'sockets-switches', phase: 14, calculationType: 'per_unit', isFurniture: false },
  { nameKa: 'საწოლები', nameEn: 'Beds', slug: 'beds', phase: 20, calculationType: 'per_unit', isFurniture: true },
  { nameKa: 'სავარძლები/დივნები', nameEn: 'Sofas & Armchairs', slug: 'sofas', phase: 20, calculationType: 'per_unit', isFurniture: true },
  { nameKa: 'მაგიდები', nameEn: 'Tables', slug: 'tables', phase: 20, calculationType: 'per_unit', isFurniture: true },
  { nameKa: 'სკამები', nameEn: 'Chairs', slug: 'chairs', phase: 20, calculationType: 'per_unit', isFurniture: true },
  { nameKa: 'კარადები', nameEn: 'Wardrobes', slug: 'wardrobes', phase: 20, calculationType: 'per_unit', isFurniture: true },
  { nameKa: 'სამზარეულოს ავეჯი', nameEn: 'Kitchen Furniture', slug: 'kitchen-furniture', phase: 20, calculationType: 'per_unit', isFurniture: true },
  { nameKa: 'შენახვა/თარო', nameEn: 'Storage & Shelving', slug: 'storage', phase: 20, calculationType: 'per_unit', isFurniture: true },
];

type SeedProduct = {
  slug: string;
  nameKa: string;
  pricePerUnit: number;
  unit: 'm2' | 'linear_m' | 'piece' | 'liter' | 'kg' | 'pack' | 'set';
  brand?: string;
  imageUrl?: string;
  specs?: Record<string, string>;
  isFeatured?: boolean;
};

const productsBySlug: Record<string, SeedProduct[]> = {
  'floor-tiles': [
    { slug: 'porcelain-tile-60x60-beige', nameKa: 'პორცელანის ფილა 60x60 — ბეჟი', pricePerUnit: 18.5, unit: 'm2', brand: 'Kerama Marazzi', specs: { 'ზომა': '60x60 სმ', 'ფერი': 'ბეჟი', 'სისქე': '9მმ' }, isFeatured: true },
    { slug: 'ceramic-tile-60x120-anthracite', nameKa: 'კერამიკის ფილა 60x120 — ანტრაციტი', pricePerUnit: 32, unit: 'm2', brand: 'Cersanit', specs: { 'ზომა': '60x120 სმ', 'ფერი': 'ანტრაციტი', 'სისქე': '10მმ' } },
    { slug: 'marble-effect-tile-80x80', nameKa: 'მარმარილოს ეფექტის ფილა 80x80', pricePerUnit: 45, unit: 'm2', brand: 'Rex Ceramiche', specs: { 'ზომა': '80x80 სმ', 'ფერი': 'ყავისფერ-თეთრი' }, isFeatured: true },
    { slug: 'small-tile-30x30-grey', nameKa: 'კარალაძური ფილა 30x30 — ნაცრისფერი', pricePerUnit: 12, unit: 'm2', brand: 'Local Georgia', specs: { 'ზომა': '30x30 სმ', 'ფერი': 'ნაცრისფერი' } },
  ],
  'wall-tiles': [
    { slug: 'wall-tile-glossy-white-25x40', nameKa: 'კედლის ფილა 25x40 — თეთრი გლუვი', pricePerUnit: 14, unit: 'm2', brand: 'Atem', specs: { 'ზომა': '25x40 სმ', 'ფერი': 'თეთრი' } },
    { slug: 'wall-tile-marble-30x60', nameKa: 'კედლის ფილა 30x60 — მარმარილოს ეფექტი', pricePerUnit: 28, unit: 'm2', brand: 'Cersanit', specs: { 'ზომა': '30x60 სმ' }, isFeatured: true },
    { slug: 'wall-tile-mosaic-blue', nameKa: 'მოზაიკა — ცისფერი', pricePerUnit: 38, unit: 'm2', brand: 'Vitra', specs: { 'ფერი': 'ცისფერი' } },
    { slug: 'wall-tile-textured-grey', nameKa: 'ტექსტურირებული ფილა — ნაცრისფერი', pricePerUnit: 24, unit: 'm2', brand: 'Kerama Marazzi', specs: { 'ფერი': 'ნაცრისფერი' } },
  ],
  laminate: [
    { slug: 'laminate-oak-classic-8mm', nameKa: 'ლამინატი 8მმ — კლასიკური მუხა', pricePerUnit: 22, unit: 'm2', brand: 'Kronospan', specs: { 'სისქე': '8მმ', 'კლასი': 'AC4' }, isFeatured: true },
    { slug: 'laminate-walnut-12mm', nameKa: 'ლამინატი 12მმ — კაკალი', pricePerUnit: 38, unit: 'm2', brand: 'Egger', specs: { 'სისქე': '12მმ', 'კლასი': 'AC5' } },
    { slug: 'laminate-grey-10mm', nameKa: 'ლამინატი 10მმ — ნაცრისფერი', pricePerUnit: 28, unit: 'm2', brand: 'Tarkett', specs: { 'სისქე': '10მმ' } },
    { slug: 'laminate-light-oak-budget', nameKa: 'ლამინატი 7მმ — ბიუჯეტური', pricePerUnit: 14, unit: 'm2', brand: 'Local', specs: { 'სისქე': '7მმ', 'კლასი': 'AC3' } },
  ],
  doors: [
    { slug: 'door-mdf-white-classic', nameKa: 'შიდა კარი MDF — თეთრი კლასიკური', pricePerUnit: 320, unit: 'piece', brand: 'PortaDoor', specs: { 'მასალა': 'MDF' } },
    { slug: 'door-oak-modern', nameKa: 'შიდა კარი მუხა — მოდერნი', pricePerUnit: 580, unit: 'piece', brand: 'Geona', specs: { 'მასალა': 'მუხა' }, isFeatured: true },
    { slug: 'door-glass-aluminum', nameKa: 'შუშის კარი ალუმინის ჩარჩოთი', pricePerUnit: 850, unit: 'piece', brand: 'AluPro', specs: { 'მასალა': 'შუშა + ალუმინი' } },
    { slug: 'door-budget-laminated', nameKa: 'ლამინირებული კარი — ბიუჯეტური', pricePerUnit: 180, unit: 'piece', brand: 'Local', specs: { 'მასალა': 'ლამინატი' } },
  ],
  windows: [
    { slug: 'window-pvc-double-1200x1400', nameKa: 'PVC ფანჯარა ორმაგი მინა 120x140', pricePerUnit: 480, unit: 'piece', brand: 'Rehau', specs: { 'მინა': 'ორმაგი', 'ზომა': '120x140' }, isFeatured: true },
    { slug: 'window-pvc-triple-1500x1500', nameKa: 'PVC ფანჯარა სამმაგი მინა 150x150', pricePerUnit: 720, unit: 'piece', brand: 'Veka', specs: { 'მინა': 'სამმაგი', 'ზომა': '150x150' } },
    { slug: 'window-aluminum-large', nameKa: 'ალუმინის ფანჯარა — დიდი ფორმატის', pricePerUnit: 950, unit: 'piece', brand: 'AluPro', specs: { 'მასალა': 'ალუმინი' } },
    { slug: 'window-budget-pvc-small', nameKa: 'PVC ფანჯარა ბიუჯეტური 90x120', pricePerUnit: 290, unit: 'piece', brand: 'Local', specs: { 'ზომა': '90x120' } },
  ],
  paint: [
    { slug: 'paint-tikkurila-white-9l', nameKa: 'საღებავი Tikkurila — თეთრი 9ლ', pricePerUnit: 18, unit: 'liter', brand: 'Tikkurila', specs: { 'ფერი': 'თეთრი', 'მოცულობა': '9 ლიტრი' }, isFeatured: true },
    { slug: 'paint-dulux-color-3l', nameKa: 'საღებავი Dulux ფერადი — 3ლ', pricePerUnit: 22, unit: 'liter', brand: 'Dulux', specs: { 'მოცულობა': '3 ლიტრი' } },
    { slug: 'paint-marshall-eco-5l', nameKa: 'საღებავი Marshall ეკოლოგიური — 5ლ', pricePerUnit: 14, unit: 'liter', brand: 'Marshall', specs: { 'მოცულობა': '5 ლიტრი' } },
    { slug: 'paint-budget-white-10l', nameKa: 'ბიუჯეტური თეთრი საღებავი — 10ლ', pricePerUnit: 8, unit: 'liter', brand: 'Local', specs: { 'მოცულობა': '10 ლიტრი' } },
  ],
  sanitary: [
    { slug: 'toilet-roca-suspended', nameKa: 'უნიტაზი Roca — დაკიდული', pricePerUnit: 850, unit: 'piece', brand: 'Roca', isFeatured: true },
    { slug: 'sink-villeroy-double', nameKa: 'ნიჟარა Villeroy & Boch ორმაგი', pricePerUnit: 1200, unit: 'piece', brand: 'Villeroy & Boch' },
    { slug: 'shower-cabin-glass', nameKa: 'შხაპის ფარდი — შუშა 90x90', pricePerUnit: 980, unit: 'piece', brand: 'Ravak' },
    { slug: 'toilet-budget', nameKa: 'უნიტაზი ბიუჯეტური', pricePerUnit: 320, unit: 'piece', brand: 'Local' },
  ],
  lighting: [
    { slug: 'pendant-lamp-modern-black', nameKa: 'დაკიდებული ჭაღი — შავი მოდერნი', pricePerUnit: 220, unit: 'piece', brand: 'Eglo' },
    { slug: 'led-spot-set-6', nameKa: 'LED სპოტები ნაკრები (6 ცალი)', pricePerUnit: 95, unit: 'set', brand: 'Philips', isFeatured: true },
    { slug: 'wall-lamp-elegant', nameKa: 'კედლის ნათურა — ელეგანტი', pricePerUnit: 140, unit: 'piece', brand: 'Eglo' },
    { slug: 'chandelier-crystal', nameKa: 'კრისტალის ჭაღი — დიდი', pricePerUnit: 1450, unit: 'piece', brand: 'Maytoni' },
  ],
  'sockets-switches': [
    { slug: 'socket-schneider-white', nameKa: 'როზეტი Schneider — თეთრი', pricePerUnit: 18, unit: 'piece', brand: 'Schneider' },
    { slug: 'switch-legrand-elegant', nameKa: 'ამომრთველი Legrand — ელეგანტი', pricePerUnit: 22, unit: 'piece', brand: 'Legrand', isFeatured: true },
    { slug: 'usb-socket-modern', nameKa: 'USB როზეტი — მოდერნი', pricePerUnit: 45, unit: 'piece', brand: 'Schneider' },
    { slug: 'socket-budget-set-10', nameKa: 'როზეტი ნაკრები (10 ცალი)', pricePerUnit: 60, unit: 'set', brand: 'Local' },
  ],
  beds: [
    { slug: 'bed-double-160-oak', nameKa: 'ორმაგი საწოლი 160x200 — მუხის', pricePerUnit: 1850, unit: 'piece', brand: 'Furniture.ge', specs: { 'ზომა': '160x200', 'მასალა': 'მუხა' } },
    { slug: 'bed-double-180-white', nameKa: 'ორმაგი საწოლი 180x200 — თეთრი', pricePerUnit: 2200, unit: 'piece', brand: 'Furniture.ge', specs: { 'ზომა': '180x200' }, isFeatured: true },
    { slug: 'bed-single-90', nameKa: 'ერთმხრივი საწოლი 90x200', pricePerUnit: 950, unit: 'piece', brand: 'Local', specs: { 'ზომა': '90x200' } },
    { slug: 'bed-premium-metal', nameKa: 'პრემიუმ საწოლი — ჭედური ფოლადი 160x200', pricePerUnit: 3400, unit: 'piece', brand: 'Iron Studio', specs: { 'მასალა': 'ლითონი' } },
  ],
  sofas: [
    { slug: 'sofa-corner-grey', nameKa: 'კუთხური დივანი 3+2 — ნაცრისფერი', pricePerUnit: 2800, unit: 'piece', brand: 'Comfort.ge', isFeatured: true },
    { slug: 'sofa-3-seat-brown', nameKa: 'სამადგილიანი დივანი — ყავისფერი', pricePerUnit: 1950, unit: 'piece', brand: 'Comfort.ge' },
    { slug: 'armchair-blue', nameKa: 'სავარძელი — ლურჯი', pricePerUnit: 1200, unit: 'piece', brand: 'Local' },
    { slug: 'puff-extra', nameKa: 'პუფი-სავარძელი დამატებითი', pricePerUnit: 450, unit: 'piece', brand: 'Local' },
  ],
  tables: [
    { slug: 'dining-table-oak-6', nameKa: 'სასადილო მაგიდა 6 ადგილი — მუხა', pricePerUnit: 1450, unit: 'piece', brand: 'Furniture.ge' },
    { slug: 'coffee-table-modern', nameKa: 'ჟურნალის მაგიდა — მოდერნი', pricePerUnit: 380, unit: 'piece', brand: 'Comfort.ge', isFeatured: true },
    { slug: 'dining-table-extendable', nameKa: 'გასაშლელი სასადილო მაგიდა', pricePerUnit: 1850, unit: 'piece', brand: 'Furniture.ge' },
    { slug: 'side-table-small', nameKa: 'პატარა გვერდითი მაგიდა', pricePerUnit: 220, unit: 'piece', brand: 'Local' },
  ],
  chairs: [
    { slug: 'chair-dining-set-4', nameKa: 'სასადილო სკამები ნაკრები (4 ცალი)', pricePerUnit: 720, unit: 'set', brand: 'Furniture.ge' },
    { slug: 'chair-office-ergonomic', nameKa: 'საოფისე ერგონომიული სკამი', pricePerUnit: 850, unit: 'piece', brand: 'Comfort.ge', isFeatured: true },
    { slug: 'chair-bar-set-2', nameKa: 'ბარის სკამები ნაკრები (2 ცალი)', pricePerUnit: 480, unit: 'set', brand: 'Local' },
    { slug: 'chair-accent-velvet', nameKa: 'აქცენტი სკამი — ხავერდის', pricePerUnit: 540, unit: 'piece', brand: 'Comfort.ge' },
  ],
  wardrobes: [
    { slug: 'wardrobe-3-doors-oak', nameKa: 'კარადა 3 კარი — მუხა', pricePerUnit: 1850, unit: 'piece', brand: 'Furniture.ge' },
    { slug: 'wardrobe-sliding-mirror', nameKa: 'კარადა გასაშვები კარით + სარკე', pricePerUnit: 2400, unit: 'piece', brand: 'Comfort.ge', isFeatured: true },
    { slug: 'wardrobe-2-doors-white', nameKa: 'კარადა 2 კარი — თეთრი', pricePerUnit: 1100, unit: 'piece', brand: 'Local' },
    { slug: 'wardrobe-walk-in-large', nameKa: 'შესასვლელი კარადა — დიდი', pricePerUnit: 4200, unit: 'piece', brand: 'Custom' },
  ],
  'kitchen-furniture': [
    { slug: 'kitchen-set-3m-classic', nameKa: 'სამზარეულო ნაკრები 3მ — კლასიკური', pricePerUnit: 4500, unit: 'set', brand: 'KitchenPro', isFeatured: true },
    { slug: 'kitchen-island-modern', nameKa: 'სამზარეულოს კუნძული — მოდერნი', pricePerUnit: 2800, unit: 'piece', brand: 'KitchenPro' },
    { slug: 'kitchen-set-corner', nameKa: 'სამზარეულო კუთხური ნაკრები', pricePerUnit: 6800, unit: 'set', brand: 'KitchenPro' },
    { slug: 'kitchen-budget-set', nameKa: 'სამზარეულო ბიუჯეტური ნაკრები', pricePerUnit: 2200, unit: 'set', brand: 'Local' },
  ],
  storage: [
    { slug: 'shelf-wall-modern', nameKa: 'კედლის თარო — მოდერნი', pricePerUnit: 220, unit: 'piece', brand: 'Furniture.ge' },
    { slug: 'shelf-bookcase-large', nameKa: 'წიგნების თარო — დიდი', pricePerUnit: 680, unit: 'piece', brand: 'Comfort.ge', isFeatured: true },
    { slug: 'storage-cube-set', nameKa: 'შესანახი კუბები — ნაკრები', pricePerUnit: 320, unit: 'set', brand: 'Local' },
    { slug: 'shoe-cabinet', nameKa: 'ფეხსაცმლის კარადა', pricePerUnit: 480, unit: 'piece', brand: 'Local' },
  ],
};

const seedWorkers: Array<{
  nameKa: string;
  specialty: string;
  specialtySlug: string;
  pricePerM2?: string;
  pricePerUnit?: string;
  priceUnit: 'm2' | 'unit' | 'fixed';
  rating: string;
  reviewCount: number;
  bio: string;
  phone: string;
  isVerified: boolean;
}> = [
  { nameKa: 'გიორგი მესხი', specialty: 'მეფილე — ფილების დება', specialtySlug: 'tiling', pricePerM2: '22.00', priceUnit: 'm2', rating: '4.9', reviewCount: 87, bio: '12 წლის გამოცდილების მქონე ხელოსანი. სერთიფიცირებული.', phone: '+995555111222', isVerified: true },
  { nameKa: 'დავით ბერიძე', specialty: 'მხატვარი — შტუკატურება და საღებავი', specialtySlug: 'painting', pricePerM2: '8.00', priceUnit: 'm2', rating: '4.8', reviewCount: 64, bio: 'სპეციალისტი ფინიშურ სამუშაოებში.', phone: '+995555111223', isVerified: true },
  { nameKa: 'ლევან წერეთელი', specialty: 'სანტექნიკოსი', specialtySlug: 'plumbing', pricePerM2: '25.00', priceUnit: 'm2', rating: '5.0', reviewCount: 112, bio: 'ნებისმიერი სირთულის სანტექნიკის სამუშაოები.', phone: '+995555111224', isVerified: true },
  { nameKa: 'ნიკა ჯავახიშვილი', specialty: 'ელექტრიკოსი', specialtySlug: 'electrical', pricePerM2: '20.00', priceUnit: 'm2', rating: '4.9', reviewCount: 91, bio: 'ელექტრო პროექტი + მონტაჟი. 24/7.', phone: '+995555111225', isVerified: true },
  { nameKa: 'რევაზ კობახიძე', specialty: 'დურგალი — კარები და კარადები', specialtySlug: 'carpentry', pricePerUnit: '60.00', priceUnit: 'unit', rating: '4.7', reviewCount: 45, bio: 'ხელოვნური და ხელით ნაკეთები.', phone: '+995555111226', isVerified: false },
  { nameKa: 'ზურაბ კვარაცხელია', specialty: 'მშტუკატურე', specialtySlug: 'plastering', pricePerM2: '18.00', priceUnit: 'm2', rating: '4.8', reviewCount: 56, bio: 'შტუკატურება და გასწორება.', phone: '+995555111227', isVerified: true },
];

async function seed() {
  console.log('🌱 Seeding RenovateGE database...');

  console.log('— inserting categories');
  for (const c of seedCategories) {
    await db
      .insert(categories)
      .values({ ...c, sortOrder: 0, isVisible: true })
      .onDuplicateKeyUpdate({ set: { nameKa: c.nameKa } });
  }

  console.log('— inserting partner store');
  await db
    .insert(stores)
    .values({
      nameKa: 'რემონტი.ge ოფიციალური მაღაზია',
      websiteUrl: 'https://remonti.ge',
      phone: '+995322000000',
      address: 'თბილისი, ქართველი ხელოსნების 1',
      commissionRate: '5.00',
      isActive: true,
    })
    .onDuplicateKeyUpdate({ set: { nameKa: 'რემონტი.ge ოფიციალური მაღაზია' } });

  console.log('— inserting products');
  const cats = await db.select().from(categories);
  const catMap = new Map(cats.map((c) => [c.slug, c.id]));

  for (const [slug, list] of Object.entries(productsBySlug)) {
    const categoryId = catMap.get(slug);
    if (!categoryId) {
      console.warn(`  ! missing category for ${slug}`);
      continue;
    }
    for (const p of list) {
      await db
        .insert(products)
        .values({
          categoryId,
          nameKa: p.nameKa,
          slug: p.slug,
          pricePerUnit: String(p.pricePerUnit),
          unit: p.unit,
          brand: p.brand ?? null,
          imageUrl: p.imageUrl ?? `/uploads/products/${p.slug}.png`,
          specs: p.specs ?? null,
          isActive: true,
          isFeatured: !!p.isFeatured,
        })
        .onDuplicateKeyUpdate({
          set: {
            pricePerUnit: String(p.pricePerUnit),
            nameKa: p.nameKa,
            imageUrl: p.imageUrl ?? `/uploads/products/${p.slug}.png`,
            isFeatured: !!p.isFeatured,
          },
        });
    }
  }

  console.log('— inserting workers');
  for (const w of seedWorkers) {
    await db
      .insert(workers)
      .values({ ...w, isActive: true })
      .onDuplicateKeyUpdate({ set: { rating: w.rating } });
  }

  // The admin account comes from the environment, never from a constant in the repo: a
  // published default password is a break-in waiting to happen. Without ADMIN_PASSWORD a
  // random one is generated and printed exactly once; production refuses to guess.
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@remonti.ge').toLowerCase();
  let adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_PASSWORD must be set to seed the admin account in production');
    }
    adminPassword = randomBytes(12).toString('base64url');
    console.log(`— no ADMIN_PASSWORD set; generated one for ${adminEmail}: ${adminPassword}`);
    console.log('  (set ADMIN_PASSWORD in .env.local to choose your own — this is printed only once)');
  }
  console.log(`— inserting admin user (${adminEmail})`);
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await db
    .insert(users)
    .values({
      name: 'ადმინი',
      email: adminEmail,
      passwordHash,
      role: 'admin',
    })
    .onDuplicateKeyUpdate({ set: { passwordHash } });

  console.log('✅ Seed complete.');
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
