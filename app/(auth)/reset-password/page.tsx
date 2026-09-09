'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthForm, Field, Notice } from '@/components/auth/AuthForm';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';

export default function ResetPasswordPage() {
  const t = useT();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t.auth.weakPassword);
    if (password !== confirm) return setError(t.auth.passwordsDiffer);
    setState('sending');
    const res = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: null }));
      setError(json.error === 'INVALID_TOKEN' ? t.auth.invalidToken : apiErrorMessage(t, json.error));
      setState('idle');
      return;
    }
    setState('done');
  };

  return (
    <AuthForm
      title={t.auth.resetTitle}
      footer={
        <Link href="/login" className="bracket-link font-medium text-ink hover:text-brand">
          {state === 'done' ? t.auth.loginButton : t.auth.backToLogin}
        </Link>
      }
    >
      {!token ? (
        <Notice tone="error">{t.auth.invalidToken}</Notice>
      ) : state === 'done' ? (
        <Notice tone="success">{t.auth.resetDone}</Notice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field id="password" label={t.auth.newPassword}>
            <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
          </Field>
          <Field id="confirm" label={t.auth.confirmPassword}>
            <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12" />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="ink" size="lg" className="w-full" disabled={state === 'sending'}>
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.auth.resetButton}
          </Button>
        </form>
      )}
    </AuthForm>
  );
}
