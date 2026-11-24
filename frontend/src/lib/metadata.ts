/**
 * Programme metadata documents (`docs/programme-metadata.md`), shared by the
 * app and the store function in `api/metadata.ts`.
 *
 * A programme commits to its document by `ProgrammeConfig.metadata_hash`:
 * SHA-256 of the document's canonical JSON (keys sorted at every level, no
 * whitespace). Anything shown from a document is shown only after it hashes
 * to that commitment, so a store that served the wrong bytes can't put words
 * in a creator's mouth.
 *
 * Runs in the browser and on Node 20+ alike: it only needs `crypto.subtle`
 * and `TextEncoder`.
 */

export const METADATA_SCHEMA_VERSION = '1.1.0';

/** The six sectors the spec names; anything else is accepted as free text. */
export const VERTICALS = [
  { value: 'health', label: 'Health worker stipends' },
  { value: 'education', label: 'Education' },
  { value: 'agriculture', label: 'Agricultural inputs' },
  { value: 'vocational', label: 'Vocational training' },
  { value: 'humanitarian', label: 'Humanitarian cash' },
  { value: 'sme', label: 'SME microgrants' },
] as const;

export type LabelRole = 'reviewer' | 'verifier' | 'payee';

/** The creator's name for one address. A claim by the creator, never a fact the chain checked. */
export interface AddressLabel {
  address: string;
  role: LabelRole;
  label: string;
}

export interface ProgrammeMetadata {
  schema_version: string;
  name: string;
  description: string;
  vertical: string;
  language?: string;
  contact: { name: string; email: string; url?: string };
  links?: { label: string; url: string }[];
  /** Added in 1.1.0. Clients on 1.0 ignore it, as the spec requires. */
  labels?: AddressLabel[];
}

/** The largest canonical document the store accepts, in bytes. */
export const MAX_METADATA_BYTES = 16 * 1024;

const LIMITS = {
  name: 200,
  description: 2000,
  vertical: 40,
  language: 35,
  contactName: 200,
  email: 254,
  url: 500,
  linkLabel: 120,
  links: 10,
  labels: 64,
  label: 80,
} as const;

const ADDRESS = /^[GC][A-Z2-7]{55}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const ZERO_HASH = '0'.repeat(64);

/**
 * Canonical JSON: object keys sorted (at every depth, inside arrays too) and
 * no whitespace. The hash is taken over exactly these bytes.
 */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The `metadata_hash` a document commits to, as 64 hex characters. */
export async function metadataHash(doc: unknown): Promise<string> {
  return sha256Hex(canonicalize(doc));
}

export function isMetadataHash(hex: string): boolean {
  return HEX_64.test(hex);
}

/** A zero hash means "no document": what a programme deployed without one carries. */
export function isZeroHash(hex: string): boolean {
  return hex === ZERO_HASH;
}

type Check = { ok: true; doc: ProgrammeMetadata } | { ok: false; error: string };

function text(v: unknown, max: number, field: string, required: boolean): string | null | { error: string } {
  if (v === undefined || v === null || v === '') return required ? { error: `${field} is required.` } : null;
  if (typeof v !== 'string') return { error: `${field} must be text.` };
  if (v.trim() === '') return required ? { error: `${field} is required.` } : null;
  if (v.length > max) return { error: `${field} is longer than ${max} characters.` };
  return v;
}

function httpsUrl(v: unknown, field: string): string | { error: string } {
  const value = text(v, LIMITS.url, field, true);
  if (value === null || typeof value === 'object') return value ?? { error: `${field} is required.` };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return { error: `${field} must start with https://.` };
  } catch {
    return { error: `${field} is not a web address.` };
  }
  return value;
}

/**
 * Whether a value is a document this store holds: the spec's required fields,
 * within size limits, and nothing else. Clients reading documents ignore
 * unknown fields; the store refuses them, so it only ever holds programme
 * descriptions.
 */
