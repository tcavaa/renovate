import { describe, expect, it } from 'vitest';
import { droppedUrls, isRuntimeUploadKey, productFileUrls } from '@/lib/storage/uploadKeys';

describe('which stored files the app may delete', () => {
  it('knows a runtime upload by its name', () => {
    expect(isRuntimeUploadKey('products/1790515337257-a1b2c3d4e5f6.png')).toBe(true);
    expect(isRuntimeUploadKey('models/1790515337257-a1b2c3d4e5f6.glb')).toBe(true);
    expect(isRuntimeUploadKey('models/own-12-1790515337257-a1b2c3d4.glb')).toBe(true);
    expect(isRuntimeUploadKey('products/own-12-1790515337257-a1b2c3d4.jpg')).toBe(true);
  });

  it('never takes a seed picture that ships with the repo for one', () => {
    expect(isRuntimeUploadKey('products/porcelain-tile-60x60-beige.png')).toBe(false);
    expect(isRuntimeUploadKey('furniture/stock-kk-toilet.png')).toBe(false);
    expect(isRuntimeUploadKey('furniture/fixture-door-oak.png')).toBe(false);
    // A name that merely starts with digits is not the upload route's.
    expect(isRuntimeUploadKey('products/2024-catalogue.png')).toBe(false);
  });
});

describe('the files a row lets go of', () => {
  it('lists a product’s photo, model and texture', () => {
    expect(productFileUrls({ imageUrl: '/uploads/a.png', model3dUrl: '/uploads/b.glb', textureUrl: null })).toEqual(['/uploads/a.png', '/uploads/b.glb', null]);
  });

  it('is what an edit replaced or cleared — never a field it did not touch', () => {
    const before = { imageUrl: '/uploads/old.png', model3dUrl: '/uploads/m.glb', textureUrl: null };
    expect(droppedUrls(before, { imageUrl: '/uploads/new.png', model3dUrl: undefined, textureUrl: '/t.jpg' })).toEqual(['/uploads/old.png']);
    expect(droppedUrls(before, { imageUrl: '', model3dUrl: '/uploads/m.glb' })).toEqual(['/uploads/old.png']);
    expect(droppedUrls(before, {})).toEqual([]);
  });
});
