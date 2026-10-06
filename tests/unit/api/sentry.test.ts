import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scrubContext, scrubText, sentryOptions } from '@/lib/sentry';

describe('what reaches Sentry', () => {
  it('collects nothing personal on its own', () => {
    const dc = sentryOptions.dataCollection;
    expect(dc.userInfo).toBe(false);
    expect(dc.cookies).toBe(false);
    expect(dc.httpBodies).toEqual([]);
    expect(dc.urlQueryParams).toBe(false);
    expect(dc.databaseQueryData).toBe(false);
    expect(dc.stackFrameVariables).toBe(false);
    expect(dc.httpHeaders.response).toBe(false);
    expect(dc.httpHeaders.request.allow).not.toContain('cookie');
    expect(dc.httpHeaders.request.allow).not.toContain('referer');
  });

  it('takes e-mails and link tokens out of free text', () => {
    expect(scrubText('mail to nini@example.ge failed')).toBe('mail to [email] failed');
    expect(scrubText('Open https://remonti.ge/reset-password?token=abc123def to reset')).toBe(
      'Open https://remonti.ge/reset-password?token=[redacted] to reset'
    );
    expect(scrubText('/api/auth/verify?lang=ka&token=xyz')).toBe('/api/auth/verify?lang=ka&token=[redacted]');
  });

  it('redacts a mail logged with MAIL_DRIVER=log', () => {
    const out = scrubContext({
      to: 'nini@example.ge',
      subject: 'Reset your password',
      text: 'https://remonti.ge/reset-password?token=live-token',
    });
    expect(out).toEqual({ to: '[redacted]', subject: 'Reset your password', text: '[redacted]' });
  });

  it('redacts personal keys, inside objects too, and keeps the rest', () => {
    const out = scrubContext({
      userId: 7,
      email: 'a@b.ge',
      route: 'POST /api/x',
      err: new Error('Duplicate entry a@b.ge for key users.email'),
      payload: { phone: '555', amount: 10, contactEmail: 'c@d.ge' },
      missing: undefined,
    });
    expect(out?.userId).toBe(7);
    expect(out?.email).toBe('[redacted]');
    expect(out?.route).toBe('POST /api/x');
    expect(out?.err).toBe('Error: Duplicate entry [email] for key users.email');
    expect(JSON.parse(String(out?.payload))).toEqual({ phone: '[redacted]', amount: 10, contactEmail: '[redacted]' });
  });

  it('scrubs events and log lines on their way out', () => {
    const event = sentryOptions.beforeSend(
      { type: undefined, message: 'for x@y.ge', exception: { values: [{ value: 'token=abc&x=1 failed' }] }, request: { url: 'https://s/reset-password?token=t' } }
    );
    expect(event?.message).toBe('for [email]');
    expect(event?.exception?.values?.[0]?.value).toBe('token=[redacted]&x=1 failed');
    expect(event?.request?.url).toBe('https://s/reset-password?token=[redacted]');
    const line = sentryOptions.beforeSendLog({ level: 'info', message: 'mail', attributes: { to: 'x@y.ge', subject: 's' } });
    expect(line?.attributes).toEqual({ to: '[redacted]', subject: 's' });
  });
});

describe('the /monitoring tunnel', () => {
  const DSN = 'https://publickey@o123.ingest.sentry.io/456';
  const envelope = (dsn: string, extra = '') => `${JSON.stringify({ dsn, event_id: 'e' })}\n{"type":"event"}\n{}${extra}`;
  const post = (body: string, ip = '198.51.100.1', headers: Record<string, string> = {}) =>
    new Request('http://localhost/monitoring', {
      method: 'POST',
      body,
      headers: { 'x-forwarded-for': ip, cookie: 'authjs.session-token=secret', ...headers },
    });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN);
    fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { 'x-sentry-rate-limits': '60:error' } }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forwards our own envelope to our own project, body only', async () => {
    const { POST } = await import('@/app/monitoring/route');
    const res = await POST(post(envelope(DSN)));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-sentry-rate-limits')).toBe('60:error');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://o123.ingest.sentry.io/api/456/envelope/');
    expect(new Headers(init.headers).get('cookie')).toBeNull();
  });

  it('refuses another project, a missing DSN, junk and oversized bodies', async () => {
    const { POST } = await import('@/app/monitoring/route');
    expect((await POST(post(envelope('https://otherkey@o999.ingest.sentry.io/1'), '198.51.100.2'))).status).toBe(400);
    expect((await POST(post(envelope('https://publickey@o123.ingest.sentry.io/457'), '198.51.100.2'))).status).toBe(400);
    expect((await POST(post('not json\n{}', '198.51.100.2'))).status).toBe(400);
    expect((await POST(post(envelope(DSN, 'x'.repeat(2_000_001)), '198.51.100.2'))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is off without a DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const { POST } = await import('@/app/monitoring/route');
    expect((await POST(post(envelope(DSN), '198.51.100.3'))).status).toBe(404);
  });

  it('rate-limits one address', async () => {
    const { POST } = await import('@/app/monitoring/route');
    let last = 0;
    for (let i = 0; i < 301; i++) last = (await POST(post(envelope(DSN), '198.51.100.4'))).status;
    expect(last).toBe(429);
  });
});
