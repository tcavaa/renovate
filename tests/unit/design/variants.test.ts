import { describe, expect, it } from 'vitest';
import {
  findVariant,
  namesWithVariant,
  productVariants,
  sceneVariant,
  variantFileUrls,
  variantSignature,
  variantUnitPrice,
  withItemVariant,
  type ProductVariant,
} from '@/lib/design/variants';
import { productSpecsSchema } from '@/lib/validations/product.schema';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlacedItem, SceneProduct } from '@/lib/design/types';

const black: ProductVariant = {
  id: 'black',
  nameKa: 'შავი ტყავი',
  nameEn: 'Black leather',
  nameRu: null,
  colorHex: '#1A1A1A',
  imageUrl: '/uploads/products/sofa-black.webp',
  pricePerUnit: 2600,
  slots: [{ material: 'Leather', colorHex: '#1A1A1A', keepTexture: true, roughness: 0.4 }],
};
const white: ProductVariant = {
  id: 'white',
  nameKa: 'თეთრი ტყავი',
  colorHex: '#F2F0EC',
  slots: [{ material: 'Leather', colorUrl: '/uploads/textures/white.webp', normalUrl: '/uploads/textures/white-n.webp', repeat: 2 }],
};

const product = {
  id: 7,
  nameKa: 'დივანი Lund',
  nameEn: 'Sofa Lund',
  slug: 'sofa-lund',
  brand: null,
  categorySlug: 'sofas',
  pricePerUnit: 2400,
  unit: 'piece',
  imageUrl: '/uploads/products/sofa.webp',
  colorHex: '#8A6A50',
  textureUrl: null,
  model3dKind: 'sofa_3seat',
  model3dUrl: '/models/sofa.glb',
  widthCm: 220,
  depthCm: 95,
  heightCm: 85,
  styleTags: ['modern'],
  tags: null,
  isFeatured: false,
  specs: { variants: [black, white] },
  coveragePerUnit: null,
  store: null,
} as CatalogProduct;

const snapshot: SceneProduct = {
  productId: 7,
  nameKa: product.nameKa,
  nameEn: product.nameEn,
  nameRu: null,
  slug: product.slug,
  brand: null,
  pricePerUnit: 2400,
  unit: 'piece',
  qty: 1,
  totalPrice: 2400,
  imageUrl: product.imageUrl,
  colorHex: product.colorHex,
  textureUrl: null,
  model3dUrl: product.model3dUrl,
  categorySlug: 'sofas',
  store: null,
};
const item = { id: 'i1', roomId: 'r1', slot: 'sofa', kind: 'sofa_3seat', position: { x: 0, z: 0 }, elevationM: 0, rotation: 0, size: { width: 2.2, depth: 0.95, height: 0.85 }, product: snapshot } as PlacedItem;

describe('reading variants out of specs', () => {
  it('keeps the well-formed ones, normalised', () => {
    const list = productVariants(product.specs);
    expect(list.map((v) => v.id)).toEqual(['black', 'white']);
    expect(list[1]).toMatchObject({ pricePerUnit: null, imageUrl: null, slots: [{ material: 'Leather', keepTexture: true, repeat: 2 }] });
  });

  it('leaves out a variant with no id, no name, a bad swatch, no parts, or an id already taken', () => {
    const specs = {
      variants: [
        { ...black, id: '' },
        { ...black, id: 'a', nameKa: '  ' },
        { ...black, id: 'b', colorHex: 'black' },
        { ...black, id: 'c', slots: [] },
        { ...black, id: 'd', slots: [{ colorHex: '#000000' }] },
        black,
        { ...white, id: 'black' },
      ],
    };
    expect(productVariants(specs).map((v) => v.id)).toEqual(['black']);
    expect(productVariants(null)).toEqual([]);
    expect(productVariants({ variants: 'no' })).toEqual([]);
  });

  it('clamps what a slot holds', () => {
    const [v] = productVariants({ variants: [{ ...black, slots: [{ material: 'Leather', roughness: 3, repeat: -1, colorHex: '#zzzzzz' }] }] });
    expect(v.slots[0]).toMatchObject({ roughness: 1, repeat: null, colorHex: null });
  });

  it('finds one by id', () => {
    expect(findVariant(product.specs, 'white')?.nameKa).toBe('თეთრი ტყავი');
    expect(findVariant(product.specs, 'red')).toBeNull();
    expect(findVariant(product.specs, null)).toBeNull();
  });
});

