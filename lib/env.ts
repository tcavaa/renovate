import { z } from 'zod';

/**
 * Server environment, validated once at startup.
 *
 * A missing `AUTH_SECRET` used to surface as a 500 on the first login; a wrong `DATABASE_*`
 * as a stack trace on the first query. Now the process refuses to start and says which
 * variable is wrong. Production is strict; development accepts the placeholders from
 * `.env.example` so a fresh clone still boots.
 *
 * Import `env` instead of reading `process.env` in server code. Client code only sees the
 * `NEXT_PUBLIC_*` variables, which Next inlines at build time.
 */

const isProduction = process.env.NODE_ENV === 'production';

const optionalString = z.string().trim().min(1).optional().or(z.literal('').transform(() => undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /**
     * PostgreSQL. Production: Supabase's transaction pooler,
     * `postgresql://<role>.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
     * Development: a local server (`postgresql://localhost:5432/renovate_ge`).
     */
    DATABASE_URL: isProduction
      ? z.string().trim().min(1, 'required in production').url()
      : z.string().trim().url().default('postgresql://localhost:5432/renovate_ge'),
    /**
     * Where migrations and the copy script connect when that should not be the pooler the app
     * uses (Supabase's session pooler, port 5432). Empty: `DATABASE_URL`.
     */
    DATABASE_MIGRATION_URL: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),
    /** TLS to the database — every hosted Postgres, Supabase included, wants it. */
    DATABASE_SSL: z.enum(['true', 'false']).optional(),
    /** The provider's CA certificate (PEM), or `supabase` for Supabase's own root; empty for a public CA. */
    DATABASE_SSL_CA: optionalString,
    /** Connections per server instance; empty: 5 on Vercel, 10 elsewhere. */
    DATABASE_POOL_MAX: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().max(50).optional()),

    AUTH_SECRET: isProduction
      ? z.string().min(32, 'AUTH_SECRET must be at least 32 characters in production')
      : z.string().default('development-only-secret-change-me'),
    AUTH_URL: optionalString,
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    FACEBOOK_CLIENT_ID: optionalString,
    FACEBOOK_CLIENT_SECRET: optionalString,
    ANTHROPIC_API_KEY: optionalString,

    ADMIN_EMAIL: optionalString,
    ADMIN_PASSWORD: optionalString,

    /**
     * Where uploads live (docs/uploads.md): `supabase` (production — Supabase Storage) or `local`
     * (development — `public/uploads`, which a serverless host cannot write to).
     */
    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    /** The Supabase project's URL, `https://<ref>.supabase.co`. */
    SUPABASE_URL: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),
    /** A server-only key (`sb_secret_…`, or the legacy `service_role` JWT): storage writes and signed upload URLs. */
    SUPABASE_SECRET_KEY: optionalString,
    /** The public bucket files are published to, and the private one they arrive in. */
    SUPABASE_PUBLIC_BUCKET: z.string().trim().min(1).default('uploads'),
    SUPABASE_STAGING_BUCKET: z.string().trim().min(1).default('uploads-staging'),

    /** What Vercel Cron sends as `Authorization: Bearer …` to `/api/cron/*`; unset, those routes refuse everyone. */
    CRON_SECRET: optionalString,

    /** `log` writes mail to the log instead of sending it — the development default. */
    MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
    MAIL_FROM: z.string().default('PLAYCE <no-reply@playce.ge>'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: z.enum(['true', 'false']).optional(),

    /**
     * Flitt, the card payments (docs/payments.md). Unset, the platform pays into Flitt's public
     * test merchant (1549901, secret `test`): the sandbox, where nothing is charged. A merchant of
     * one's own takes both; `FLITT_TEST_MODE=false` only once that merchant is live in the portal.
     */
    FLITT_MERCHANT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().default(1549901)),
    FLITT_SECRET_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).default('test')),
    FLITT_TEST_MODE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).default('true')),

    LOG_DIR: optionalString,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),

    /** Sentry; unset, it is off. Validated here, read by `lib/sentry.ts` (the browser needs it too). */
    NEXT_PUBLIC_SENTRY_DSN: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_DRIVER === 'supabase') {
      for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const) {
        if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=supabase' });
      }
    }
    // A read-only disk: the local driver would fail every upload with EROFS.
    if (value.STORAGE_DRIVER === 'local' && process.env.VERCEL) {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'Vercel cannot write to its disk: set STORAGE_DRIVER=supabase' });
    }
    if (value.MAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_PORT'] as const) {
        if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when MAIL_DRIVER=smtp' });
      }
    }
    // A merchant of one's own comes with its own key: the test key on a real merchant (or a
    // real key on the test merchant) is refused by Flitt as an invalid signature, on every payment.
    if ((value.FLITT_MERCHANT_ID === 1549901) !== (value.FLITT_SECRET_KEY === 'test')) {
      ctx.addIssue({ code: 'custom', path: ['FLITT_SECRET_KEY'], message: 'set both FLITT_MERCHANT_ID and FLITT_SECRET_KEY or neither' });
    }
    if (value.FLITT_MERCHANT_ID === 1549901 && value.FLITT_TEST_MODE === 'false') {
      ctx.addIssue({ code: 'custom', path: ['FLITT_TEST_MODE'], message: "Flitt's public test merchant is never live" });
    }
    // A social login is offered only when both halves of its key pair are present: half a
    // pair is a typo, not a configuration, and NextAuth would fail at the redirect instead.
    for (const provider of ['GOOGLE', 'FACEBOOK'] as const) {
      const id = `${provider}_CLIENT_ID` as const;
      const secret = `${provider}_CLIENT_SECRET` as const;
      if ((value[id] ? 1 : 0) + (value[secret] ? 1 : 0) === 1) {
        ctx.addIssue({ code: 'custom', path: [secret], message: `set both ${id} and ${secret} or neither` });
      }
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  // NextAuth reads NEXTAUTH_SECRET as a fallback name; accept it so older .env files work.
  const source = { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET };
  const parsed = schema.safeParse(source);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
}

export const env: Env = load();
