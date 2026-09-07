'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage, roleLabel } from '@/lib/i18n/labels';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';

interface Props {
  user: {
    id: number;
    name: string;
    email: string;
    role: UserRole;
    storeId: number | null;
    workerId: number | null;
  };
  isSelf: boolean;
  stores: Array<{ id: number; name: string }>;
  workers: Array<{ id: number; name: string; specialty: string }>;
}

/**
 * Name and role, plus — for partner roles — which store or worker the account manages.
 * The link is what the portal keys on, so a `store` account without a store sees nothing.
 */
export function UserForm({ user, isSelf, stores, workers }: Props) {
  const router = useRouter();
  const ka = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
    storeId: user.storeId,
    workerId: user.workerId,
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        role: form.role,
        storeId: form.role === 'store' ? form.storeId : null,
        workerId: form.role === 'worker' ? form.workerId : null,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.refresh();
  };

  const remove = async () => {
    if (!confirm(ka.admin.forms.confirms.deleteUser)) return;
    setLoading(true);
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push('/admin/users');
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{ka.admin.table.name}</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.table.email}</Label>
              <Input value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.role}</Label>
              <Select
                value={form.role}
                onValueChange={(v) => update('role', v as UserRole)}
                disabled={isSelf}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(ka, r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-ink-muted">
                  {ka.admin.forms.selfRoleNote}
                </p>
              )}
            </div>
            {form.role === 'store' && (
              <div className="space-y-2">
                <Label>{ka.admin.forms.partnerStore}</Label>
                <Select value={form.storeId ? String(form.storeId) : 'none'} onValueChange={(v) => update('storeId', v === 'none' ? null : Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{ka.admin.forms.partnerNone}</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-ink-muted">{ka.admin.forms.partnerHint}</p>
              </div>
            )}
            {form.role === 'worker' && (
              <div className="space-y-2">
                <Label>{ka.admin.forms.partnerWorker}</Label>
                <Select value={form.workerId ? String(form.workerId) : 'none'} onValueChange={(v) => update('workerId', v === 'none' ? null : Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{ka.admin.forms.partnerNone}</SelectItem>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name} · {w.specialty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-ink-muted">{ka.admin.forms.partnerHint}</p>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ka.common.save}
            </Button>
            {!isSelf && (
              <Button type="button" variant="ghost" className="text-danger hover:bg-danger/5" onClick={remove} disabled={loading}>
                <Trash2 className="h-4 w-4" />
                {ka.common.delete}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
