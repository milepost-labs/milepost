/**
 * Stand-in data for the admin deploy screen (`/admin`).
 *
 * - `FIXTURE_PROTOCOL_CONFIG` is shaped like the `registry.get_config()` read
 *   (fee, treasury, attest + record addresses, admin). Rendered values always
 *   come from the registry first; the fixture is only the labelled sample the
 *   design phase shows while the read resolves.
 * - `FIXTURE_SCHEMAS` is shaped like `attest` schema reads: the options a
 *   deploy must pick from, because the constructor requires the schema to
 *   already exist in attest.
 * - Proposal pre-fill (`/admin?proposal=<base64 JSON>`) is validated as
 *   untrusted input: wrong shape, bad base64, or unknown mode never throws —
 *   it surfaces the design's "damaged link" notice instead.
 */

export interface ProtocolConfigFixture {
  treasury: string;
  feeBps: number;
  attest: string;
  record: string;
  /** Default spend policy new programmes inherit — Config.policy. */
  policy: string;
  admin: string;
}

export const FIXTURE_PROTOCOL_CONFIG: ProtocolConfigFixture = {
  treasury: 'GTREASURYEXAMPLEX4QM7KDA9X2P5R8T1W3Y6ZQ4N7B2V5',
  feeBps: 100,
  attest: 'CATTSTEXAMPLE9KPL4M7Q2W8E5R3T6Y2U9I4O7P3A6S2D5',
  record: 'CRECRDEXAMPLE2HVW8B4N7M1Q5W9E3R6T2Y7U4I1O8P5A3',
  policy: 'CPOLCYEXAMPLE3JQX7B4N1M8Q6W2E9R5T3Y7U1I4O8P5A2XXXXXXXXXX',
  admin: 'GADMINEXAMPLE7QZE4B8N2M6Q1W9E5R3T7Y2U4I6O8P1A3S',
};

export interface SchemaFixture {
  id: string;
  fields: string;
  revocable: boolean;
}

export const FIXTURE_SCHEMAS: SchemaFixture[] = [
  {
    id: 'condition-met/v1',
    fields: 'programme: address, tranche: u32',
    revocable: false,
  },
  {
    id: 'invoice-approved/v1',
    fields: 'programme: address, tranche: u32, invoice_ref: string',
    revocable: true,
  },
];

export type DeployMode = 'Direct' | 'Allocated' | 'Restricted' | 'Open';

export const DEPLOY_MODES: DeployMode[] = ['Direct', 'Allocated', 'Restricted', 'Open'];

const DEPLOY_MODE_SET: ReadonlySet<string> = new Set(DEPLOY_MODES);

export interface ProposalPrefill {
  name: string;
  mode: DeployMode;
  tranches: number;
  contact: string;
  funder: string;
  purpose: string;
  condition: string;
  verifier: string;
  amount: string;
}

/**
 * Parse the `?proposal=` search param as untrusted input.
 *
 * Returns the pre-fill on success, or an object describing why the link could
 * not be read. Never throws: a damaged link is a normal state, not a crash.
 */
export function parseProposalParam(
  raw: string | null,
): { ok: true; proposal: ProposalPrefill } | { ok: false; reason: 'missing' | 'damaged' } {
  if (!raw) return { ok: false, reason: 'missing' };
  try {
    const json = atob(decodeURIComponent(raw));
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'damaged' };
    const record = parsed as Record<string, unknown>;

    const str = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '');

    const modeRaw = str('mode');
    const mode: DeployMode = DEPLOY_MODE_SET.has(modeRaw) ? (modeRaw as DeployMode) : 'Allocated';

    const tranchesRaw = record['tranches'];
    const tranches =
      typeof tranchesRaw === 'number' && Number.isInteger(tranchesRaw) && tranchesRaw >= 1 && tranchesRaw <= 32
        ? tranchesRaw
        : 3;

    return {
      ok: true,
      proposal: {
        name: str('name').slice(0, 200),
        mode,
        tranches,
        contact: str('contact').slice(0, 200),
        funder: str('funder').slice(0, 200),
        purpose: str('purpose').slice(0, 500),
        condition: str('condition').slice(0, 500),
        verifier: str('verifier').slice(0, 200),
        amount: str('amount').slice(0, 100),
      },
    };
  } catch {
    return { ok: false, reason: 'damaged' };
  }
}

/** Quorum must be a whole number from 1 to MAX_QUORUM (16). */
export function quorumError(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return 'Enter a quorum.';
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 16) {
    return 'Quorum must be a whole number from 1 to 16 (MAX_QUORUM).';
  }
  return null;
}

/** Tranches must be a whole number of at least 1. */
export function tranchesError(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return 'Enter the number of tranches.';
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return 'At least one tranche.';
  return null;
}

/** A 32-byte hex schema UID (64 characters, optional 0x prefix). */
export function isHex32Bytes(value: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim());
}
