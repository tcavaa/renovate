import { Box, Calculator } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Which halves a project has: a calculation, a 3D design, or both. The same two tags on the
 * profile list, the project page and the admin list, so nobody has to guess from a name.
 * A half the project does not have is shown faint and dashed rather than hidden, so the
 * two tags always sit in the same place.
 */
export function ProjectKindTags({ t, kind, className }: { t: Dictionary; kind: { hasCalculator: boolean; hasDesign: boolean }; className?: string }) {
  const tag = 'inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]';
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span className={cn(tag, kind.hasCalculator ? 'border-ink text-ink' : 'border-dashed border-line text-ink-faint')}>
        <Calculator className="h-3 w-3" />
        {t.profile.tagCalculator}
      </span>
      <span className={cn(tag, kind.hasDesign ? 'border-ink text-ink' : 'border-dashed border-line text-ink-faint')}>
        <Box className="h-3 w-3" />
        {t.profile.tagDesign}
      </span>
    </span>
  );
}
