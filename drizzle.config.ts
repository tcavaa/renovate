import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';
import { databaseSsl, withoutSslParams } from './lib/db/ssl';

config({ path: '.env.local' });
config({ path: '.env' });

// Migrations go through the session pooler or a direct connection when one is given: DDL and
// the migrator's own bookkeeping want a session of their own, which the transaction pooler the
// app uses does not promise.
const url = new URL(withoutSslParams(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/renovate_ge'));

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    // The same switch lib/db honours: TLS verified against the bundled authorities, the
    // provider's own CA, or Supabase's root (`DATABASE_SSL_CA=supabase`).
    ssl: databaseSsl(process.env.DATABASE_SSL, process.env.DATABASE_SSL_CA) || false,
  },
  // The migrator's own table lives in `drizzle`, a schema Supabase's Data API does not expose.
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  verbose: true,
  strict: true,
} satisfies Config;
