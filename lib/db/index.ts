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

/**
 * Every connection talks UTC. Drizzle writes and reads `timestamp` columns as UTC strings, but
 * MySQL fills `DEFAULT (now())` and `ON UPDATE` in the session's time zone and converts every
 * TIMESTAMP to it on the way out: on a server that is not on UTC (a laptop in Tbilisi, +04) a
 * row's `createdAt` came back four hours late while every time the app set itself (`viewedAt`,
 * `sentAt`, `lastLoginAt`) was right — an order "placed" after it was "sent". With the session
 * on UTC both are the same clock. (Rows written before this on such a server keep their skew.)
 */
function createPool(): mysql.Pool {
  const created = mysql.createPool({
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
  created.on('connection', (connection) => {
    // mysql2 forwards the core pool's event as it is: the connection is the callback-style one,
    // whatever the typings say. A failed SET leaves the session as it was before this existed.
    (connection as unknown as { query: (sql: string, done: (err: Error | null) => void) => void }).query("SET time_zone = '+00:00'", () => undefined);
  });
  return created;
}

export const pool = globalForDb.pool ?? createPool();

if (env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema, mode: 'default' });
export { schema };
