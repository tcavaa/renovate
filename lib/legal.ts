import { fill } from '@/lib/admin/list';
import type { Dictionary } from '@/lib/i18n';

/**
 * The legal pages (terms, privacy, refund): numbered sections in the dictionary (`s1Title`,
 * `s1Body`, …) and the company's details the payment provider and the banks expect on them —
 * the legal name, the identification code and the legal address (`footer.company_name`, …,
 * filled in by the business; docs/payments.md).
 */

export interface CompanyDetails {
  company: string;
  companyId: string;
  legalAddress: string;
}

export function companyDetails(t: Dictionary): CompanyDetails {
  return { company: t.footer.company_name, companyId: t.footer.company_id, legalAddress: t.footer.legal_address };
}

/** Sections 1…count of a legal page, with `{company}`, `{companyId}` and `{legalAddress}` filled in. */
export function legalSections(page: object, count: number, details: CompanyDetails): Array<{ title: string; body: string }> {
  const text = page as Record<string, string | undefined>;
  const values: Record<string, string> = { ...details };
  const out: Array<{ title: string; body: string }> = [];
  for (let i = 1; i <= count; i++) {
    const title = text[`s${i}Title`];
    const body = text[`s${i}Body`];
    if (title && body) out.push({ title, body: fill(body, values) });
  }
  return out;
}
