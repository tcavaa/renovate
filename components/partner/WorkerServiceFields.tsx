'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/lib/i18n/client';
import { workerSpecialtyLabel } from '@/lib/i18n/labels';
import { slugify } from '@/lib/utils';

/** The specialties the directory already knows; anything else is typed in and gets a slug. */
export const KNOWN_SPECIALTIES = ['tiling', 'painting', 'plumbing', 'electrical', 'carpentry', 'plastering'] as const;
const OTHER = '__other__';

export interface WorkerServiceForm {
  specialtySlug: string;
  /** Free text when the specialty is not one of the known ones. */
  specialtyCustom: string;
  priceUnit: 'm2' | 'unit' | 'fixed';
  pricePerM2: string;
  pricePerUnit: string;
  phone: string;
  city: string;
  experienceYears: string;
  bio: string;
}

export function emptyWorkerService(): WorkerServiceForm {
  return { specialtySlug: 'tiling', specialtyCustom: '', priceUnit: 'm2', pricePerM2: '', pricePerUnit: '', phone: '', city: '', experienceYears: '', bio: '' };
}

/** The form's fields as `workerServiceSchema` expects them; `specialty` comes from the label or the custom text. */
export function workerServicePayload(form: WorkerServiceForm, labelOf?: (slug: string) => string) {
  const known = (KNOWN_SPECIALTIES as readonly string[]).includes(form.specialtySlug);
  const specialty = known ? (labelOf?.(form.specialtySlug) ?? form.specialtySlug) : form.specialtyCustom.trim();
  const slug = known ? form.specialtySlug : slugify(form.specialtyCustom).replace(/[^a-z0-9-]/g, '') || 'other';
  return {
    specialty: specialty || slug,
    specialtySlug: slug,
    priceUnit: form.priceUnit,
    pricePerM2: form.priceUnit === 'm2' && form.pricePerM2 ? Number(form.pricePerM2) : null,
    pricePerUnit: form.priceUnit === 'unit' && form.pricePerUnit ? Number(form.pricePerUnit) : null,
    phone: form.phone || null,
    city: form.city || null,
    experienceYears: form.experienceYears ? Number(form.experienceYears) : null,
    bio: form.bio || null,
  };
}

/**
 * A worker's service and price — the same fields at registration and in the partner
 * portal, and the same logic admin's worker form uses: one specialty, priced per m², per
 * job or by agreement.
 */
export function WorkerServiceFields({ value, onChange }: { value: WorkerServiceForm; onChange: (next: WorkerServiceForm) => void }) {
  const t = useT();
  const update = <K extends keyof WorkerServiceForm>(key: K, v: WorkerServiceForm[K]) => onChange({ ...value, [key]: v });
  const known = (KNOWN_SPECIALTIES as readonly string[]).includes(value.specialtySlug);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="eyebrow">{t.admin.forms.specialty}</Label>
        <Select value={known ? value.specialtySlug : OTHER} onValueChange={(v) => update('specialtySlug', v === OTHER ? '' : v)}>
          <SelectTrigger className="h-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KNOWN_SPECIALTIES.map((slug) => (
              <SelectItem key={slug} value={slug}>
                {workerSpecialtyLabel(t, slug)}
              </SelectItem>
            ))}
            <SelectItem value={OTHER}>{t.auth.specialtyOther}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!known && (
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.auth.specialtyOther}</Label>
          <Input required value={value.specialtyCustom} onChange={(e) => update('specialtyCustom', e.target.value)} className="h-12" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="eyebrow">{t.admin.forms.priceUnit}</Label>
        <Select value={value.priceUnit} onValueChange={(v) => update('priceUnit', v as WorkerServiceForm['priceUnit'])}>
          <SelectTrigger className="h-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="m2">{t.admin.forms.priceUnits.m2}</SelectItem>
            <SelectItem value="unit">{t.admin.forms.priceUnits.unit}</SelectItem>
            <SelectItem value="fixed">{t.admin.forms.priceUnits.fixed}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.priceUnit === 'm2' && (
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.admin.forms.pricePerM2}</Label>
          <Input type="number" step="0.01" min={0} value={value.pricePerM2} onChange={(e) => update('pricePerM2', e.target.value)} className="h-12" />
        </div>
      )}
      {value.priceUnit === 'unit' && (
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.admin.forms.pricePerPiece}</Label>
          <Input type="number" step="0.01" min={0} value={value.pricePerUnit} onChange={(e) => update('pricePerUnit', e.target.value)} className="h-12" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="eyebrow">{t.admin.forms.phone}</Label>
        <Input placeholder="+995…" value={value.phone} onChange={(e) => update('phone', e.target.value)} className="h-12" />
      </div>
      <div className="space-y-1.5">
        <Label className="eyebrow">{t.admin.forms.city}</Label>
        <Input value={value.city} onChange={(e) => update('city', e.target.value)} className="h-12" />
      </div>
      <div className="space-y-1.5">
        <Label className="eyebrow">{t.admin.forms.experienceYears}</Label>
        <Input type="number" min={0} max={80} value={value.experienceYears} onChange={(e) => update('experienceYears', e.target.value)} className="h-12" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="eyebrow">{t.admin.forms.bio}</Label>
        <Textarea rows={3} value={value.bio} onChange={(e) => update('bio', e.target.value)} />
      </div>
    </div>
  );
}
