import type { ConnectionOptions } from 'node:tls';
import { SUPABASE_ROOT_CA_2021 } from './supabaseCa';

/**
 * TLS for a database across the internet (`DATABASE_SSL=true`), shared by the app's pool, the
 * migrator and drizzle-kit. The certificate is always verified — against Node's bundled
 * authorities, the provider's own CA from `DATABASE_SSL_CA`, or Supabase's root with
 * `DATABASE_SSL_CA=supabase` — because a connection whose certificate the client will not check
 * is not an encrypted one in any way that matters.
 */
export function databaseSsl(flag: string | undefined, ca: string | undefined): false | ConnectionOptions {
  if (flag !== 'true') return false;
  const authority = ca === 'supabase' ? SUPABASE_ROOT_CA_2021 : ca;
  return { rejectUnauthorized: true, ...(authority ? { ca: authority } : {}) };
}

const LIBPQ_TLS_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'sslpassword', 'uselibpqcompat'];

/**
 * The connection string without libpq's TLS parameters. node-postgres lets `sslmode=…` in the
 * URL override the `ssl` object it is given — `require` even turns verification off — so the
 * URL carries the address and the credentials, and `DATABASE_SSL*` alone decides about TLS.
 */
export function withoutSslParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of LIBPQ_TLS_PARAMS) parsed.searchParams.delete(name);
    return parsed.toString();
  } catch {
    return url;
  }
}
