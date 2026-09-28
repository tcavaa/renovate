'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { rememberList } from '@/lib/admin/listMemory';

/**
 * Remembers the page's query string as the list's state (`lib/admin/listMemory`), for a list
 * whose controls are links rather than a `FilterBar` (which remembers by itself) — the revenue
 * report's period.
 */
export function RememberList() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    rememberList(pathname, searchParams.toString());
  }, [pathname, searchParams]);
  return null;
}
