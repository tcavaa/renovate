import type { Store, Worker } from '@/lib/db/schema';

/**
 * What the public may know about a partner.
 *
 * `GET /api/stores` and `/api/workers` used to answer anybody with the whole row: the
 * commission the platform takes from that partner, its private e-mail, whether it was still
 * waiting for approval — and the pending and switched-off ones along with the rest. The public
 * sees a partner the platform lists (approved and active) and the fields a customer needs to
 * choose and reach it; the platform's own people keep the whole row.
 */

export type PublicStore = Pick<
  Store,
  'id' | 'nameKa' | 'nameEn' | 'nameRu' | 'descriptionKa' | 'descriptionEn' | 'descriptionRu' | 'logoUrl' | 'websiteUrl' | 'phone' | 'address' | 'city' | 'rating' | 'reviewCount' | 'deliveryDays' | 'deliveryFeeGel'
>;

export type PublicWorker = Pick<
  Worker,
  | 'id'
  | 'nameKa'
  | 'nameEn'
  | 'nameRu'
  | 'specialty'
  | 'specialtySlug'
  | 'phone'
  | 'pricePerM2'
  | 'pricePerUnit'
  | 'priceUnit'
  | 'rating'
  | 'reviewCount'
  | 'bio'
  | 'bioEn'
  | 'bioRu'
  | 'avatarUrl'
  | 'city'
  | 'experienceYears'
  | 'completedJobs'
  | 'isVerified'
>;

/** Approved and switched on: a partner the platform shows. */
export function isListedPartner(row: { isActive: boolean; approvalStatus: string }): boolean {
  return row.isActive && row.approvalStatus === 'approved';
}

export function publicStore(row: Store): PublicStore {
  return {
    id: row.id,
    nameKa: row.nameKa,
    nameEn: row.nameEn,
    nameRu: row.nameRu,
    descriptionKa: row.descriptionKa,
    descriptionEn: row.descriptionEn,
    descriptionRu: row.descriptionRu,
    logoUrl: row.logoUrl,
    websiteUrl: row.websiteUrl,
    phone: row.phone,
    address: row.address,
    city: row.city,
    rating: row.rating,
    reviewCount: row.reviewCount,
    deliveryDays: row.deliveryDays,
    deliveryFeeGel: row.deliveryFeeGel,
  };
}

export function publicWorker(row: Worker): PublicWorker {
  return {
    id: row.id,
    nameKa: row.nameKa,
    nameEn: row.nameEn,
    nameRu: row.nameRu,
    specialty: row.specialty,
    specialtySlug: row.specialtySlug,
    phone: row.phone,
    pricePerM2: row.pricePerM2,
    pricePerUnit: row.pricePerUnit,
    priceUnit: row.priceUnit,
    rating: row.rating,
    reviewCount: row.reviewCount,
    bio: row.bio,
    bioEn: row.bioEn,
    bioRu: row.bioRu,
    avatarUrl: row.avatarUrl,
    city: row.city,
    experienceYears: row.experienceYears,
    completedJobs: row.completedJobs,
    isVerified: row.isVerified,
  };
}
