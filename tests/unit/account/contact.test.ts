import { describe, expect, it } from 'vitest';
import { accountAddress, addressOf, formatAddress, resolveContact, sameAddress, type AccountContact } from '@/lib/account/contact';

const account = (extra: Partial<AccountContact> = {}): AccountContact => ({ name: 'ნინო', email: 'nino@example.ge', phone: '555 12 34 56', address: { city: 'თბილისი', line: 'ჭავჭავაძის 12', postalCode: '0179' }, ...extra });

describe('addresses', () => {
  it('is an address only with both a city and a street; the postal code is optional', () => {
    expect(addressOf({ city: ' თბილისი ', line: ' ჭავჭავაძის 12 ', postalCode: '' })).toEqual({ city: 'თბილისი', line: 'ჭავჭავაძის 12', postalCode: null });
    expect(addressOf({ city: 'თბილისი', line: '   ' })).toBeNull();
    expect(addressOf({ city: '', line: 'ჭავჭავაძის 12' })).toBeNull();
    expect(addressOf(null)).toBeNull();
  });

  it('reads an account row and writes one line for a mail or an order page', () => {
    const address = accountAddress({ addressCity: 'ბათუმი', addressLine: 'რუსთაველის 5', addressPostalCode: null });
    expect(address).toEqual({ city: 'ბათუმი', line: 'რუსთაველის 5', postalCode: null });
    expect(formatAddress(address!)).toBe('რუსთაველის 5, ბათუმი');
    expect(formatAddress({ city: 'თბილისი', line: 'ჭავჭავაძის 12', postalCode: '0179' })).toBe('ჭავჭავაძის 12, თბილისი 0179');
    expect(accountAddress({ addressCity: null, addressLine: null, addressPostalCode: null })).toBeNull();
  });

  it('compares two addresses field by field', () => {
    expect(sameAddress({ city: 'a', line: 'b', postalCode: null }, { city: 'a', line: 'b', postalCode: null })).toBe(true);
    expect(sameAddress({ city: 'a', line: 'b', postalCode: '1' }, { city: 'a', line: 'b', postalCode: null })).toBe(false);
    expect(sameAddress(null, null)).toBe(true);
    expect(sameAddress({ city: 'a', line: 'b', postalCode: null }, null)).toBe(false);
  });
});

describe('resolveContact', () => {
  it('takes the name and the e-mail from the account, whatever the body says', () => {
    const r = resolveContact({ name: 'somebody else', email: 'x@y.z', note: '  ლიფტი არ არის ' }, account(), { needAddress: true });
    expect(r).toMatchObject({ ok: true, customer: { name: 'ნინო', email: 'nino@example.ge', phone: '555 12 34 56', note: 'ლიფტი არ არის' }, keep: null });
    if (r.ok) expect(r.customer.address).toEqual({ city: 'თბილისი', line: 'ჭავჭავაძის 12', postalCode: '0179' });
  });

  it('uses a phone and an address typed for this order over the profile’s', () => {
    const r = resolveContact({ phone: '599 00 00 00', address: { city: 'ქუთაისი', line: 'წერეთლის 3' } }, account(), { needAddress: true });
    expect(r).toMatchObject({ ok: true, customer: { phone: '599 00 00 00', address: { city: 'ქუთაისი', line: 'წერეთლის 3', postalCode: null } }, keep: null });
  });

  it('asks for what the profile does not have', () => {
    expect(resolveContact({}, account({ phone: null }), { needAddress: true })).toEqual({ ok: false, error: 'PHONE_REQUIRED' });
    expect(resolveContact({ phone: '599' }, account({ phone: null }), { needAddress: true })).toEqual({ ok: false, error: 'PHONE_REQUIRED' });
    expect(resolveContact({}, account({ address: null }), { needAddress: true })).toEqual({ ok: false, error: 'ADDRESS_REQUIRED' });
    expect(resolveContact({ address: { city: 'თბილისი' } }, account({ address: null }), { needAddress: true })).toEqual({ ok: false, error: 'ADDRESS_REQUIRED' });
    // A booking may go without one.
    expect(resolveContact({}, account({ address: null }), { needAddress: false })).toMatchObject({ ok: true, customer: { address: null } });
  });

  it('keeps on the account what was typed and asked to be kept — and nothing that is already there', () => {
    const typed = { phone: '599 00 00 00', address: { city: 'თბილისი', line: 'ვაჟა-ფშაველას 1', postalCode: '0186' }, saveAsDefault: true };
    expect(resolveContact(typed, account({ phone: null, address: null }), { needAddress: true })).toMatchObject({
      ok: true,
      keep: { phone: '599 00 00 00', address: { city: 'თბილისი', line: 'ვაჟა-ფშაველას 1', postalCode: '0186' } },
    });
    expect(resolveContact({ ...typed, saveAsDefault: false }, account({ phone: null, address: null }), { needAddress: true })).toMatchObject({ ok: true, keep: null });
    // The profile's own address typed again is nothing new to keep.
    const same = { address: { city: 'თბილისი', line: 'ჭავჭავაძის 12', postalCode: '0179' }, saveAsDefault: true };
    expect(resolveContact(same, account(), { needAddress: true })).toMatchObject({ ok: true, keep: null });
  });

  it('takes a guest’s name, phone and e-mail from the form, and never keeps them anywhere', () => {
    expect(resolveContact({ name: ' გიორგი ', phone: '555 11 22 33', email: '', saveAsDefault: true }, null, { needAddress: false })).toMatchObject({
      ok: true,
      customer: { name: 'გიორგი', phone: '555 11 22 33', email: null, address: null },
      keep: null,
    });
    expect(resolveContact({ phone: '555 11 22 33' }, null, { needAddress: false })).toEqual({ ok: false, error: 'NAME_REQUIRED' });
  });
});
