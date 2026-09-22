'use client';

import { useRouter } from 'next/navigation';
import { Sofa } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';

/**
 * "Furniture too?" — asked once on the way to the summary, by whichever step is the last
 * before it (the cart when nothing is laid, the placement otherwise). Furniture is optional
 * here: it can be chosen later, in 3D, room by room.
 */
export function AskFurnitureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 grid h-12 w-12 place-items-center border border-line bg-bg-base text-ink">
            <Sofa className="h-6 w-6" />
          </div>
          <DialogTitle>{t.calculator.furnitureModalTitle}</DialogTitle>
          <DialogDescription>{t.calculator.furnitureModalDesc}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="ink" size="lg" onClick={() => router.push('/calculator/furniture')}>
            {t.calculator.furnitureModalYes}
          </Button>
          <Button variant="outline" size="lg" onClick={() => router.push('/calculator/summary')}>
            {t.calculator.furnitureModalNo}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
