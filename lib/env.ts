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

    DATABASE_HOST: z.string().min(1).default('localhost'),
    DATABASE_PORT: z.coerce.number().int().positive().default(3306),
    DATABASE_USER: z.string().min(1).default('root'),
    DATABASE_PASSWORD: z.string().default(''),
    DATABASE_NAME: z.string().min(1).default('renovate_ge'),

    AUTH_SECRET: isProduction
      ? z.string().min(32, 'AUTH_SECRET must be at least 32 characters in production')
      : z.string().default('development-only-secret-change-me'),
    AUTH_URL: optionalString,
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    ANTHROPIC_API_KEY: optionalString,

    ADMIN_EMAIL: optionalString,
    ADMIN_PASSWORD: optionalString,

    /** Where uploads live. `s3` also covers Cloudflare R2 and any S3-compatible store. */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    S3_BUCKET: optionalString,
    S3_REGION: optionalString,
    S3_ENDPOINT: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    /** Public base URL for uploaded files when they are served by the bucket or a CDN. */
    S3_PUBLIC_URL: optionalString,

    /** `log` writes mail to the log instead of sending it — the development default. */
    MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
    MAIL_FROM: z.string().default('რემონტი.ge <no-reply@remonti.ge>'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: z.enum(['true', 'false']).optional(),

    LOG_DIR: optionalString,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  })
  .superRefine((value, ctx) => {
    if (isProduction && !value.DATABASE_PASSWORD) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_PASSWORD'], message: 'required in production' });
    }
    if (value.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=s3' });
      }
    }
    if (value.MAIL_DRIVER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_PORT'] as const) {
        if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when MAIL_DRIVER=smtp' });
      }
    }
    if ((value.GOOGLE_CLIENT_ID ? 1 : 0) + (value.GOOGLE_CLIENT_SECRET ? 1 : 0) === 1) {
      ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_SECRET'], message: 'set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET or neither' });
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
