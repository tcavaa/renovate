'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckoutDialog, type CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { useLocale, useT } from '@/lib/i18n/client';
import type { SavedProjectInput } from '@/lib/projects/saved';

/**
 * Orders a saved project from its page — no need to walk back through a summary. The
 * dialog is the same one the summaries open, built from the row as saved: the calculator's
 * picks when it has a calculation, the studio's products when it has a design. Whatever an
 * earlier sitting already charged or sent is shown as such and not repeated.
 */
export function OrderProjectButton({ project, size = 'lg', className }: { project: SavedProjectInput; size?: 'sm' | 'lg'; className?: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const fees = usePlatformFees();
  const [open, setOpen] = useState(false);

  const parts = useMemo<CheckoutPart[]>(() => {
    const list: CheckoutPart[] = [];
    if (project.hasCalculator) list.push(calculatorCheckoutPart(project.rooms, project.selectedProducts, project.selectedFurniture, fees.calculatorFeePerM2, locale));
    if (project.hasDesign && project.plan && project.scene) {
      const design = designCheckoutPart(project.plan, project.scene.items, project.scene.finishes, fees.designFeePerM2, locale);
      if (design) list.push(design);
    }
    return list;
  }, [project, fees.calculatorFeePerM2, fees.designFeePerM2, locale]);

  if (parts.length === 0) return null;

  return (
    <>
      <Button type="button" variant="ink" size={size} className={className} onClick={() => setOpen(true)}>
        <ShoppingBag className="h-4 w-4" />
        {t.market.checkout}
      </Button>
      <CheckoutDialog open={open} onOpenChange={setOpen} saveProject={async () => project.id} projectId={project.id} parts={parts} onOrdered={() => router.refresh()} />
    </>
  );
}
