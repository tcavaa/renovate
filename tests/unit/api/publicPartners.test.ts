import { describe, expect, it } from 'vitest';
import { isListedPartner, publicStore, publicWorker } from '@/lib/api/publicPartners';
import type { Store, Worker } from '@/lib/db/schema';

const store: Store = {
  id: 6,
  nameKa: 'Domus Interior',
  nameEn: 'Domus Interior',
  nameRu: null,
  logoUrl: '/uploads/stores/domus.png',
  websiteUrl: 'https://domus.ge',
  phone: '+995 555 000 000',
  email: 'orders@domus.ge',
  address: 'Tbilisi',
  city: 'თბილისი',
  rating: '4.70',
  reviewCount: 12,
  deliveryDays: 3,
  deliveryFeeGel: '50.00',
  descriptionKa: 'ავეჯი',
  descriptionEn: null,
  descriptionRu: null,
  commissionRate: '8.00',
  approvalStatus: 'approved',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const worker = {
  id: 5,
  nameKa: 'რევაზ კობახიძე',
  nameEn: null,
  nameRu: null,
  specialty: 'დურგალი',
  specialtySlug: 'carpentry',
  phone: '+995 555 111 111',
  email: 'revaz@example.ge',
  commissionRate: '6.00',
  pricePerM2: null,
  pricePerUnit: '120.00',
  priceUnit: 'unit',
  rating: '4.90',
  reviewCount: 4,
  bio: 'კარები და კარადები',
  bioEn: null,
  bioRu: null,
  avatarUrl: null,
  city: 'თბილისი',
  experienceYears: 12,
  completedJobs: 40,
  isVerified: true,
  approvalStatus: 'approved',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
} as Worker;

describe('what the public may know about a partner', () => {
  it('lists only a partner that is approved and switched on', () => {
    expect(isListedPartner(store)).toBe(true);
    expect(isListedPartner({ ...store, approvalStatus: 'pending' })).toBe(false);
    expect(isListedPartner({ ...store, isActive: false })).toBe(false);
    expect(isListedPartner({ ...store, approvalStatus: 'rejected' })).toBe(false);
  });

  it('never tells the public a store’s commission, private e-mail or approval', () => {
    const face = publicStore(store) as Record<string, unknown>;
    for (const secret of ['commissionRate', 'email', 'approvalStatus', 'isActive', 'createdAt']) expect(face).not.toHaveProperty(secret);
    // What a customer needs to choose and reach it is all there.
    expect(face).toMatchObject({ id: 6, nameKa: 'Domus Interior', phone: '+995 555 000 000', deliveryFeeGel: '50.00', deliveryDays: 3, logoUrl: '/uploads/stores/domus.png' });
  });

  it('never tells the public a worker’s commission, private e-mail or approval', () => {
    const face = publicWorker(worker) as Record<string, unknown>;
    for (const secret of ['commissionRate', 'email', 'approvalStatus', 'isActive', 'createdAt']) expect(face).not.toHaveProperty(secret);
    expect(face).toMatchObject({ id: 5, specialtySlug: 'carpentry', pricePerUnit: '120.00', isVerified: true });
  });
});
