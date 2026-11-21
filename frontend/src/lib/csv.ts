/**
 * CSV generation for client-side download.
 *
 * Values are escaped per RFC 4180: fields containing commas, quotes or
 * newlines are wrapped in double quotes, and existing double quotes are
 * doubled.
 *
 * Formula injection defense (OWASP):
 * Any text cell whose first character is =, +, -, @, tab (\t), or carriage
 * return (\r) has a single quote (') prepended to prevent spreadsheets from
 * executing the value as a formula.
 *
 * Quoting applies on top of neutralization so the neutralizing single quote
 * remains inside any enclosing double quotes.
 *
 * Amounts that the application formats itself are explicitly marked numeric
 * (via `numericCell` or `{ numeric: true }`) to preserve valid negative numbers.
 * Free-text columns (programme names, descriptions, recipient and payee addresses,
 * and any other third-party influencable strings) default to text and are neutralized.
 *
 * Note on leading whitespace and look-alikes:
 * Per specification scope, only cells starting directly with the target characters
 * (=, +, -, @, \t, \r) are neutralized. Leading whitespace is not stripped, and
 * non-ASCII look-alikes are not normalized.
 */

import type { IndexedAward } from './indexer';
import { STROOPS_PER_UNIT } from './amount';

/**
 * A cell in a CSV row.
 * Can be a primitive string, number, bigint, null, or undefined,
 * or an object explicitly specifying `numeric: true` (or `raw: true`).
 */
export type CsvCell =
  | string
  | number
  | bigint
  | null
  | undefined
  | {
      value: string | number | bigint | null | undefined;
      numeric?: boolean;
      raw?: boolean;
    };

export interface EscapeCsvOptions {
  /** If true, the value is trusted as numeric and formula neutralization is skipped. */
  numeric?: boolean;
  /** Synonym for numeric. */
  raw?: boolean;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Helper to explicitly mark a cell as a trusted numeric value. */
export function numericCell(
  value: string | number | bigint | null | undefined,
): { value: string; numeric: true } {
  return { value: value == null ? '' : String(value), numeric: true };
}

/** Escape a single CSV field with RFC 4180 quoting and formula neutralization. */
export function escapeCsvField(value: CsvCell, options?: EscapeCsvOptions): string {
  let rawStr: string;
  let isNumeric = false;

  if (typeof value === 'object' && value !== null && 'value' in value) {
    rawStr = value.value == null ? '' : String(value.value);
    isNumeric = Boolean(value.numeric || value.raw || options?.numeric || options?.raw);
  } else {
    rawStr = value == null ? '' : String(value);
    isNumeric = Boolean(options?.numeric || options?.raw);
  }

  let text = rawStr;
  if (!isNumeric && FORMULA_START.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/** Build a CSV header or data row. */
export function csvRow(fields: CsvCell[]): string {
  return fields.map((f) => escapeCsvField(f)).join(',');
}

/**
 * Convert IndexedAward data into CSV rows.
 *
 * Amounts are exported both as raw stroops and as formatted decimal units
 * so nothing is lost to rounding. Amounts are marked numeric; recipient,
 * payee, mode, and metadata remain text.
 */
export function awardsToCsv(awards: IndexedAward[], indexedAt: string): string {
  const header = csvRow([
    'Recipient',
    'Granted (stroops)',
    'Granted (units)',
    'Released (stroops)',
    'Released (units)',
    'Tranches',
    'Tranches released',
    'Mode',
    'Payee',
    'Updated ledger',
  ]);

  const rows = awards.map((award) =>
    csvRow([
      award.recipient,
      numericCell(award.granted),
      numericCell(stroopsToUnits(award.granted)),
      numericCell(award.released),
      numericCell(stroopsToUnits(award.released)),
      String(award.tranches),
      String(award.tranchesReleased),
      award.mode,
      award.payee,
      String(award.updatedLedger),
    ]),
  );

  const notice = csvRow([
    `From the advisory public index. Indexed at ${indexedAt}.`,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  return [header, notice, ...rows].join('\n');
}

/** Stroop string to decimal units string (7 decimal places, no trailing zeros). */
function stroopsToUnits(stroops: string): string {
  const value = BigInt(stroops);
  const whole = value / STROOPS_PER_UNIT;
  const fraction = value % STROOPS_PER_UNIT;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(7, '0').replace(/0+$/, '')}`;
}

/**
 * Trigger a browser download of a string as a file.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
