import { asc as ascending, Column, desc as descending, sql, type SQL } from 'drizzle-orm';

/**
 * `asc` / `desc` with NULL as the smallest value, as the app has always sorted (MySQL's order).
 * Postgres takes NULL as the largest: "last sign-in, newest first" would have listed the people
 * who never signed in on top, and "rating, best first" the unrated. A column that cannot be NULL
 * sorts exactly as drizzle's own (so an index still serves it); anything else — a nullable
 * column, an aggregate — gets `NULLS FIRST` going up and `NULLS LAST` going down.
 *
 * Import these instead of drizzle-orm's in queries (docs/data-model.md#rules-for-working-with-the-data).
 */
type Sortable = Column | SQL | SQL.Aliased;

const notNull = (value: Sortable): boolean => value instanceof Column && value.notNull;

export function asc(value: Sortable): SQL {
  return notNull(value) ? ascending(value) : sql`${value} asc nulls first`;
}

export function desc(value: Sortable): SQL {
  return notNull(value) ? descending(value) : sql`${value} desc nulls last`;
}
