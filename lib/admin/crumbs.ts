/**
 * The admin's breadcrumbs: where a page sits, from the dashboard down. `AdminCrumbs` draws
 * them with a back button to the one above; this names each section once, so every page says
 * "Products" the same way and links to the same list. A crumb that is a list (`list: true`)
 * links back to it as it was left — its filters, sort and page (`lib/admin/listMemory.ts`).
 */

import type { Dictionary } from '@/lib/i18n';

export interface Crumb {
  label: string;
  /** None for the page itself (the last crumb). */
  href?: string;
  /** A list: the link returns to it with the filters it was left with. */
  list?: boolean;
}

export type CrumbSection = 'products' | 'categories' | 'shelfRooms' | 'stores' | 'rates' | 'workers' | 'teams' | 'projects' | 'orders' | 'revenue' | 'users' | 'settings';

const SECTION_HREF: Record<CrumbSection, string> = {
  products: '/admin/products',
  categories: '/admin/categories',
  shelfRooms: '/admin/categories/rooms',
  stores: '/admin/stores',
  rates: '/admin/rates',
  workers: '/admin/workers',
  teams: '/admin/teams',
  projects: '/admin/projects',
  orders: '/admin/orders',
  revenue: '/admin/revenue',
  users: '/admin/users',
  settings: '/admin/settings',
};

function sectionLabel(t: Dictionary, section: CrumbSection): string {
  switch (section) {
    case 'products':
      return t.admin.products;
    case 'categories':
      return t.admin.categories;
    case 'shelfRooms':
      return t.admin.shelfRooms.tab;
    case 'stores':
      return t.admin.stores;
    case 'rates':
      return t.admin.rates;
    case 'workers':
      return t.admin.workers;
    case 'teams':
      return t.admin.teams;
    case 'projects':
      return t.admin.projects;
    case 'orders':
      return t.admin.ordersPage.title;
    case 'revenue':
      return t.admin.revenue.title;
    case 'users':
      return t.admin.users;
    case 'settings':
      return t.admin.settings.title;
  }
}

/** A section as a crumb: a link back to its list, or — `here` — the page being looked at. */
export function sectionCrumb(t: Dictionary, section: CrumbSection, here = false): Crumb {
  const label = sectionLabel(t, section);
  return here ? { label } : { label, href: SECTION_HREF[section], list: true };
}
