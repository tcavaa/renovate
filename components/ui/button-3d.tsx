import Link from 'next/link';
import { Box } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The "see it in 3D" button — the one control with real depth. Renders as a link or a
 * button; the icon is always the cube so it reads the same everywhere.
 */
export function Button3d({
  href,
  onClick,
  disabled,
  size = 'md',
  className,
  children,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}) {
  const cls = cn('btn-3d', size === 'sm' ? 'h-9 px-3 text-xs' : size === 'lg' ? 'h-14 px-8 text-base' : 'h-11 px-5 text-sm', className);
  const inner = (
    <>
      <Box className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}
