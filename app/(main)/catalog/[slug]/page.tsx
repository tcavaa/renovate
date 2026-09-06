import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, categories } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getLocale, getT } from '@/lib/i18n/server';
import { localizedName, localizedText, pickLocalizedName, unitLabel } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const rows = await db
    .select({ nameKa: products.nameKa, nameEn: products.nameEn, nameRu: products.nameRu, descriptionKa: products.descriptionKa, descriptionEn: products.descriptionEn, descriptionRu: products.descriptionRu, imageUrl: products.imageUrl })
    .from(products)
    .where(eq(products.slug, params.slug))
    .limit(1);
  const product = rows[0];
  if (!product) return {};
  const locale = await getLocale();
  return {
    title: localizedName(locale, product),
    description: localizedText(locale, product.descriptionKa, product.descriptionEn, product.descriptionRu) ?? undefined,
    openGraph: product.imageUrl ? { images: [product.imageUrl] } : undefined,
  };
}

export default async function ProductDetailPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const ka = await getT();
  const locale = await getLocale();
  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.slug, params.slug))
    .limit(1);
  const product = productRows[0];
  if (!product) notFound();
  const name = localizedName(locale, product);
  const description = localizedText(locale, product.descriptionKa, product.descriptionEn, product.descriptionRu);

  const catRows = await db
    .select()
    .from(categories)
    .where(eq(categories.id, product.categoryId))
    .limit(1);
  const category = catRows[0];

  const imageUrl =
    product.imageUrl ||
    `https://placehold.co/800x600/E85D26/FFFFFF/png?text=${encodeURIComponent(
      name.split(' ')[0]
    )}`;

  const specs = (product.specs ?? {}) as Record<string, string>;

  return (
    <div className="container py-10">
      <Button variant="ghost" asChild className="mb-6">
        <Link href="/catalog">
          <ArrowLeft className="h-4 w-4" />
          {ka.common.back}
        </Link>
      </Button>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="relative aspect-[4/3] bg-bg-base">
            <Image
              src={imageUrl}
              alt={name}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </Card>
        <div>
          {category && <Badge variant="default">{pickLocalizedName(locale, category.nameKa, category.nameEn, category.nameRu)}</Badge>}
          <h1 className="mt-3 font-serif text-3xl font-bold leading-tight">
            {name}
          </h1>
          {product.brand && (
            <p className="mt-2 text-sm uppercase tracking-wide text-ink-muted">
              {ka.catalog.brand}: {product.brand}
            </p>
          )}

          <div className="my-6 flex items-baseline gap-2">
            <span className="font-serif text-4xl font-bold text-brand">
              {formatGEL(Number(product.pricePerUnit))}
            </span>
            <span className="text-ink-muted">/ {unitLabel(ka, product.unit)}</span>
          </div>

          {description && (
            <p className="text-base leading-relaxed text-ink-muted">
              {description}
            </p>
          )}

          {Object.keys(specs).length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 font-serif text-lg font-semibold">
                {ka.catalog.specs}
              </h3>
              <CardContent className="grid gap-2 rounded-md border border-line bg-bg-surface p-4">
                {Object.entries(specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-ink-muted">{k}</span>
                    <span className="font-medium">{String(v)}</span>
                  </div>
                ))}
              </CardContent>
            </div>
          )}

          <Button size="xl" className="mt-8" asChild>
            <Link href="/calculator">{ka.catalog.addToProject}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
