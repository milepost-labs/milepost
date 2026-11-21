import { Buffer } from 'buffer';
import { looksLikeAddress, looksLikeContractId } from './format';
import { tryParseAmount } from './amount';
import { METADATA_SCHEMA_VERSION, type AddressLabel, type ProgrammeMetadata } from './metadata';

/**
 * The rules `registry.create` and the programme constructor enforce, checked
 * where each value is entered so nothing is signed only to be refused.
 * Mirrors `__constructor` in `contracts/program/src/lib.rs`:
 *
 * - deadlines in the future and strictly ordered apply < review < release < sweep
 * - at least one reviewer and one verifier
 * - quorum 1–16 (`MAX_QUORUM`) and no more than the reviewer count
 * - at least one tranche
 * - minimum award 0, or at least one stroop per tranche
 * - the schema exists, and if restricted its authority is a verifier
 */

export const MAX_QUORUM = 16;

export interface DeployDraft {
  name: string;
  /** The asset contract, `C…`. */
  token: string;
  /** Minimum award as typed, in the asset's units. Empty means none. */
  minAward: string;
  tranches: number;
  /** 64-character hex, or empty. */
  schema: string;
  /** 64-character hex, or empty for none. Used only when no description is published. */
  metadataHash: string;
  /** Publish a description to the metadata store and commit its hash. */
  describe: boolean;
  description: string;
  /** One of `VERTICALS`. */
  vertical: string;
  contactName: string;
  contactEmail: string;
  /** The creator's names for reviewer and verifier addresses. Empty means unnamed. */
  labels: Record<string, string>;
  reviewers: string[];
  verifiers: string[];
  quorum: number;
  applyDeadline: number | null;
  reviewDeadline: number | null;
  releaseDeadline: number | null;
  sweepDeadline: number | null;
}

/** What is known about the chosen schema, from `attest.get_schema`. */
export interface SchemaFacts {
  restricted: boolean;
  authority: string;
}

export const DEADLINES = [
  { key: 'applyDeadline', label: 'Applications close', help: 'Contributions and applications until then.' },
  { key: 'reviewDeadline', label: 'Review ends', help: 'Votes and finalizing happen before this.' },
  { key: 'releaseDeadline', label: 'Release window ends', help: 'After this, unreleased money becomes refundable.' },
  { key: 'sweepDeadline', label: 'Sweep date', help: 'Refunds nobody claimed go to the treasury after this.' },
] as const;

export type DeadlineKey = (typeof DEADLINES)[number]['key'];

const HEX_32 = /^(0x)?[0-9a-fA-F]{64}$/;

export function cleanHex(value: string): string {
  return value.trim().replace(/^0x/i, '').toLowerCase();
}

export function isHex32(value: string): boolean {
  return HEX_32.test(value.trim());
}

