/**
 * Who can do what.
 *
 * `admin` runs the platform and sees all of it. Beside them are the **agents** — the people
 * who actually work the platform day to day, each with the part of the admin their job
 * needs and nothing else:
 *
 *   - `agent_orders` takes the orders as they arrive: checks the furniture is still to be
 *     had, corrects the lines, rings the customer, writes down what was agreed and confirms.
 *     They never touch prices, rates, revenue, settings or accounts.
 *   - `agent_catalog` keeps the catalogue: signs up stores, adds their products and their
 *     3D models, sorts the categories. They never see an order or what the platform earns.
 *
 * `store`, `worker` and `team` are partner accounts: each is bound to one row and sees only
 * that partner's orders in the portal at `/partner`. Everyone else is a `user`. The role
 * travels in the JWT, so the proxy can gate `/admin` and `/partner` without a database
 * round trip.
 */

export type UserRole = 'user' | 'admin' | 'agent_orders' | 'agent_catalog' | 'store' | 'worker' | 'team';

export const USER_ROLES: readonly UserRole[] = ['user', 'admin', 'agent_orders', 'agent_catalog', 'store', 'worker', 'team'];
export const PARTNER_ROLES: readonly UserRole[] = ['store', 'worker', 'team'];
/** Accounts that see the admin: the platform's own people. */
export const STAFF_ROLES: readonly UserRole[] = ['admin', 'agent_orders', 'agent_catalog'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function isPartnerRole(role: UserRole | undefined | null): role is 'store' | 'worker' | 'team' {
  return role === 'store' || role === 'worker' || role === 'team';
}

/** Admin may open the portal too — to see exactly what a partner sees. */
export function canOpenPartnerPortal(role: UserRole | undefined | null): boolean {
  return role === 'admin' || isPartnerRole(role);
}

// ---------------------------------------------------------------------------
// The admin, section by section
// ---------------------------------------------------------------------------

/** The parts of the admin an account can be given. */
export type AdminSection =
  | 'dashboard'
  | 'orders'
  | 'projects'
  | 'products'
  | 'categories'
  | 'stores'
  | 'workers'
  | 'teams'
  | 'rates'
  | 'revenue'
  | 'users'
  | 'settings';

export const ADMIN_SECTIONS: readonly AdminSection[] = ['dashboard', 'orders', 'projects', 'products', 'categories', 'stores', 'workers', 'teams', 'rates', 'revenue', 'users', 'settings'];

/**
 * What each role may open. An agent's list is their job description: taking orders needs the
 * orders and the projects behind them; keeping the catalogue needs the products, the
 * categories and the stores that supply them. Neither needs the other's, and neither needs
 * the money or the accounts.
 */
const SECTIONS_BY_ROLE: Partial<Record<UserRole, readonly AdminSection[]>> = {
  admin: ADMIN_SECTIONS,
  agent_orders: ['dashboard', 'orders', 'projects'],
  agent_catalog: ['dashboard', 'products', 'categories', 'stores'],
};

/** Every section this role may open, in the sidebar's order. */
export function adminSectionsFor(role: UserRole | undefined | null): readonly AdminSection[] {
  return (role && SECTIONS_BY_ROLE[role]) ?? [];
}

/** True when the account sees the admin at all. */
export function canOpenAdmin(role: UserRole | undefined | null): boolean {
  return adminSectionsFor(role).length > 0;
}

/** True when the account may open this part of it. */
export function canAdmin(role: UserRole | undefined | null, section: AdminSection): boolean {
  return adminSectionsFor(role).includes(section);
}

/** Where an account lands when it opens `/admin`: its first section. */
export function adminHomeFor(role: UserRole | undefined | null): AdminSection | null {
  return adminSectionsFor(role)[0] ?? null;
}

/** The session fields a partner account carries next to its role. */
export interface PartnerLink {
  storeId: number | null;
  workerId: number | null;
  teamId: number | null;
}
