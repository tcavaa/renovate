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
import { FACEBOOK_ENABLED, GOOGLE_ENABLED, SOCIAL_NO_EMAIL } from '@/lib/auth/social';

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A social login that came back without an e-mail address redirects here with ?error=.
  const socialError = searchParams.get('error') === SOCIAL_NO_EMAIL ? t.auth.socialNoEmail : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (!res || res.error) {
      setError(t.auth.invalidCredentials);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  const registerHref = `/register${callbackUrl !== '/' ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`;

  return (
    <AuthForm
      title={t.auth.loginTitle}
      footer={
        <>
          <span>{t.auth.noAccount}</span>
          <Link href={registerHref} className="bracket-link font-medium text-ink hover:text-brand">
            {t.auth.registerButton}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field id="email" label={t.auth.email}>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
        </Field>
        <Field id="password" label={t.auth.password}>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
        </Field>
        {(error || socialError) && <Notice tone="error">{error ?? socialError}</Notice>}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <Button type="submit" variant="ink" size="lg" className="w-full sm:w-auto sm:min-w-[180px]" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.auth.loginButton}
          </Button>
          <Link href="/forgot-password" className="text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
            {t.auth.forgotPassword}
          </Link>
        </div>
        {/* One row per configured social login; a provider with no keys has no button. */}
        {(GOOGLE_ENABLED || FACEBOOK_ENABLED) && (
          <div className="space-y-3 border-t border-line pt-5">
            <p className="text-center text-xs uppercase tracking-[0.14em] text-ink-faint">{t.auth.orContinueWith}</p>
            {GOOGLE_ENABLED && (
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => signIn('google', { callbackUrl })}>
                {t.auth.googleLogin}
              </Button>
            )}
            {FACEBOOK_ENABLED && (
              <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => signIn('facebook', { callbackUrl })}>
                {t.auth.facebookLogin}
              </Button>
            )}
          </div>
        )}
      </form>
    </AuthForm>
  );
}
