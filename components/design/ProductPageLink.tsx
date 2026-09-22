'use client';

import { ExternalLink } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * The way from anything that shows a product — the selected piece's card, a fitting's or a
 * door's, a line of the budget — to the product's own page, in a new tab: the real photos,
 * the description, the shop. The studio or the sheet stays exactly where it was.
 */
export function ProductPageLink({ slug, size = 'action', className }: { slug: string; /** A square button like the card's other actions, or a small icon beside a name. */ size?: 'action' | 'inline'; className?: string }) {
  const t = useT();
  return (
    <a
      href={`/catalog/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      title={t.design.productPage}
      aria-label={t.design.productPage}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'no-print shrink-0 transition-colors',
        size === 'action' ? 'grid h-8 w-8 place-items-center rounded-[8px] border border-line bg-white text-ink-soft hover:border-ink hover:text-ink' : 'grid h-5 w-5 place-items-center text-ink-faint hover:text-ink',
        className
      )}
    >
      <ExternalLink className={size === 'action' ? 'h-4 w-4' : 'h-3 w-3'} />
    </a>
  );
}
