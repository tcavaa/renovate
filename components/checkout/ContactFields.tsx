'use client';

import { MapPin, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';
import { formatAddress, type AccountContact, type ContactInput } from '@/lib/account/contact';

/** What the contact block holds while it is being filled in. */
export interface ContactForm {
  /** A guest's; a signed-in person's come from the account. */
  name: string;
  email: string;
  phone: string;
  city: string;
  line: string;
  postalCode: string;
  note: string;
  /** Keep the phone and the address typed here on the account, as its defaults. */
  saveAsDefault: boolean;
  /** The account's phone / address replaced for this order ("change"). */
  changePhone: boolean;
  changeAddress: boolean;
}

/**
 * A fresh form for this account: a guest starts empty; a signed-in person with no phone or no
 * address yet is offered to keep what they type as their default — ticked, since they have none.
 */
export function newContactForm(account: AccountContact | null): ContactForm {
  return {
    name: '',
    email: '',
    phone: '',
    city: '',
    line: '',
    postalCode: '',
    note: '',
    saveAsDefault: !!account && (!account.phone || !account.address),
    changePhone: false,
    changeAddress: false,
  };
}

/** Whether the account's phone / address stands for this order, or a field is asked. */
function asking(form: ContactForm, account: AccountContact | null) {
  return {
    phone: !account?.phone || form.changePhone,
    address: !account?.address || form.changeAddress,
  };
}

/** What the dialogue sends (`contactSchema`): only the fields it asked for; the server fills the rest from the account. */
export function contactBody(form: ContactForm, account: AccountContact | null, options: { address: boolean }): ContactInput {
  if (!account) {
    return { name: form.name, email: form.email || null, phone: form.phone, note: form.note || null };
  }
  const ask = asking(form, account);
  const address = options.address && ask.address ? { city: form.city, line: form.line, postalCode: form.postalCode || null } : null;
  return {
    phone: ask.phone ? form.phone : null,
    address,
    note: form.note || null,
    saveAsDefault: form.saveAsDefault && (ask.phone || !!address),
  };
}

/**
 * Who and where, for a checkout or a booking. A signed-in person is not asked their name or
 * e-mail, nor the phone and the address their profile holds — those stand as a line each, with
 * "change" for an order that goes elsewhere; what is missing is asked, with the offer to keep
 * it as the account's default (`/profile?view=account` edits it later). A guest types a name,
 * a phone and optionally an e-mail. `address` asks for the delivery address (city, street and
 * number, postal code).
 */
export function ContactFields({
  account,
  value,
  onChange,
  address = true,
  noteLabel,
  notePlaceholder,
}: {
  /** The signed-in person's contact; null for a guest. */
  account: AccountContact | null;
  value: ContactForm;
  onChange: (next: ContactForm) => void;
  address?: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
}) {
  const t = useT();
  const c = t.contact;
  const set = (key: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [key]: e.target.value });
  const note = (
    <div className="space-y-1.5">
      <Label htmlFor="co-note">{noteLabel ?? t.market.note}</Label>
      <Textarea id="co-note" rows={2} placeholder={notePlaceholder ?? t.market.notePlaceholder} value={value.note} onChange={set('note')} />
    </div>
  );

  if (!account) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="co-name">{t.market.name}</Label>
          <Input id="co-name" required minLength={2} autoComplete="name" value={value.name} onChange={set('name')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="co-phone">{t.market.phone}</Label>
          <Input id="co-phone" required minLength={5} type="tel" autoComplete="tel" placeholder="+995 5__ __ __ __" value={value.phone} onChange={set('phone')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="co-email">{t.market.email}</Label>
          <Input id="co-email" type="email" autoComplete="email" value={value.email} onChange={set('email')} />
        </div>
        <div className="sm:col-span-2">{note}</div>
      </div>
    );
  }

  const ask = asking(value, account);
  const askAddress = address && ask.address;
  const typing = ask.phone || askAddress;
  // What the tick keeps, in words: the address, the phone, or both.
  const keepLabel = ask.phone && askAddress ? c.keepBoth : askAddress ? c.keepAddress : c.keepPhone;

  return (
    <section className="space-y-3" aria-labelledby="co-contact">
      <h3 id="co-contact" className="text-sm font-semibold text-ink">
        {address ? c.titleDelivery : c.title}
      </h3>
      <div className="divide-y divide-line border border-line bg-bg-surface text-sm">
        {ask.phone ? (
          <div className="space-y-1.5 p-3">
            <Label htmlFor="co-phone">{t.market.phone}</Label>
            <Input id="co-phone" required minLength={5} type="tel" autoComplete="tel" placeholder="+995 5__ __ __ __" value={value.phone} onChange={set('phone')} />
          </div>
        ) : (
          <Stored icon={<Phone className="h-4 w-4" />} label={t.market.phone} text={account.phone ?? ''} change={c.change} onChange={() => onChange({ ...value, changePhone: true, phone: account.phone ?? '' })} />
        )}
        {address &&
          (askAddress ? (
            <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="co-city">{c.city}</Label>
                <Input id="co-city" required autoComplete="address-level2" placeholder={c.cityPlaceholder} value={value.city} onChange={set('city')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-line">{c.line}</Label>
                <Input id="co-line" required autoComplete="street-address" placeholder={c.linePlaceholder} value={value.line} onChange={set('line')} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 sm:max-w-[50%]">
                <Label htmlFor="co-postal">{c.postalCode}</Label>
                <Input id="co-postal" autoComplete="postal-code" inputMode="numeric" value={value.postalCode} onChange={set('postalCode')} />
              </div>
            </div>
          ) : (
            <Stored
              icon={<MapPin className="h-4 w-4" />}
              label={c.deliverTo}
              text={account.address ? formatAddress(account.address) : ''}
              change={c.change}
              onChange={() => onChange({ ...value, changeAddress: true, city: account.address?.city ?? '', line: account.address?.line ?? '', postalCode: account.address?.postalCode ?? '' })}
            />
          ))}
      </div>
      {typing && (
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={value.saveAsDefault} onChange={(e) => onChange({ ...value, saveAsDefault: e.target.checked })} className="mt-0.5 accent-ink" />
          <span>{keepLabel}</span>
        </label>
      )}
      {note}
    </section>
  );
}

/** A line the account already holds: what it is, and the way to give another one for this order. */
function Stored({ icon, label, text, change, onChange }: { icon: React.ReactNode; label: string; text: string; change: string; onChange: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="text-ink-muted" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink-muted">{label}</span>
        <span className="block truncate font-medium text-ink">{text}</span>
      </span>
      <button type="button" onClick={onChange} className="shrink-0 text-xs font-semibold text-ink underline-offset-2 hover:text-brand hover:underline">
        {change}
      </button>
    </div>
  );
}
