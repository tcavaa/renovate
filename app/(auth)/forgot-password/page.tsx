'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthForm, Field, Notice } from '@/components/auth/AuthForm';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState('sending');
    const res = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: null }));
      setError(apiErrorMessage(t, json.error));
      setState('idle');
      return;
    }
    setState('sent');
  };

  return (
    <AuthForm
      title={t.auth.forgotTitle}
      subtitle={t.auth.forgotDesc}
      footer={
        <Link href="/login" className="bracket-link font-medium text-ink hover:text-brand">
          {t.auth.backToLogin}
        </Link>
      }
    >
      {state === 'sent' ? (
        <Notice tone="success">{t.auth.resetSent}</Notice>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field id="email" label={t.auth.email}>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="ink" size="lg" className="w-full" disabled={state === 'sending'}>
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.auth.sendResetLink}
          </Button>
        </form>
      )}
    </AuthForm>
  );
}
