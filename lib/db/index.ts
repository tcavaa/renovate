import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';
import { env } from '@/lib/env';

const globalForDb = globalThis as unknown as {
  pool: mysql.Pool | undefined;
};

/**
 * TLS for a hosted MySQL (`DATABASE_SSL=true`). The certificate is always verified — against
 * Node's bundled authorities, or the provider's own CA from `DATABASE_SSL_CA` — because a
 * connection whose certificate the client will not check is not an encrypted one in any way
 * that matters.
 */
const ssl =
  env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) }
    : undefined;

export const pool =
  globalForDb.pool ??
  mysql.createPool({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

if (env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema, mode: 'default' });
export { schema };
