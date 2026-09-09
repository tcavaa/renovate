'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';

export interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  note: string;
}

/** Name, phone, e-mail, note — shared by the checkout and the booking dialogs. */
export function CustomerFields({ value, onChange, notePlaceholder }: { value: CustomerForm; onChange: (next: CustomerForm) => void; notePlaceholder?: string }) {
  const t = useT();
  const set = (key: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [key]: e.target.value });
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
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="co-note">{t.market.note}</Label>
        <Textarea id="co-note" rows={2} placeholder={notePlaceholder ?? t.market.notePlaceholder} value={value.note} onChange={set('note')} />
      </div>
    </div>
  );
}
