'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';

export default function ResetPasswordPage() {
  const ka = useT();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(ka.auth.weakPassword);
    if (password !== confirm) return setError(ka.auth.passwordsDiffer);
    setState('sending');
    const res = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: null }));
      setError(json.error === 'INVALID_TOKEN' ? ka.auth.invalidToken : apiErrorMessage(ka, json.error));
      setState('idle');
      return;
    }
    setState('done');
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{ka.auth.resetTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!token ? (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-danger">{ka.auth.invalidToken}</p>
        ) : state === 'done' ? (
          <p className="rounded-md border border-success/30 bg-success/5 px-3 py-3 text-sm">{ka.auth.resetDone}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{ka.auth.newPassword}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{ka.auth.confirmPassword}</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={state === 'sending'}>
              {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              {ka.auth.resetButton}
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-brand hover:underline">
            {state === 'done' ? ka.auth.loginButton : ka.auth.backToLogin}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
