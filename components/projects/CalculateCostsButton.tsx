'use client';

import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calculatorEntryHref } from '@/lib/calculator/steps';
import { useT } from '@/lib/i18n/client';
import type { SavedProjectInput } from '@/lib/projects/saved';

/**
 * Opens a project in the calculator — a link to its entry (`/calculator/<id>`), which opens the
 * calculation where it was left. A project designed first has none yet: the entry starts one
 * from the design's rooms and products (`ProjectGate` → `loadCalculatorHalf`), and its saves
 * write into the same row, so the design gets its renovation costs and stays one project.
 *
 * A calculation the project already has always opens; one that would be made from the design
 * needs rooms to be made from.
 */
export function CalculateCostsButton({ project, size = 'md', className }: { project: Pick<SavedProjectInput, 'id' | 'rooms' | 'hasCalculator'>; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = useT();
  const buttonSize = size === 'md' ? 'default' : size;
  const label = (
    <>
      <Calculator className="h-4 w-4" />
      {project.hasCalculator ? t.profile.openInCalculator : t.profile.calculateCosts}
    </>
  );
  if (!project.hasCalculator && project.rooms.length === 0) {
    return (
      <Button type="button" variant="outline" size={buttonSize} className={className} disabled>
        {label}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size={buttonSize} className={className}>
      <Link href={calculatorEntryHref(project.id)}>{label}</Link>
    </Button>
  );
}
