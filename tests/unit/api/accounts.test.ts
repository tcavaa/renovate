import { describe, expect, it } from 'vitest';
import { linkFieldFor, linksForRole, NO_LINKS, selfChangeError } from '@/lib/auth/accounts';
import { adminHomeFor, canAdmin, canDeleteIn, canOpenAdmin, canOpenPartnerPortal, homePathFor } from '@/lib/auth/roles';
import { generatePassword } from '@/lib/auth/password';

describe('an account’s partner link follows its role', () => {
  it('knows which link each role carries', () => {
    expect(linkFieldFor('store')).toBe('storeId');
    expect(linkFieldFor('worker')).toBe('workerId');
    expect(linkFieldFor('team')).toBe('teamId');
    expect(linkFieldFor('agent_orders')).toBeNull();
  });

  it('keeps the matching link and clears the others', () => {
    expect(linksForRole('team', { teamId: 3, storeId: 9 })).toEqual({ ok: true, links: { storeId: null, workerId: null, teamId: 3 } });
  });

  it('keeps the link the account already has when the form does not send one', () => {
    expect(linksForRole('store', {}, { storeId: 6, workerId: null, teamId: null })).toEqual({ ok: true, links: { storeId: 6, workerId: null, teamId: null } });
  });

  it('refuses a partner role with no partner — it would open an empty portal', () => {
    expect(linksForRole('store', {})).toEqual({ ok: false, error: 'PARTNER_LINK_REQUIRED' });
    expect(linksForRole('team', { teamId: null }, { storeId: null, workerId: null, teamId: 4 })).toEqual({ ok: false, error: 'PARTNER_LINK_REQUIRED' });
  });

  it('takes every link away from an account moved to a role without one', () => {
    expect(linksForRole('agent_catalog', { storeId: 5 }, { storeId: 5, workerId: null, teamId: null })).toEqual({ ok: true, links: NO_LINKS });
  });
});

describe('what admin may not do to their own account', () => {
  it('refuses demoting, switching off or deleting yourself', () => {
    expect(selfChangeError(1, 1, { role: 'agent_orders' })).toBe('CANNOT_CHANGE_OWN_ROLE');
    expect(selfChangeError(1, 1, { isActive: false })).toBe('CANNOT_DEACTIVATE_SELF');
    expect(selfChangeError(1, 1, { remove: true })).toBe('CANNOT_DELETE_SELF');
  });

  it('lets admin rename themselves, and change anybody else', () => {
    expect(selfChangeError(1, 1, { role: 'admin', isActive: true })).toBeNull();
    expect(selfChangeError(1, 2, { role: 'user', isActive: false, remove: true })).toBeNull();
  });
});

describe('who may open what, and where each role lands', () => {
  it('gives each agent the sections of their job and nothing else', () => {
    expect(canAdmin('agent_orders', 'orders')).toBe(true);
    expect(canAdmin('agent_orders', 'products')).toBe(false);
    expect(canAdmin('agent_catalog', 'stores')).toBe(true);
    expect(canAdmin('agent_catalog', 'revenue')).toBe(false);
    expect(canAdmin('store', 'dashboard')).toBe(false);
    expect(adminHomeFor('agent_catalog')).toBe('dashboard');
    expect(adminHomeFor('user')).toBeNull();
  });

  it('leaves deleting to admin: agents add, change and switch off', () => {
    for (const section of ['products', 'categories', 'stores'] as const) {
      expect(canDeleteIn('admin', section)).toBe(true);
      expect(canDeleteIn('agent_catalog', section)).toBe(false);
      expect(canDeleteIn('store', section)).toBe(false);
    }
    expect(canDeleteIn('agent_orders', 'orders')).toBe(false);
    expect(canDeleteIn(undefined, 'products')).toBe(false);
  });

  it('opens the portal to partners and admin, the admin to staff', () => {
    expect(canOpenPartnerPortal('team')).toBe(true);
    expect(canOpenPartnerPortal('agent_orders')).toBe(false);
    expect(canOpenAdmin('agent_orders')).toBe(true);
    expect(canOpenAdmin('team')).toBe(false);
  });

  it('sends everybody to their own part of the site', () => {
    expect(homePathFor('admin')).toBe('/admin');
    expect(homePathFor('agent_catalog')).toBe('/admin');
    expect(homePathFor('team')).toBe('/partner');
    expect(homePathFor('store')).toBe('/partner');
    expect(homePathFor('user')).toBe('/');
    expect(homePathFor(undefined)).toBe('/');
  });
});

describe('generatePassword', () => {
  it('is long enough, readable (no look-alike characters) and different every time', () => {
    const a = generatePassword();
    expect(a).toHaveLength(14);
    expect(a).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
    expect(generatePassword()).not.toBe(a);
    expect(generatePassword(4)).toHaveLength(8);
  });

  it('draws every character from the alphabet evenly — bytes past the last full round are thrown away', () => {
    // 255 is past 56 × 4 = 224 and must be skipped; 0 and 1 map to the first two characters.
    let calls = 0;
    const random = (bytes: Uint8Array) => {
      calls++;
      bytes.fill(255);
      bytes[0] = 0;
      bytes[1] = 1;
      return bytes;
    };
    expect(generatePassword(8, random)).toBe('abababab');
    expect(calls).toBe(4);
  });
});
