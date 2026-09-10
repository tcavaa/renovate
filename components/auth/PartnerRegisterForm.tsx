'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AuthForm, Field, Notice } from '@/components/auth/AuthForm';
import { WorkerServiceFields, type WorkerServiceForm, emptyWorkerService, workerServicePayload } from '@/components/partner/WorkerServiceFields';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';

/**
 * One form for a store and one for a worker, sharing the account fields. A worker's
 * service and price fields are the same ones the partner portal edits later — and the same
 * shape admin's worker form uses — so nothing is entered twice. Both land in the partner
 * portal on success, where the pending notice explains what happens next.
 */
export function PartnerRegisterForm({ kind }: { kind: 'store' | 'worker' }) {
  const router = useRouter();
  const t = useT();
  const [account, setAccount] = useState({ name: '', email: '', password: '' });
  const [store, setStore] = useState({ storeName: '', phone: '', city: '', address: '', websiteUrl: '', description: '' });
  const [service, setService] = useState<WorkerServiceForm>(emptyWorkerService());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (account.password.length < 8) {
      setError(t.auth.weakPassword);
      return;
    }
    setLoading(true);
    const payload =
      kind === 'store'
        ? { kind, ...account, storeName: store.storeName, phone: store.phone || null, city: store.city || null, address: store.address || null, websiteUrl: store.websiteUrl || '', description: store.description || null }
        : { kind, ...account, ...workerServicePayload(service) };
    const res = await fetch('/api/auth/register-partner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(apiErrorMessage(t, json.error));
      return;
    }
    const signed = await signIn('credentials', { email: account.email, password: account.password, redirect: false });
    setLoading(false);
    if (signed?.error) {
      setError(t.auth.invalidCredentials);
      return;
    }
    router.push('/partner');
    router.refresh();
  };

  return (
    <AuthForm
      title={kind === 'store' ? t.auth.registerStoreTitle : t.auth.registerWorkerTitle}
      subtitle={t.auth.pendingNote}
      className="max-w-xl"
      footer={
        <>
          <Link href="/register" className="bracket-link font-medium text-ink hover:text-brand">
            {t.auth.registerAsUser}
          </Link>
          <span>
            {t.auth.haveAccount}{' '}
            <Link href="/login" className="bracket-link font-medium text-ink hover:text-brand">
              {t.auth.loginButton}
            </Link>
          </span>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="eyebrow mb-1">{t.auth.accountSection}</legend>
          <Field id="p-name" label={kind === 'worker' ? t.auth.workerName : t.auth.name}>
            <Input id="p-name" required minLength={2} value={account.name} onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))} className="h-12" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="p-email" label={t.auth.email}>
              <Input id="p-email" type="email" autoComplete="email" required value={account.email} onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))} className="h-12" />
            </Field>
            <Field id="p-password" label={t.auth.password}>
              <Input id="p-password" type="password" autoComplete="new-password" required minLength={8} value={account.password} onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))} className="h-12" />
            </Field>
          </div>
        </fieldset>

        {kind === 'store' ? (
          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="eyebrow mb-1">{t.auth.storeSection}</legend>
            <Field id="s-name" label={t.auth.storeName}>
              <Input id="s-name" required minLength={2} value={store.storeName} onChange={(e) => setStore((s) => ({ ...s, storeName: e.target.value }))} className="h-12" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="s-phone" label={t.admin.forms.phone}>
                <Input id="s-phone" placeholder="+995…" value={store.phone} onChange={(e) => setStore((s) => ({ ...s, phone: e.target.value }))} className="h-12" />
              </Field>
              <Field id="s-city" label={t.admin.forms.city}>
                <Input id="s-city" value={store.city} onChange={(e) => setStore((s) => ({ ...s, city: e.target.value }))} className="h-12" />
              </Field>
              <Field id="s-address" label={t.admin.forms.address}>
                <Input id="s-address" value={store.address} onChange={(e) => setStore((s) => ({ ...s, address: e.target.value }))} className="h-12" />
              </Field>
              <Field id="s-website" label={t.admin.forms.website}>
                <Input id="s-website" type="url" placeholder="https://" value={store.websiteUrl} onChange={(e) => setStore((s) => ({ ...s, websiteUrl: e.target.value }))} className="h-12" />
              </Field>
            </div>
            <Field id="s-description" label={t.admin.forms.description}>
              <Textarea id="s-description" rows={3} value={store.description} onChange={(e) => setStore((s) => ({ ...s, description: e.target.value }))} />
            </Field>
          </fieldset>
        ) : (
          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="eyebrow mb-1">{t.auth.workerSection}</legend>
            <WorkerServiceFields value={service} onChange={setService} />
            <p className="text-xs text-ink-muted">{t.auth.priceHint}</p>
          </fieldset>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="ink" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.auth.registerButton}
        </Button>
      </form>
    </AuthForm>
  );
}
