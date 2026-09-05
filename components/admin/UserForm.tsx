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

interface Props {
  user: {
    id: number;
    name: string;
    email: string;
    role: 'user' | 'admin';
  };
  isSelf: boolean;
}

export function UserForm({ user, isSelf }: Props) {
  const router = useRouter();
  const ka = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
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
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? 'Error');
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
      setError(json.error ?? 'Error');
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
                onValueChange={(v) => update('role', v as 'user' | 'admin')}
                disabled={isSelf}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{ka.nav.user}</SelectItem>
                  <SelectItem value="admin">{ka.nav.admin}</SelectItem>
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-ink-muted">
                  {ka.admin.forms.selfRoleNote}
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <div>
              {!isSelf && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={remove}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" /> {ka.admin.actions.delete}
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {ka.admin.actions.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
