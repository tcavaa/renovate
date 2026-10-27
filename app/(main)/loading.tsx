import { Loader2 } from 'lucide-react';
import { LogoMark } from '@/components/layout/Logo';

export default function Loading() {
  return (
    // A screen tall less the header: the footer starts below the fold, so the page arriving in its
    // place does not push a footer the visitor can already see (it was a 0.26 layout shift).
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center">
      <span className="relative grid h-16 w-16 place-items-center">
        <Loader2 className="absolute inset-0 h-16 w-16 animate-spin text-brand/50" strokeWidth={1.25} />
        <LogoMark tone="sand" className="h-9 w-9" />
      </span>
    </div>
  );
}
