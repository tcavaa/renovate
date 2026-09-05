'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';

export default function ForgotPasswordPage() {
  const ka = useT();
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
      setError(apiErrorMessage(ka, json.error));
      setState('idle');
      return;
    }
    setState('sent');
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{ka.auth.forgotTitle}</CardTitle>
        <p className="mt-2 text-sm text-ink-muted">{ka.auth.forgotDesc}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'sent' ? (
          <p className="rounded-md border border-success/30 bg-success/5 px-3 py-3 text-sm">{ka.auth.resetSent}</p>
        ) : (
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
            {error && (
              <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={state === 'sending'}>
              {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
              {ka.auth.sendResetLink}
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-brand hover:underline">
            {ka.auth.backToLogin}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
