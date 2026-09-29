'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Loader2, MapPin, Save, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import type { AccountContact } from '@/lib/account/contact';

/**
 * The person's own details (`/profile?view=account`): the name they go by, the phone and the
 * default delivery address a checkout or a booking would otherwise ask for. The e-mail is the
 * sign-in and is shown, not edited. Saved with `PATCH /api/profile`; the page is refreshed so
 * the sidebar's name follows.
 */
export function ProfileForm({ initial }: { initial: AccountContact }) {
  const t = useT();
  const p = t.profile;
  const c = t.contact;
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial.name,
    phone: initial.phone ?? '',
    city: initial.address?.city ?? '',
    line: initial.address?.line ?? '',
    postalCode: initial.address?.postalCode ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    setSaved(false);
  };
  // An address is a city and a street together; one without the other is not saved.
  const addressGiven = form.city.trim() !== '' || form.line.trim() !== '';
  const addressIncomplete = addressGiven && (form.city.trim() === '' || form.line.trim() === '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addressIncomplete) {
      setError(p.addressIncomplete);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: addressGiven ? { city: form.city.trim(), line: form.line.trim(), postalCode: form.postalCode.trim() || null } : null,
        }),
      });
      const json = (await res.json()) as { data: AccountContact | null; error: string | null };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(t, json.error));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError(apiErrorMessage(t, null));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 max-w-2xl space-y-6">
      <p className="text-sm leading-relaxed text-ink-muted">{p.accountLead}</p>

      <section className="space-y-4 rounded-[18px] border border-line bg-bg-surface p-5 md:p-6">
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink">
          <UserRound className="h-5 w-5 text-ink-muted" aria-hidden />
          {p.contactSection}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pf-name">{p.fieldName}</Label>
            <Input id="pf-name" required minLength={2} maxLength={255} autoComplete="name" value={form.name} onChange={set('name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-phone">{t.market.phone}</Label>
            <Input id="pf-phone" type="tel" autoComplete="tel" placeholder="+995 5__ __ __ __" value={form.phone} onChange={set('phone')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pf-email">{p.fieldEmail}</Label>
            <Input id="pf-email" value={initial.email} disabled readOnly />
            <p className="text-xs text-ink-muted">{p.emailFixed}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[18px] border border-line bg-bg-surface p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink">
            <MapPin className="h-5 w-5 text-ink-muted" aria-hidden />
            {p.addressSection}
          </h2>
          {addressGiven && (
            <button
              type="button"
              onClick={() => {
                setForm({ ...form, city: '', line: '', postalCode: '' });
                setSaved(false);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {p.clearAddress}
            </button>
          )}
        </div>
        <p className="text-xs text-ink-muted">{p.addressHint}</p>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="pf-city">{c.city}</Label>
            <Input id="pf-city" autoComplete="address-level2" placeholder={c.cityPlaceholder} value={form.city} onChange={set('city')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-line">{c.line}</Label>
            <Input id="pf-line" autoComplete="street-address" placeholder={c.linePlaceholder} value={form.line} onChange={set('line')} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 sm:max-w-[50%]">
            <Label htmlFor="pf-postal">{c.postalCode}</Label>
            <Input id="pf-postal" autoComplete="postal-code" inputMode="numeric" value={form.postalCode} onChange={set('postalCode')} />
          </div>
        </div>
      </section>

      {error && <p className="border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-4">
        <Button type="submit" variant="ink" size="lg" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? p.saving : t.common.save}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" />
            {p.saved}
          </span>
        )}
      </div>
    </form>
  );
}
