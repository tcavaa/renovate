'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Power, Save, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage, roleLabel } from '@/lib/i18n/labels';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';
import { linkFieldFor } from '@/lib/auth/accounts';
import { generatePassword } from '@/lib/auth/password';
import { cn } from '@/lib/utils';

export interface AccountFormAccount {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  storeId: number | null;
  workerId: number | null;
  teamId: number | null;
  isActive: boolean;
}

interface Props {
  /** Absent: a new account. */
  account?: AccountFormAccount;
  isSelf?: boolean;
  stores: Array<{ id: number; name: string }>;
  workers: Array<{ id: number; name: string; specialty: string }>;
  teams: Array<{ id: number; name: string }>;
}

const SELECT = 'h-10 w-full border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none disabled:bg-bg-base';

/**
 * Admin's account form, for a new account and an existing one. The role is chosen from cards
 * that say what each role does, and a partner role asks for its partner right there — the
 * link is what the portal keys on. A new account's password is set here and shown once, to be
 * handed to its owner; an existing one's can be replaced, and the account switched off (its
 * session ends at its next request) or deleted.
 */
export function AccountForm({ account, isSelf = false, stores, workers, teams }: Props) {
  const t = useT();
  const a = t.accounts;
  const router = useRouter();
  const creating = !account;
  const [form, setForm] = useState({
    name: account?.name ?? '',
    email: account?.email ?? '',
    role: account?.role ?? ('user' as UserRole),
    storeId: account?.storeId ?? null,
    workerId: account?.workerId ?? null,
    teamId: account?.teamId ?? null,
    isActive: account?.isActive ?? true,
    password: '',
    emailVerified: true,
  });
  const [showPassword, setShowPassword] = useState(creating);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<{ id: number; email: string; password: string } | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const linkField = linkFieldFor(form.role);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // A browser without clipboard access: the field is visible and selectable.
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    const links = { storeId: linkField === 'storeId' ? form.storeId : null, workerId: linkField === 'workerId' ? form.workerId : null, teamId: linkField === 'teamId' ? form.teamId : null };
    const body = creating
      ? { name: form.name, email: form.email, password: form.password, role: form.role, ...links, emailVerified: form.emailVerified }
      : {
          name: form.name,
          email: form.email !== account.email ? form.email : undefined,
          role: isSelf ? undefined : form.role,
          ...links,
          isActive: isSelf ? undefined : form.isActive,
          password: form.password || undefined,
        };
    try {
      const res = await fetch(creating ? '/api/users' : `/api/users/${account.id}`, { method: creating ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json()) as { data: { id: number } | null; error: string | null };
      if (!res.ok || !json.data) {
        setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
        return;
      }
      if (creating) {
        setCreated({ id: json.data.id, email: form.email.toLowerCase(), password: form.password });
        return;
      }
      update('password', '');
      setNotice({ ok: true, text: a.saved });
      router.refresh();
    } catch {
      setNotice({ ok: false, text: t.apiErrors.UNKNOWN });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!account || !confirm(a.deleteConfirm)) return;
    setSaving(true);
    const res = await fetch(`/api/users/${account.id}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
      setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
      return;
    }
    router.push('/admin/users');
    router.refresh();
  };

  // The account is made: the one moment its password can be seen, so it is handed over here.
  if (created) {
    return (
      <Card className="border-success/50">
        <CardContent className="space-y-4 p-6">
          <p className="flex items-center gap-2 font-serif text-xl font-semibold text-ink">
            <Check className="h-5 w-5 text-success" />
            {a.created}
          </p>
          <p className="text-sm text-ink-muted">{a.createdHint}</p>
          <dl className="grid gap-2 border border-line bg-bg-base p-4 font-mono text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-muted">{a.email}</dt>
            <dd className="break-all text-ink">{created.email}</dd>
            <dt className="text-ink-muted">{a.password}</dt>
            <dd className="break-all text-ink">{created.password}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => copy(`${created.email}\n${created.password}`)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? a.copied : a.copy}
            </Button>
            <Button asChild variant="ink">
              <Link href={`/admin/users/${created.id}`}>{a.openAccount}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account-name">{a.name}</Label>
            <Input id="account-name" required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-email">{a.email}</Label>
            <Input id="account-email" type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <p className="eyebrow">{a.roleTitle}</p>
            <p className="mt-1 text-sm text-ink-muted">{isSelf ? a.selfNote : a.roleHint}</p>
          </div>
          <div role="radiogroup" aria-label={a.roleTitle} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {USER_ROLES.map((role) => {
              const selected = form.role === role;
              return (
                <button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isSelf}
                  onClick={() => update('role', role)}
                  className={cn('border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60', selected ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink')}
                >
                  <span className="block text-sm font-semibold">{roleLabel(t, role)}</span>
                  <span className={cn('mt-1 block text-xs leading-snug', selected ? 'text-white/80' : 'text-ink-muted')}>{(a.roleHints as Record<string, string>)[role]}</span>
                </button>
              );
            })}
          </div>

          {linkField && (
            <div className="max-w-md space-y-2 border-t border-line pt-4">
              <Label htmlFor="account-link">{linkField === 'storeId' ? a.linkStore : linkField === 'workerId' ? a.linkWorker : a.linkTeam}</Label>
              <select
                id="account-link"
                required
                className={SELECT}
                value={form[linkField] ?? ''}
                onChange={(e) => update(linkField, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{a.linkChoose}</option>
                {linkField === 'storeId' && stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                {linkField === 'workerId' && workers.map((w) => <option key={w.id} value={w.id}>{`${w.name} · ${w.specialty}`}</option>)}
                {linkField === 'teamId' && teams.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <p className="text-xs text-ink-muted">{a.linkHint}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <Label htmlFor="account-password" className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-ink-muted" />
            {creating ? a.password : a.newPassword}
          </Label>
          <div className="flex max-w-xl flex-wrap gap-2">
            <Input
              id="account-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required={creating}
              minLength={8}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              className="min-w-[14rem] flex-1 font-mono"
            />
            <Button type="button" variant="outline" onClick={() => { update('password', generatePassword()); setShowPassword(true); }}>
              {a.generate}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? a.hide : a.show} title={showPassword ? a.hide : a.show}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            {form.password && (
              <Button type="button" variant="ghost" size="icon" onClick={() => copy(form.password)} aria-label={a.copy} title={copied ? a.copied : a.copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-muted">{creating ? a.passwordHint : a.passwordKeep}</p>
          {creating && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.emailVerified} onChange={(e) => update('emailVerified', e.target.checked)} className="h-4 w-4 accent-ink" />
              {a.emailVerified}
            </label>
          )}
        </CardContent>
      </Card>

      {!creating && !isSelf && (
        <Card className={cn(!form.isActive && 'border-danger/40 bg-danger/5')}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="max-w-xl">
              <p className="eyebrow">{a.statusTitle}</p>
              <p className="mt-1 font-semibold text-ink">{form.isActive ? a.active : a.deactivated}</p>
              <p className="mt-1 text-xs text-ink-muted">{a.activeHint}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => update('isActive', !form.isActive)} className={cn(form.isActive ? 'text-danger' : 'text-success')}>
              <Power className="h-4 w-4" />
              {form.isActive ? a.deactivate : a.activate}
            </Button>
          </CardContent>
        </Card>
      )}

      {notice && (
        <p role="status" className={cn('text-sm', notice.ok ? 'text-success' : 'text-danger')}>
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" variant="ink" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : creating ? <UserPlus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {creating ? a.create : t.common.save}
        </Button>
        {!creating && !isSelf && (
          <Button type="button" variant="ghost" className="text-danger hover:bg-danger/5" onClick={remove} disabled={saving}>
            <Trash2 className="h-4 w-4" />
            {a.delete}
          </Button>
        )}
      </div>
    </form>
  );
}
