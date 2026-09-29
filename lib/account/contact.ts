/**
 * A person's contact as an order needs it — who, which phone, where to — and the rule that
 * builds it from what the account already holds and what the dialogue asked for. Pure, so
 * the checkout, the booking and their tests share it.
 *
 * A signed-in person is never asked their name or e-mail (the account has them), nor their
 * phone or address when their profile holds one: the checkout and the booking ask only for
 * what is missing, and offer to keep what was typed as the account's default
 * (`saveAsDefault`). A guest (a brigade booked from its public page) types all of it.
 */

/** A delivery address: the city, the street and number (flat, floor…), the postal code if known. */
export interface DeliveryAddress {
  city: string;
  line: string;
  postalCode: string | null;
}

/** What an account holds of its contact (`users` row: name, e-mail, phone, default address). */
export interface AccountContact {
  name: string;
  email: string;
  phone: string | null;
  address: DeliveryAddress | null;
}

/** Who an order is for and where it goes, as written on the checkout, the orders and the mails. */
export interface CustomerContact {
  name: string;
  phone: string;
  email: string | null;
  note: string | null;
  address: DeliveryAddress | null;
}

/** What a checkout or a booking dialogue sends: only the fields it had to ask for. */
export interface ContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: { city?: string | null; line?: string | null; postalCode?: string | null } | null;
  note?: string | null;
  /** Keep the phone and the address typed here on the account, as its defaults. */
  saveAsDefault?: boolean;
}

const clean = (value: string | null | undefined): string => (value ?? '').trim();

/** An address with both a city and a street, or none — a half-filled one is no address. */
export function addressOf(value: { city?: string | null; line?: string | null; postalCode?: string | null } | null | undefined): DeliveryAddress | null {
  if (!value) return null;
  const city = clean(value.city);
  const line = clean(value.line);
  if (!city || !line) return null;
  const postalCode = clean(value.postalCode);
  return { city, line, postalCode: postalCode || null };
}

/** The account's default address from its row's three columns. */
export function accountAddress(row: { addressCity: string | null; addressLine: string | null; addressPostalCode: string | null }): DeliveryAddress | null {
  return addressOf({ city: row.addressCity, line: row.addressLine, postalCode: row.addressPostalCode });
}

/** One line for a list, a mail or an order page: "Chavchavadze Ave 12, Tbilisi 0179". */
export function formatAddress(address: DeliveryAddress): string {
  return `${address.line}, ${address.city}${address.postalCode ? ` ${address.postalCode}` : ''}`;
}

/** The three columns an address is kept in, on an account, a checkout or an order. */
export function addressColumns(address: DeliveryAddress | null) {
  return { city: address?.city ?? null, line: address?.line ?? null, postalCode: address?.postalCode ?? null };
}

export type ContactError = 'NAME_REQUIRED' | 'PHONE_REQUIRED' | 'ADDRESS_REQUIRED';

export type ResolvedContact =
  | {
      ok: true;
      customer: CustomerContact;
      /** What to write onto the account afterwards — only what was typed here and asked to be kept. */
      keep: { phone?: string; address?: DeliveryAddress } | null;
    }
  | { ok: false; error: ContactError };

/**
 * The contact an order is placed with. The account's name and e-mail always win for a
 * signed-in person — the dialogue does not ask for them, and a field forged into the body
 * cannot put somebody else's name on an order. The phone and the address are the ones typed
 * (a different address for this order) or else the account's; `needAddress` makes one
 * required (a store has to deliver somewhere). A guest must give a name and a phone.
 */
export function resolveContact(input: ContactInput, account: AccountContact | null, options: { needAddress: boolean }): ResolvedContact {
  const typedPhone = clean(input.phone);
  const typedAddress = addressOf(input.address);
  const phone = typedPhone || account?.phone || '';
  const address = typedAddress ?? account?.address ?? null;
  const name = account ? account.name : clean(input.name);
  const email = account ? account.email : clean(input.email) || null;
  if (!name || name.length < 2) return { ok: false, error: 'NAME_REQUIRED' };
  if (phone.length < 5) return { ok: false, error: 'PHONE_REQUIRED' };
  if (options.needAddress && !address) return { ok: false, error: 'ADDRESS_REQUIRED' };
  const keep: { phone?: string; address?: DeliveryAddress } = {};
  if (account && input.saveAsDefault) {
    if (typedPhone && typedPhone !== account.phone) keep.phone = typedPhone;
    if (typedAddress && !sameAddress(typedAddress, account.address)) keep.address = typedAddress;
  }
  return {
    ok: true,
    customer: { name, phone, email, note: clean(input.note) || null, address },
    keep: keep.phone || keep.address ? keep : null,
  };
}

export function sameAddress(a: DeliveryAddress | null, b: DeliveryAddress | null): boolean {
  if (!a || !b) return a === b;
  return a.city === b.city && a.line === b.line && (a.postalCode ?? null) === (b.postalCode ?? null);
}