describe('a piece in a variant', () => {
  it('takes the variant’s price, photo and look', () => {
    const dressed = withItemVariant(item, product, 'black');
    expect(dressed.product).toMatchObject({ pricePerUnit: 2600, totalPrice: 2600, imageUrl: black.imageUrl, variant: { id: 'black', nameEn: 'Black leather', colorHex: '#1A1A1A' } });
    expect(dressed.product!.variant!.slots[0].material).toBe('Leather');
  });

  it('keeps the product’s price and photo for a variant that has none of its own', () => {
    expect(withItemVariant(item, product, 'white').product).toMatchObject({ pricePerUnit: 2400, imageUrl: product.imageUrl, variant: { id: 'white' } });
  });

  it('goes back to the product’s own look', () => {
    const back = withItemVariant(withItemVariant(item, product, 'black'), product, null);
    expect(back.product).toMatchObject({ pricePerUnit: 2400, totalPrice: 2400, imageUrl: product.imageUrl });
    expect(back.product).not.toHaveProperty('variant');
  });

  it('leaves the piece alone for an unknown variant or another product', () => {
    expect(withItemVariant(item, product, 'red')).toBe(item);
    expect(withItemVariant(item, { ...product, id: 8 }, 'black')).toBe(item);
  });

  it('prices by the variant only when it has a price', () => {
    expect(variantUnitPrice(100, null)).toBe(100);
    expect(variantUnitPrice(100, { pricePerUnit: null })).toBe(100);
    expect(variantUnitPrice(100, { pricePerUnit: 120 })).toBe(120);
  });
});

describe('names, files and signatures', () => {
  it('names a piece by its product and its variant', () => {
    expect(namesWithVariant(snapshot)).toEqual({ nameKa: 'დივანი Lund', nameEn: 'Sofa Lund', nameRu: null });
    expect(namesWithVariant({ ...snapshot, variant: sceneVariant(black) })).toEqual({ nameKa: 'დივანი Lund — შავი ტყავი', nameEn: 'Sofa Lund — Black leather', nameRu: null });
    // A variant with no English name falls back to its Georgian one beside the English product name.
    expect(namesWithVariant({ ...snapshot, nameRu: 'Диван Lund', variant: sceneVariant(productVariants({ variants: [white] })[0]) })).toMatchObject({ nameEn: 'Sofa Lund — თეთრი ტყავი', nameRu: 'Диван Lund — თეთრი ტყავი' });
  });

  it('lists every file the variants use', () => {
    expect(variantFileUrls(product.specs).sort()).toEqual(['/uploads/products/sofa-black.webp', '/uploads/textures/white-n.webp', '/uploads/textures/white.webp']);
  });

  it('tells two looks apart', () => {
    const a = sceneVariant(black);
    expect(variantSignature(a)).toBe(variantSignature(sceneVariant(black)));
    expect(variantSignature({ ...a, slots: [{ ...a.slots[0], colorHex: '#FFFFFF' }] })).not.toBe(variantSignature(a));
    expect(variantSignature(null)).toBe('');
  });
});

describe('the product form’s schema', () => {
  it('takes variants in specs', () => {
    expect(productSpecsSchema.safeParse({ variants: [black, white] }).success).toBe(true);
  });

  it('refuses a variant with no parts, a bad colour or a repeated id', () => {
    expect(productSpecsSchema.safeParse({ variants: [{ ...black, slots: [] }] }).success).toBe(false);
    expect(productSpecsSchema.safeParse({ variants: [{ ...black, colorHex: 'black' }] }).success).toBe(false);
    expect(productSpecsSchema.safeParse({ variants: [black, { ...white, id: 'black' }] }).success).toBe(false);
  });
});
