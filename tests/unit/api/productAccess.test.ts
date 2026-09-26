import { describe, expect, it } from 'vitest';
import {
  canEditProduct,
  canReadProduct,
  canViewProductPage,
  isPublicProduct,
  productViewer,
  visibilityOf,
  type ProductViewer,
  type ProductVisibility,
} from '@/lib/api/productAccess';

/**
 * Who may see a product and who may change it. The public sees an active product sold by no
 * store or an active one, and nobody's own furniture; the owner sees their own; staff with the
 * products section and a product's own store see (and change) the rest.
 */

const product = (patch: Partial<ProductVisibility> = {}): ProductVisibility => ({
  isActive: true,
  storeId: 7,
  storeActive: true,
  ownerUserId: null,
  ...patch,
});

const visitor = null;
const customer: ProductViewer = { id: 5, role: 'user', storeId: null };
const owner: ProductViewer = { id: 9, role: 'user', storeId: null };
const admin: ProductViewer = { id: 1, role: 'admin', storeId: null };
const catalogAgent: ProductViewer = { id: 2, role: 'agent_catalog', storeId: null };
const ordersAgent: ProductViewer = { id: 3, role: 'agent_orders', storeId: null };
const ownStore: ProductViewer = { id: 20, role: 'store', storeId: 7 };
const otherStore: ProductViewer = { id: 21, role: 'store', storeId: 8 };

const inactive = product({ isActive: false });
const pendingStore = product({ storeActive: false });
const ownFurniture = product({ storeId: null, storeActive: null, ownerUserId: 9 });

describe('isPublicProduct', () => {
  it('is an active product sold by an active store, or by no store', () => {
    expect(isPublicProduct(product())).toBe(true);
    expect(isPublicProduct(product({ storeId: null, storeActive: null }))).toBe(true);
  });

  it('is never an inactive product, one of a store not approved yet, or somebody\'s own', () => {
    expect(isPublicProduct(inactive)).toBe(false);
    expect(isPublicProduct(pendingStore)).toBe(false);
    // A product whose store row is missing from the join is not taken for public either.
    expect(isPublicProduct(product({ storeActive: null }))).toBe(false);
    expect(isPublicProduct(ownFurniture)).toBe(false);
  });
});

describe('canViewProductPage', () => {
  it('shows a public product to everybody', () => {
    for (const viewer of [visitor, customer, admin, otherStore]) expect(canViewProductPage(product(), viewer)).toBe(true);
  });

  it('shows a person\'s own furniture to them alone', () => {
    expect(canViewProductPage(ownFurniture, owner)).toBe(true);
    expect(canViewProductPage(ownFurniture, customer)).toBe(false);
    expect(canViewProductPage(ownFurniture, visitor)).toBe(false);
  });

  it('shows an inactive product or a pending store\'s to nobody, staff included', () => {
    for (const viewer of [visitor, customer, admin, catalogAgent, ownStore]) {
      expect(canViewProductPage(inactive, viewer)).toBe(false);
      expect(canViewProductPage(pendingStore, viewer)).toBe(false);
    }
  });
});

describe('canEditProduct', () => {
  it('lets staff with the products section change any product, whatever its store', () => {
    for (const editor of [admin, catalogAgent]) {
      expect(canEditProduct({ storeId: 7 }, editor)).toBe(true);
      expect(canEditProduct({ storeId: null }, editor)).toBe(true);
    }
  });

  it('lets a store change its own products and nothing else', () => {
    expect(canEditProduct({ storeId: 7 }, ownStore)).toBe(true);
    expect(canEditProduct({ storeId: 7 }, otherStore)).toBe(false);
    expect(canEditProduct({ storeId: null }, ownStore)).toBe(false);
    // A store account that lost its link owns nothing, not the products without a store.
    expect(canEditProduct({ storeId: null }, { role: 'store', storeId: null })).toBe(false);
  });

  it('lets nobody else change a product', () => {
    for (const editor of [visitor, customer, ordersAgent, { role: 'worker' as const, storeId: null }]) {
      expect(canEditProduct({ storeId: 7 }, editor)).toBe(false);
    }
  });
});

describe('canReadProduct', () => {
  it('reads a public product to anybody', () => {
    for (const viewer of [visitor, customer, ordersAgent, otherStore]) expect(canReadProduct(product(), viewer)).toBe(true);
  });

  it('reads a hidden product to staff and to its own store only', () => {
    for (const hidden of [inactive, pendingStore]) {
      expect(canReadProduct(hidden, admin)).toBe(true);
      expect(canReadProduct(hidden, catalogAgent)).toBe(true);
      expect(canReadProduct(hidden, ownStore)).toBe(true);
      expect(canReadProduct(hidden, otherStore)).toBe(false);
      expect(canReadProduct(hidden, ordersAgent)).toBe(false);
      expect(canReadProduct(hidden, customer)).toBe(false);
      expect(canReadProduct(hidden, visitor)).toBe(false);
    }
  });

  it('reads a person\'s own furniture to them and to staff, not to other people or stores', () => {
    expect(canReadProduct(ownFurniture, owner)).toBe(true);
    expect(canReadProduct(ownFurniture, admin)).toBe(true);
    expect(canReadProduct(ownFurniture, customer)).toBe(false);
    expect(canReadProduct(ownFurniture, otherStore)).toBe(false);
    expect(canReadProduct(ownFurniture, visitor)).toBe(false);
  });
});

describe('productViewer', () => {
  it('turns a session user into a viewer', () => {
    expect(productViewer({ id: '12', role: 'store', storeId: 7 })).toEqual({ id: 12, role: 'store', storeId: 7 });
    expect(productViewer({ id: '5', role: 'user' })).toEqual({ id: 5, role: 'user', storeId: null });
  });

  it('is nobody without a usable id', () => {
    expect(productViewer(null)).toBeNull();
    expect(productViewer(undefined)).toBeNull();
    expect(productViewer({ id: '', role: 'admin' })).toBeNull();
    expect(productViewer({ id: 'not-a-number', role: 'admin' })).toBeNull();
  });
});

describe('visibilityOf', () => {
  it('reads the four facts off a row and its store', () => {
    expect(visibilityOf({ isActive: true, storeId: 7, ownerUserId: null }, false)).toEqual(pendingStore);
    expect(visibilityOf({ isActive: true, storeId: null, ownerUserId: 9 }, undefined)).toEqual(ownFurniture);
  });
});
