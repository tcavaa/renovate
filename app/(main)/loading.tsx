import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    // A screen tall less the header: the footer starts below the fold, so the page arriving in its
    // place does not push a footer the visitor can already see (it was a 0.26 layout shift).
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
    </div>
  );
}
