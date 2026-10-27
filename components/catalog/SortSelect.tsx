'use client';

import { useRouter } from 'next/navigation';

/** A native select that navigates: each option carries the URL the server built for it. */
export function SortSelect({ label, value, options }: { label: string; value: string; options: Array<{ value: string; label: string; href: string }> }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) router.push(next.href);
        }}
        className="h-10 cursor-pointer rounded-full border border-line bg-bg-surface pl-4 pr-3 text-sm text-ink transition-colors hover:border-ink/40 focus:border-ink/40 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
