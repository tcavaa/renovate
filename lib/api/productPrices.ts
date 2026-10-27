import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, stores } from '@/lib/db/schema';
import { fixtureQuantity } from '@/lib/design/electrical';
import { isEquipmentKind } from '@/lib/design/equipment';
import { radiatorSections } from '@/lib/design/radiators';
import type { ElectricalPoint, FloorPlan, SceneProduct, SceneStore, TechnicalPoint } from '@/lib/design/types';
import { productVariants, sceneVariant, variantUnitPrice, type ProductVariant } from '@/lib/design/variants';
import { boilerCabinetFacadeM2 } from '@/lib/design/boilerCabinet';

/**
 * Current catalogue prices, by product id, for repricing a client-submitted basket.
 *
 * The browser sends product snapshots with the prices and quantities it was showing. Those
 * are a preview: anyone can edit them in devtools before saving, and the admin dashboard
 * would then display the forged total as if it were real. Every save route therefore looks
 * the price up again here, recomputes the quantity from the rooms, and overwrites both.
 *
 * Inactive products are still returned — a saved design may legitimately reference a product
 * that was retired after it was chosen. A product that does not exist at all is not.
 */
export interface KnownPrice {
  pricePerUnit: number;
  nameKa: string;
  unit: string;
  coveragePerUnit: number | null;
  /** What the product is on a plan — a door, a radiator, a socket — as the catalogue says, whatever a snapshot claims. */
  model3dKind: string | null;
  /**
   * Its files as the catalogue has them. A saved scene is opened by staff and by the brigade it
   * is hired for; a snapshot's own URLs (any host the client wrote) would load in their browsers
   * (S14 in docs/audit-checklist.md), so a repriced snapshot takes these instead.
   */
  assets?: { imageUrl: string | null; textureUrl: string | null; model3dUrl: string | null };
  /** Its material variants as the catalogue has them (`lib/design/variants.ts`); a placed piece is repriced in its own. */
  variants?: ProductVariant[];
}

export async function loadProductPrices(ids: Iterable<number>): Promise<Map<number, KnownPrice>> {
  const unique = [...new Set([...ids].filter((id) => Number.isInteger(id) && id > 0))];
  const known = new Map<number, KnownPrice>();
  if (unique.length === 0) return known;

  const rows = await db
    .select({
      id: products.id,
      pricePerUnit: products.pricePerUnit,
      nameKa: products.nameKa,
      unit: products.unit,
      coveragePerUnit: products.coveragePerUnit,
      model3dKind: products.model3dKind,
      imageUrl: products.imageUrl,
      textureUrl: products.textureUrl,
      model3dUrl: products.model3dUrl,
      specs: products.specs,
    })
    .from(products)
    .where(inArray(products.id, unique));

  for (const row of rows) {
    known.set(row.id, {
      pricePerUnit: Number(row.pricePerUnit),
      nameKa: row.nameKa,
      unit: row.unit,
      coveragePerUnit: row.coveragePerUnit != null ? Number(row.coveragePerUnit) : null,
      model3dKind: row.model3dKind ?? null,
      assets: { imageUrl: row.imageUrl ?? null, textureUrl: row.textureUrl ?? null, model3dUrl: row.model3dUrl ?? null },
      variants: productVariants(row.specs),
    });
  }
  return known;
}

type PricedSnapshot = { productId: number; qty: number; pricePerUnit: number; totalPrice: number };

/**
 * Applies a looked-up price and a server-computed quantity to one snapshot. Returns `null`
 * when the product is unknown, so the caller can refuse the whole save rather than silently
 * keep the client's numbers.
 */
export function repriceSnapshot<T extends PricedSnapshot>(
  snapshot: T,
  known: Map<number, KnownPrice>,
  qty: number = snapshot.qty
): T | null {
  const price = known.get(snapshot.productId);
  if (!price) return null;
  return withAssets(withPrice(withoutVariant(snapshot), price.pricePerUnit, qty), price);
}

/** Only a placed piece has a variant (`repriceItemSnapshot`); one sent on anything else — with files of its own — is dropped. */
function withoutVariant<T extends object>(snapshot: T): T {
  if (!('variant' in snapshot)) return snapshot;
  const { variant: _sent, ...rest } = snapshot as T & { variant?: unknown };
  return rest as T;
}

/**
 * A placed piece's snapshot repriced in its material variant: the catalogue's variant by the id
 * the snapshot names — its price, its photo, its names and the files of its look, never the
 * client's — or, when the product has no variant by that id any more, the product's own look at
 * the product's price. `null` for an unknown product, as `repriceSnapshot`.
 */
export function repriceItemSnapshot(snapshot: SceneProduct, known: Map<number, KnownPrice>, qty: number = snapshot.qty): SceneProduct | null {
  const price = known.get(snapshot.productId);
  if (!price) return null;
  const variant = snapshot.variant ? (price.variants ?? []).find((v) => v.id === snapshot.variant!.id) ?? null : null;
  const { variant: _sent, ...bare } = snapshot;
  const repriced = withAssets(withPrice(bare, variantUnitPrice(price.pricePerUnit, variant), qty), price);
  if (!variant) return repriced;
  return { ...repriced, imageUrl: variant.imageUrl || repriced.imageUrl, variant: sceneVariant(variant) };
}

/** The catalogue's files on a snapshot, for the URL fields it has (`KnownPrice.assets`). */
function withAssets<T extends object>(snapshot: T, price: KnownPrice): T {
  if (!price.assets) return snapshot;
  const out = { ...snapshot } as Record<string, unknown>;
  for (const key of ['imageUrl', 'textureUrl', 'model3dUrl'] as const) if (key in out) out[key] = price.assets[key];
  return out as T;
}

