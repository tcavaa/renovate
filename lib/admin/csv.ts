/**
 * One CSV cell, safe to open in a spreadsheet. Quoted when it holds a quote, a comma or a line
 * break; and a text that a spreadsheet would read as a formula (`=`, `+`, `-`, `@`, a tab or a
 * carriage return first — a customer's name is theirs to choose: `=HYPERLINK(…)`) gets a leading
 * apostrophe, so it is shown as the text it is. A number, negative ones too, stays a number.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
