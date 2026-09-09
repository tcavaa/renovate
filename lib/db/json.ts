import { customType } from 'drizzle-orm/mysql-core';

/**
 * MariaDB stores JSON as LONGTEXT, so mysql2 hands these columns back as strings and drizzle's
 * built-in json() passes the string through unparsed. Consumers expect the parsed value
 * (arrays for styleTags/tags, objects for rooms/scene), so parse once, here, on read.
 * On real MySQL the driver already returns an object, so fromDriver is a no-op there.
 */
export const json = <TData = unknown>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'json';
    },
    toDriver(value: TData): string {
      return JSON.stringify(value);
    },
    fromDriver(value: unknown): TData {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as TData;
        } catch {
          return value as TData;
        }
      }
      return value as TData;
    },
  })(name);