/**
 * Finishes are priced per square metre of room surface whatever the catalogue sells them
 * by: a tile already is, a tin of paint is its price divided by the area it covers. Mirrors
 * `pricePerM2` in `lib/design/surfaces.ts`. What the product is sold by — its unit, its price,
 * a paint's coverage — goes beside it (`SceneProduct.sale`): the budget buys whole units of it.
 */
export function repriceFinishSnapshot<T extends PricedSnapshot & { unit: string }>(
  snapshot: T,
  known: Map<number, KnownPrice>,
  areaM2: number
): (T & { sale: { unit: string; pricePerUnit: number; coveragePerUnit: number | null } }) | null {
  const price = known.get(snapshot.productId);
  if (!price) return null;
  const perM2 =
    price.unit === 'm2'
      ? price.pricePerUnit
      : price.pricePerUnit / Math.max(price.coveragePerUnit ?? (price.unit === 'liter' ? 8 : 1), 0.01);
  return { ...withAssets(withPrice(withoutVariant(snapshot), perM2, areaM2), price), unit: 'm2', sale: { unit: price.unit, pricePerUnit: price.pricePerUnit, coveragePerUnit: price.coveragePerUnit } };
}

function withPrice<T extends PricedSnapshot>(snapshot: T, pricePerUnit: number, qty: number): T {
  const safeQty = Number.isFinite(qty) && qty >= 0 ? qty : 0;
  return {
    ...snapshot,
    qty: safeQty,
    pricePerUnit,
    totalPrice: Math.round(pricePerUnit * safeQty * 100) / 100,
  };
}

/** Every product on a plan and the fittings on it: its doors and windows, its radiators and equipment, its sockets and lights. */
export function planProductIds(plan: FloorPlan | null, electrical: ElectricalPoint[] = []): number[] {
  if (!plan) return electrical.flatMap((p) => (p.product ? [p.product.productId] : []));
  return [
    ...plan.rooms.flatMap((r) => r.openings.map((o) => o.product?.productId)),
    ...(plan.technical?.points ?? []).flatMap((p) => [p.product?.productId, p.cabinet?.productId]),
    ...electrical.map((p) => p.product?.productId),
  ].filter((id): id is number => typeof id === 'number');
}

/**
 * A plan's products and its fittings' at the catalogue's price and the server's quantity: a door
 * or a window one apiece, a radiator by the section — counted on the plan as submitted, which is
 * the plan the sections belong to — a panel, a boiler, an air conditioner, a hood or a drain one
 * per point, a double socket two plates, a strip by the metre. The same
 * for the design's save and the calculator's: a door, a socket and a radiator are order lines a
 * store is sent, exactly as a sofa is. `unknown` lists products the catalogue does not have.
 */
export function repricePlan<P extends FloorPlan | null, E extends ElectricalPoint[] | undefined>(plan: P, electrical: E, known: Map<number, KnownPrice>): { plan: P; electrical: E; unknown: number[] } {
  const unknown: number[] = [];
  const repriced = <T extends { product?: SceneProduct | null }>(holder: T, qty: number): T => {
    if (!holder.product) return holder;
    const product = repriceSnapshot(holder.product, known, qty);
    if (!product) unknown.push(holder.product.productId);
    return product ? { ...holder, product } : holder;
  };
  // A boiler's cabinet: the joiner's material at the catalogue's price, by the façade the server measures.
  const cabinetRepriced = (point: TechnicalPoint): TechnicalPoint => {
    if (!point.cabinet) return point;
    const cabinet = repriceSnapshot(point.cabinet, known, boilerCabinetFacadeM2(point));
    if (!cabinet) unknown.push(point.cabinet.productId);
    return cabinet ? { ...point, cabinet } : point;
  };
  const next = (
    plan
      ? {
          ...plan,
          rooms: plan.rooms.map((room) => ({ ...room, openings: room.openings.map((opening) => repriced(opening, 1)) })),
          ...(plan.technical ? { technical: { ...plan.technical, points: plan.technical.points.map((point) => cabinetRepriced(point.kind === 'radiator' ? repriced(point, radiatorSections(plan, point)) : isEquipmentKind(point.kind) ? repriced(point, 1) : point)) } } : {}),
        }
      : plan
  ) as P;
  const fittings = (electrical ? electrical.map((point) => repriced(point, fixtureQuantity(point))) : electrical) as E;
  return { plan: next, electrical: fittings, unknown };
}

/** The shop that sells each product, as the snapshot a budget line carries — the calculator's picks record none. */
export async function loadProductStores(productIds: Iterable<number>): Promise<Map<number, SceneStore>> {
  const ids = [...new Set([...productIds].filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(inArray(products.id, ids));
  const storeIds = [...new Set(rows.map((r) => r.storeId).filter((id): id is number => id != null))];
  if (storeIds.length === 0) return new Map();
  const shops = await db.select().from(stores).where(inArray(stores.id, storeIds));
  const byId = new Map(
    shops.map((s): [number, SceneStore] => [
      s.id,
      { id: s.id, nameKa: s.nameKa, nameEn: s.nameEn, nameRu: s.nameRu, logoUrl: s.logoUrl, websiteUrl: s.websiteUrl, phone: s.phone, address: s.address, city: s.city, rating: s.rating == null ? null : Number(s.rating), deliveryDays: s.deliveryDays, deliveryFeeGel: s.deliveryFeeGel == null ? null : Number(s.deliveryFeeGel) },
    ])
  );
  const out = new Map<number, SceneStore>();
  for (const row of rows) {
    const shop = row.storeId != null ? byId.get(row.storeId) : undefined;
    if (shop) out.set(row.id, shop);
  }
  return out;
}
