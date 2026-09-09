/**
 * Who can do what.
 *
 * `admin` runs the platform. `store` and `worker` are partner accounts: each is bound to
 * one `stores` / `workers` row and sees only that partner's orders in the portal at
 * `/partner`. Everyone else is a `user`. The role travels in the JWT, so the proxy can gate
 * `/admin` and `/partner` without a database round trip.
 */
export type UserRole = 'user' | 'admin' | 'store' | 'worker';

export const USER_ROLES: readonly UserRole[] = ['user', 'admin', 'store', 'worker'];
export const PARTNER_ROLES: readonly UserRole[] = ['store', 'worker'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function isPartnerRole(role: UserRole | undefined | null): role is 'store' | 'worker' {
  return role === 'store' || role === 'worker';
}

/** Admin may open the portal too — to see exactly what a partner sees. */
export function canOpenPartnerPortal(role: UserRole | undefined | null): boolean {
  return role === 'admin' || isPartnerRole(role);
}

/** The session fields a partner account carries next to its role. */
export interface PartnerLink {
  storeId: number | null;
  workerId: number | null;
}