export function validateMetadata(value: unknown): Check {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'The document must be a JSON object.' };
  }
  const v = value as Record<string, unknown>;
  const allowed = new Set(['schema_version', 'name', 'description', 'vertical', 'language', 'contact', 'links', 'labels']);
  const extra = Object.keys(v).find((k) => !allowed.has(k));
  if (extra) return { ok: false, error: `Unknown field “${extra}”.` };

  const fields: [string, unknown, number, boolean][] = [
    ['schema_version', v.schema_version, 20, true],
    ['name', v.name, LIMITS.name, true],
    ['description', v.description, LIMITS.description, true],
    ['vertical', v.vertical, LIMITS.vertical, true],
    ['language', v.language, LIMITS.language, false],
  ];
  for (const [field, raw, max, required] of fields) {
    const r = text(raw, max, field, required);
    if (r !== null && typeof r === 'object') return { ok: false, error: r.error };
  }

  const contact = v.contact as Record<string, unknown> | undefined;
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) return { ok: false, error: 'contact is required.' };
  if (Object.keys(contact).some((k) => !['name', 'email', 'url'].includes(k))) {
    return { ok: false, error: 'contact has an unknown field.' };
  }
  const cName = text(contact.name, LIMITS.contactName, 'contact.name', true);
  if (cName !== null && typeof cName === 'object') return { ok: false, error: cName.error };
  const email = text(contact.email, LIMITS.email, 'contact.email', true);
  if (email !== null && typeof email === 'object') return { ok: false, error: email.error };
  if (typeof email === 'string' && !EMAIL.test(email)) return { ok: false, error: 'contact.email is not an email address.' };
  if (contact.url !== undefined) {
    const u = httpsUrl(contact.url, 'contact.url');
    if (typeof u === 'object') return { ok: false, error: u.error };
  }

  if (v.links !== undefined) {
    if (!Array.isArray(v.links)) return { ok: false, error: 'links must be a list.' };
    if (v.links.length > LIMITS.links) return { ok: false, error: `At most ${LIMITS.links} links.` };
    for (const link of v.links as unknown[]) {
      if (!link || typeof link !== 'object' || Array.isArray(link)) return { ok: false, error: 'Each link must be an object.' };
      const l = link as Record<string, unknown>;
      if (Object.keys(l).some((k) => k !== 'label' && k !== 'url')) return { ok: false, error: 'A link has an unknown field.' };
      const label = text(l.label, LIMITS.linkLabel, 'link label', true);
      if (label !== null && typeof label === 'object') return { ok: false, error: label.error };
      const url = httpsUrl(l.url, 'link url');
      if (typeof url === 'object') return { ok: false, error: url.error };
    }
  }

  if (v.labels !== undefined) {
    if (!Array.isArray(v.labels)) return { ok: false, error: 'labels must be a list.' };
    if (v.labels.length > LIMITS.labels) return { ok: false, error: `At most ${LIMITS.labels} labels.` };
    const seen = new Set<string>();
    for (const entry of v.labels as unknown[]) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { ok: false, error: 'Each label must be an object.' };
      const e = entry as Record<string, unknown>;
      if (Object.keys(e).some((k) => !['address', 'role', 'label'].includes(k))) return { ok: false, error: 'A label has an unknown field.' };
      if (typeof e.address !== 'string' || !ADDRESS.test(e.address)) return { ok: false, error: 'A label’s address is not a Stellar address.' };
      if (e.role !== 'reviewer' && e.role !== 'verifier' && e.role !== 'payee') return { ok: false, error: 'A label’s role must be reviewer, verifier or payee.' };
      const label = text(e.label, LIMITS.label, 'label', true);
      if (label !== null && typeof label === 'object') return { ok: false, error: label.error };
      const key = `${e.role}:${e.address}`;
      if (seen.has(key)) return { ok: false, error: 'An address is labelled twice for the same role.' };
      seen.add(key);
    }
  }

  return { ok: true, doc: v as unknown as ProgrammeMetadata };
}

// ── The app's side: publish and resolve ──────────────────────────────────────

export const METADATA_ENDPOINT = '/api/metadata';

export class MetadataError extends Error {}

/**
 * Publish a document to the store and return its hash. The hash is worked out
 * here first and must match what the store answers, so a store can't swap the
 * document for another.
 */
export async function publishMetadata(doc: ProgrammeMetadata, fetcher: typeof fetch = fetch): Promise<string> {
  const check = validateMetadata(doc);
  if (!check.ok) throw new MetadataError(check.error);
  const canonical = canonicalize(doc);
  if (new TextEncoder().encode(canonical).length > MAX_METADATA_BYTES) {
    throw new MetadataError('The description is too long to store.');
  }
  const expected = await sha256Hex(canonical);
  let response: Response;
  try {
    response = await fetcher(METADATA_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: canonical,
    });
  } catch {
    throw new MetadataError('Could not reach the description store.');
  }
  const body = (await response.json().catch(() => null)) as { hash?: string; error?: string } | null;
  if (!response.ok) throw new MetadataError(body?.error ?? `The description store answered ${response.status}.`);
  if (body?.hash !== expected) throw new MetadataError('The description store returned a different hash.');
  return expected;
}

export type ResolvedMetadata =
  | { status: 'none' }
  | { status: 'ok'; doc: ProgrammeMetadata }
  | { status: 'missing' }
  | { status: 'mismatch'; fetchedHash: string }
  | { status: 'malformed'; reason: string }
  | { status: 'unavailable'; reason: string };

/**
 * Look a programme's document up by the hash it committed to, and check it.
 * Shown only on `ok`; every other answer says why not.
 */
export async function resolveMetadata(hashHex: string, fetcher: typeof fetch = fetch): Promise<ResolvedMetadata> {
  const hash = hashHex.toLowerCase();
  if (!isMetadataHash(hash) || isZeroHash(hash)) return { status: 'none' };
  let response: Response;
  try {
    response = await fetcher(`${METADATA_ENDPOINT}?hash=${hash}`);
  } catch {
    return { status: 'unavailable', reason: 'Could not reach the description store.' };
  }
  if (response.status === 404) return { status: 'missing' };
  if (!response.ok) return { status: 'unavailable', reason: `The description store answered ${response.status}.` };
  return checkDocumentText(await response.text(), hash);
}

/** Parse fetched text and hold it to the commitment. Also used for documents fetched from a URL. */
export async function checkDocumentText(raw: string, committedHash: string): Promise<ResolvedMetadata> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'malformed', reason: 'The document is not valid JSON.' };
  }
  const fetchedHash = await metadataHash(parsed);
  if (fetchedHash !== committedHash.toLowerCase()) return { status: 'mismatch', fetchedHash };
  const v = parsed as Record<string, unknown> | null;
  // Unknown fields are ignored when reading; only the required ones must be there.
  for (const field of ['schema_version', 'name', 'description', 'vertical', 'contact']) {
    if (!v || v[field] === undefined || v[field] === null || v[field] === '') {
      return { status: 'malformed', reason: `Required field “${field}” is missing.` };
    }
  }
  return { status: 'ok', doc: v as unknown as ProgrammeMetadata };
}
