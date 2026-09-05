'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { safeCallbackUrl } from '@/lib/auth/safeCallbackUrl';

export default function LoginPage() {
  const router = useRouter();
  const ka = useT();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (!res || res.error) {
      setError(ka.auth.invalidCredentials);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{ka.auth.loginTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{ka.auth.email}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{ka.auth.password}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {ka.auth.loginButton}
          </Button>
        </form>

        {process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true' && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => signIn('google', { callbackUrl })}
          >
            {ka.auth.googleLogin}
          </Button>
        )}

        <p className="text-center text-sm text-ink-muted">
          {ka.auth.noAccount}{' '}
          <Link
            href={`/register${
              callbackUrl !== '/' ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''
            }`}
            className="font-medium text-brand hover:underline"
          >
            {ka.auth.registerButton}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
