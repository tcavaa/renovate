'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthForm, Field, Notice } from '@/components/auth/AuthForm';
import { useT } from '@/lib/i18n/client';
import { safeCallbackUrl } from '@/lib/auth/safeCallbackUrl';

export default function RegisterPage() {
  const router = useRouter();
  const t = useT();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t.auth.weakPassword);
      return;
    }
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(json.error === 'EMAIL_EXISTS' ? t.auth.emailExists : json.error);
      return;
    }
    const signed = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (signed?.error) {
      setError(t.auth.invalidCredentials);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  const loginHref = `/login${callbackUrl !== '/' ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`;

  return (
    <AuthForm
      title={t.auth.registerTitle}
      footer={
        <>
          <span>{t.auth.haveAccount}</span>
          <Link href={loginHref} className="bracket-link font-medium text-ink hover:text-brand">
            {t.auth.loginButton}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field id="name" label={t.auth.name}>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-12" />
        </Field>
        <Field id="email" label={t.auth.email}>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
        </Field>
        <Field id="password" label={t.auth.password}>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="ink" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.auth.registerButton}
        </Button>
      </form>
    </AuthForm>
  );
}
