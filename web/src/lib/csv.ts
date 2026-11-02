// RFC 4180 CSV with spreadsheet formula-injection protection: any text cell
// starting with = + - @ tab or CR is prefixed with an apostrophe, except plain
// E.164 phone numbers ("+919876543210"), which are digits only and harmless.

const FORMULA_START = /^[=+\-@\t\r]/;
const SAFE_PHONE = /^\+\d{6,15}$/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toISOString();

  let text = String(value).replace(/\r?\n|\r/g, ' ');
  if (FORMULA_START.test(text) && !SAFE_PHONE.test(text)) text = `'${text}`;
  return /[",]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',') + '\r\n';
}
