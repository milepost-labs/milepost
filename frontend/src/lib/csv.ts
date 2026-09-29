/**
 * CSV generation for client-side download.
 *
 * Values are escaped per RFC 4180: fields containing commas, quotes or
 * newlines are wrapped in double quotes, and existing double quotes are
 * doubled.
 */

import type { IndexedAward } from './indexer';
import { STROOPS_PER_UNIT } from './amount';

/** Escape a single CSV field. */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** Build a CSV header row. */
export function csvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Convert IndexedAward data into CSV rows.
 *
 * Amounts are exported both as raw stroops and as formatted decimal units
 * so nothing is lost to rounding.
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
      award.granted,
      stroopsToUnits(award.granted),
      award.released,
      stroopsToUnits(award.released),
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