/** Addresses pasted one per line or comma-separated, trimmed, blanks dropped. */
export function splitAddresses(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Adds pasted addresses to a list. Returns the new list and, when something
 * could not be added, why: the first malformed entry, or that all were
 * already listed.
 */
export function addAddresses(list: string[], text: string): { list: string[]; error: string | null } {
  const incoming = splitAddresses(text);
  if (incoming.length === 0) return { list, error: 'Enter a Stellar address.' };
  const bad = incoming.find((a) => !looksLikeAddress(a));
  if (bad) return { list, error: `${bad.length > 14 ? `${bad.slice(0, 12)}…` : bad} is not a Stellar address.` };
  const next = [...list];
  for (const a of incoming) if (!next.includes(a)) next.push(a);
  if (next.length === list.length) return { list, error: 'Already listed.' };
  return { list: next, error: null };
}

/** The minimum award in stroops, or why it cannot be used. */
export function parseMinAward(input: string, tranches: number): { ok: true; value: bigint } | { ok: false; error: string } {
  // Blank or zero means no minimum; parseAmount refuses zero for amounts sent.
  if (/^\s*0*(\.0*)?\s*$/.test(input)) return { ok: true, value: 0n };
  const parsed = tryParseAmount(input);
  if (!parsed.ok) return parsed;
  if (parsed.value > 0n && parsed.value < BigInt(tranches)) {
    return { ok: false, error: 'Too small to split into tranches. Use 0 for no minimum.' };
  }
  return parsed;
}

/** Errors for the Details step, by field. `schemaFound` is null while it is being read. */
export function detailsErrors(
  draft: DeployDraft,
  checks: { tokenKnown: boolean | null; schemaFound: boolean | null },
): Partial<
  Record<'name' | 'token' | 'minAward' | 'schema' | 'metadataHash' | 'description' | 'vertical' | 'contactName' | 'contactEmail', string>
> {
  const errors: ReturnType<typeof detailsErrors> = {};
  if (draft.name.trim() === '') errors.name = 'Give the programme a name.';
  if (!looksLikeContractId(draft.token.trim())) errors.token = 'Enter the asset’s contract address (starts with C).';
  else if (checks.tokenKnown === false) errors.token = 'That contract does not answer as a token.';
  else if (checks.tokenKnown === null) errors.token = 'Reading the asset…';
  const min = parseMinAward(draft.minAward, draft.tranches);
  if (!min.ok) errors.minAward = min.error;
  if (!isHex32(draft.schema)) errors.schema = 'Enter the schema id: 64 hex characters.';
  else if (checks.schemaFound === false) errors.schema = 'No schema with this id exists. Register it first.';
  else if (checks.schemaFound === null) errors.schema = 'Checking the schema…';
  if (draft.describe) {
    if (draft.description.trim() === '') errors.description = 'Describe what the programme funds.';
    else if (draft.description.length > 2000) errors.description = 'Keep the description under 2,000 characters.';
    if (draft.vertical.trim() === '') errors.vertical = 'Choose a sector.';
    if (draft.contactName.trim() === '') errors.contactName = 'Say who stands behind the programme.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim())) errors.contactEmail = 'Enter a contact email address.';
  } else if (draft.metadataHash.trim() !== '' && !isHex32(draft.metadataHash)) {
    errors.metadataHash = 'Enter 64 hex characters, or leave it empty.';
  }
  return errors;
}

/** Errors for the People step. */
export function peopleErrors(
  draft: DeployDraft,
  schema: SchemaFacts | null,
): Partial<Record<'reviewers' | 'quorum' | 'verifiers', string>> {
  const errors: ReturnType<typeof peopleErrors> = {};
  if (draft.reviewers.length === 0) errors.reviewers = 'Add at least one reviewer.';
  if (draft.quorum < 1 || draft.quorum > MAX_QUORUM) errors.quorum = `Quorum must be 1 to ${MAX_QUORUM}.`;
  else if (draft.reviewers.length > 0 && draft.quorum > draft.reviewers.length) {
    errors.quorum = `Quorum can’t be more than your ${draft.reviewers.length} reviewer${draft.reviewers.length === 1 ? '' : 's'}.`;
  }
  if (draft.verifiers.length === 0) errors.verifiers = 'Add at least one verifier, or no tranche could ever be released.';
  else if (schema?.restricted && !draft.verifiers.includes(schema.authority)) {
    errors.verifiers = 'The schema is restricted: only its authority can sign under it, so that address must be a verifier.';
  }
  return errors;
}

/** Errors for the Timeline step, by deadline, plus the ordering. */
export function timelineErrors(
  draft: DeployDraft,
  nowSeconds: number,
): Partial<Record<DeadlineKey | 'order', string>> {
  const errors: ReturnType<typeof timelineErrors> = {};
  for (const d of DEADLINES) {
    const value = draft[d.key];
    if (value === null) errors[d.key] = `Set the date.`;
    else if (value <= nowSeconds) errors[d.key] = 'Must be in the future.';
  }
  const values = DEADLINES.map((d) => draft[d.key]);
  if (values.every((v): v is number => v !== null)) {
    const ordered = values.every((v, i) => i === 0 || values[i - 1] < v);
    if (!ordered) errors.order = 'The dates must run in order: applications, review, release, then sweep.';
  }
  return errors;
}

/**
 * The description document a deploy publishes: the spec's required fields and
 * the creator's names for reviewers and verifiers. Names are optional.
 */
export function buildMetadata(draft: DeployDraft): ProgrammeMetadata {
  const labels: AddressLabel[] = [];
  for (const [role, list] of [
    ['reviewer', draft.reviewers],
    ['verifier', draft.verifiers],
  ] as const) {
    for (const address of list) {
      const label = draft.labels[address]?.trim();
      if (label) labels.push({ address, role, label: label.slice(0, 80) });
    }
  }
  return {
    schema_version: METADATA_SCHEMA_VERSION,
    name: draft.name.trim(),
    description: draft.description.trim(),
    vertical: draft.vertical,
    contact: { name: draft.contactName.trim(), email: draft.contactEmail.trim() },
    ...(labels.length > 0 ? { labels } : {}),
  };
}

/**
 * The arguments for `registry.create`, once every step is valid. `metadataHash`
 * is the published description's hash; without one, the manual hash (or zero).
 */
export function createArgs(draft: DeployDraft, creator: string, metadataHash?: string) {
  const min = parseMinAward(draft.minAward, draft.tranches);
  if (!min.ok) throw new Error(min.error);
  return {
    creator,
    token: draft.token.trim(),
    schema: Buffer.from(cleanHex(draft.schema), 'hex'),
    apply_deadline: BigInt(draft.applyDeadline ?? 0),
    review_deadline: BigInt(draft.reviewDeadline ?? 0),
    release_deadline: BigInt(draft.releaseDeadline ?? 0),
    sweep_deadline: BigInt(draft.sweepDeadline ?? 0),
    quorum: draft.quorum,
    tranches: draft.tranches,
    metadata_hash: Buffer.from(
      metadataHash ?? (draft.describe || draft.metadataHash.trim() === '' ? '00'.repeat(32) : cleanHex(draft.metadataHash)),
      'hex',
    ),
    reviewers: draft.reviewers,
    verifiers: draft.verifiers,
    name: draft.name.trim(),
    minimum_award: min.value,
  };
}
