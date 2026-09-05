/* eslint-disable no-console */
/**
 * Seeds what the Design Studio needs besides furniture: the partner stores and the two extra
 * furniture categories.
 *
 *   pnpm db:seed:design
 *
 * Idempotent — re-running updates the stores in place rather than duplicating rows.
 *
 * The furniture itself is *not* seeded here. Every product the studio can place is a converted
 * partner model, and `pnpm models:seed` writes those from `public/models/manifest.json` —
 * and removes anything else. There used to be a hand-written range of 115 procedural products
 * in this file; it went when the studio stopped drawing furniture nobody sells.
 *
 * The stores are **fictional placeholders** for the Georgian market. They exist so the whole
 * flow — hover a sofa in 3D, see who sells it, for how much, and where their shop is — is
 * real end to end. Swapping them for signed partners is a data change, not a code change.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { eq } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { categories, stores } from '../lib/db/schema';

// ---------------------------------------------------------------------------
// Categories the studio needs on top of the calculator's own
// ---------------------------------------------------------------------------

const extraCategories = [
  {
    nameKa: 'ხალიჩები',
    nameEn: 'Rugs',
    slug: 'rugs',
    phase: 20,
    calculationType: 'per_unit' as const,
    isFurniture: true,
    icon: 'square',
  },
  {
    nameKa: 'დეკორი',
    nameEn: 'Decor',
    slug: 'decor',
    phase: 20,
    calculationType: 'per_unit' as const,
    isFurniture: true,
    icon: 'frame',
  },
];

// ---------------------------------------------------------------------------
// Partner stores (fictional)
// ---------------------------------------------------------------------------

interface SeedStore {
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

const seedStores: SeedStore[] = [
  {
    slug: 'kartuli-aveji',
    nameKa: 'ქართული ავეჯი',
    descriptionKa: 'ადგილობრივი წარმოების მასივის ავეჯი — საწოლები, კარადები, სასადილო ჯგუფები.',
    city: 'თბილისი',
    address: 'თბილისი, დიღომი, ქავთარაძის 21',
    phone: '+995 322 45 18 60',
    websiteUrl: 'https://kartuli-aveji.ge',
    rating: '4.70',
    reviewCount: 184,
    deliveryDays: 7,
    deliveryFeeGel: '60.00',
    commissionRate: '6.00',
  },
  {
    slug: 'nordic-home',
    nameKa: 'Nordic Home Tbilisi',
    descriptionKa: 'სკანდინავიური დიზაინის ავეჯი და აქსესუარები. ღია მუხა, ნატურალური ქსოვილები.',
    city: 'თბილისი',
    address: 'თბილისი, ვაკე, ჭავჭავაძის გამზ. 74',
    phone: '+995 322 30 77 12',
    websiteUrl: 'https://nordichome.ge',
    rating: '4.80',
    reviewCount: 226,
    deliveryDays: 5,
    deliveryFeeGel: '45.00',
    commissionRate: '7.00',
  },
  {
    slug: 'loft-42',
    nameKa: 'LOFT 42',
    descriptionKa: 'ინდუსტრიული სტილის ავეჯი — ლითონი, მასივი, ტყავი. ლოფტებისა და სტუდიოებისთვის.',
    city: 'თბილისი',
    address: 'თბილისი, ისანი, ქეთევან დედოფლის გამზ. 42',
    phone: '+995 599 42 42 08',
    websiteUrl: 'https://loft42.ge',
    rating: '4.60',
    reviewCount: 97,
    deliveryDays: 10,
    deliveryFeeGel: '80.00',
    commissionRate: '6.50',
  },
  {
    slug: 'domus-interior',
    nameKa: 'Domus Interior',
    descriptionKa: 'თანამედროვე მინიმალისტური ინტერიერი — იტალიური და თურქული ბრენდები.',
    city: 'თბილისი',
    address: 'თბილისი, საბურთალო, ვაჟა-ფშაველას 76',
    phone: '+995 322 19 44 30',
    websiteUrl: 'https://domus.ge',
    rating: '4.90',
    reviewCount: 312,
    deliveryDays: 14,
    deliveryFeeGel: '120.00',
    commissionRate: '8.00',
  },
  {
    slug: 'antikvari',
    nameKa: 'ანტიკვარი — ვინტაჟის სალონი',
    descriptionKa: 'აღდგენილი ვინტაჟური ავეჯი და კლასიკური რეპლიკები. კაკალი, სპილენძი, ხავერდი.',
    city: 'თბილისი',
    address: 'თბილისი, სოლოლაკი, ლადო ასათიანის 9',
    phone: '+995 577 81 03 55',
    websiteUrl: 'https://antikvari.ge',
    rating: '4.50',
    reviewCount: 64,
    deliveryDays: 12,
    deliveryFeeGel: '70.00',
    commissionRate: '9.00',
  },
  {
    slug: 'lumina',
    nameKa: 'ლუმინა განათება',
    descriptionKa: 'ჭაღები, სანათები და LED სისტემები. ევროპული ბრენდები და ადგილობრივი წარმოება.',
    city: 'თბილისი',
    address: 'თბილისი, გლდანი, ქერჩის 4',
    phone: '+995 322 60 12 90',
    websiteUrl: 'https://lumina.ge',
    rating: '4.60',
    reviewCount: 143,
    deliveryDays: 4,
    deliveryFeeGel: '25.00',
    commissionRate: '7.50',
  },
  {
    slug: 'textil-plus',
    nameKa: 'ტექსტილ+ ხალიჩები',
    descriptionKa: 'ხალიჩები, ფარდები და საოჯახო ტექსტილი. ქუთაისის საწყობიდან პირდაპირ.',
    city: 'ქუთაისი',
    address: 'ქუთაისი, თამარ მეფის 18',
    phone: '+995 431 24 55 71',
    websiteUrl: 'https://textilplus.ge',
    rating: '4.40',
    reviewCount: 88,
    deliveryDays: 6,
    deliveryFeeGel: '35.00',
    commissionRate: '10.00',
  },
  {
    slug: 'san-plus',
    nameKa: 'სან-პლუს სანტექნიკა',
    descriptionKa: 'სველი წერტილის სრული აღჭურვა — უნიტაზები, ნიჟარები, შხაპები, ტექნიკა.',
    city: 'თბილისი',
    address: 'თბილისი, ვარკეთილი, ჯავახეთის 12',
    phone: '+995 322 74 39 25',
    websiteUrl: 'https://sanplus.ge',
    rating: '4.30',
    reviewCount: 156,
    deliveryDays: 3,
    deliveryFeeGel: '40.00',
    commissionRate: '5.00',
  },
];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  console.log('🎨 Seeding Design Studio catalogue…');

  console.log('— categories');
  for (const c of extraCategories) {
    await db
      .insert(categories)
      .values({ ...c, isVisible: true, sortOrder: 50 })
      .onDuplicateKeyUpdate({ set: { nameKa: c.nameKa, isFurniture: c.isFurniture } });
  }

  console.log('— partner stores');
  for (const s of seedStores) {
    const values = {
      nameKa: s.nameKa,
      descriptionKa: s.descriptionKa,
      logoUrl: `/uploads/stores/${s.slug}.svg`,
      websiteUrl: s.websiteUrl,
      phone: s.phone,
      address: s.address,
      city: s.city,
      rating: s.rating,
      reviewCount: s.reviewCount,
      deliveryDays: s.deliveryDays,
      deliveryFeeGel: s.deliveryFeeGel,
      commissionRate: s.commissionRate,
      isActive: true,
    };
    // `stores` has no unique business key, so match on the name we control.
    const existing = await db.select().from(stores).where(eq(stores.nameKa, s.nameKa)).limit(1);
    if (existing.length > 0) {
      await db.update(stores).set(values).where(eq(stores.id, existing[0].id));
    } else {
      await db.insert(stores).values(values);
    }
  }

  console.log(`✅ done — ${seedStores.length} stores. Furniture comes from the partner models: pnpm models:seed`);
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ design seed failed:', err);
  process.exit(1);
});
