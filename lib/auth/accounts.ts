import type { UserRole } from './roles';

/**
 * The rules an account is kept to when admin makes or changes one — pure, so the routes and
 * the tests share them.
 *
 * A partner account speaks for exactly one partner: a `store` account for a store, a `worker`
 * for a worker profile, a `team` for a brigade. Its role and its link travel together: an
 * account switched to `store` without a store would open an empty portal, and one switched
 * away from `store` that kept its store id would keep a door into that store's orders.
 */

export interface AccountLinks {
  storeId: number | null;
  workerId: number | null;
  teamId: number | null;
}

export type LinkField = keyof AccountLinks;

export const NO_LINKS: AccountLinks = { storeId: null, workerId: null, teamId: null };

/** Which link a role carries; null for a role that speaks for no partner. */
export function linkFieldFor(role: UserRole): LinkField | null {
  if (role === 'store') return 'storeId';
  if (role === 'worker') return 'workerId';
  if (role === 'team') return 'teamId';
  return null;
}

export type LinksResult = { ok: true; links: AccountLinks } | { ok: false; error: 'PARTNER_LINK_REQUIRED' };

/**
 * The links an account ends up with for its role: the matching one — asked for, or kept from
 * before — and the other two cleared. A partner role with no partner is refused.
 */
export function linksForRole(role: UserRole, requested: Partial<AccountLinks>, current: AccountLinks = NO_LINKS): LinksResult {
  const field = linkFieldFor(role);
  const links: AccountLinks = { ...NO_LINKS };
  if (!field) return { ok: true, links };
  const value = requested[field] !== undefined ? requested[field] : current[field];
  if (!value) return { ok: false, error: 'PARTNER_LINK_REQUIRED' };
  links[field] = value;
  return { ok: true, links };
}

/**
 * What admin may not do to their own account from the users page: take away their own admin
 * role, switch themselves off, or delete themselves — each would lock the last admin out.
 */
export function selfChangeError(actorId: number, targetId: number, change: { role?: UserRole; isActive?: boolean; remove?: boolean }): 'CANNOT_CHANGE_OWN_ROLE' | 'CANNOT_DEACTIVATE_SELF' | 'CANNOT_DELETE_SELF' | null {
  if (actorId !== targetId) return null;
  if (change.remove) return 'CANNOT_DELETE_SELF';
  if (change.role && change.role !== 'admin') return 'CANNOT_CHANGE_OWN_ROLE';
  if (change.isActive === false) return 'CANNOT_DEACTIVATE_SELF';
  return null;
}
