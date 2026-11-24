import { Buffer } from 'buffer';
import { looksLikeAddress } from './format';
import { isProgrammeContractId } from './registryVerification';

/**
 * The two links that carry a claim between a recipient and a verifier without
 * a server or a contract change.
 *
 * - A **request link** (`/verifiers?programme=…&recipient=…`) is what a
 *   recipient sends their verifier. It opens the verifier's review panel with
 *   the claim filled in. Everything in it is a hint: the panel re-reads the
 *   award, the schema and the verifier's role on the chain before anything can
 *   be signed.
 * - A **reply link** (`/recipients?release=…&attestation=…&attester=…`) is what
 *   the verifier sends back once they have signed. It fills in the recipient's
 *   release sheet. The contract checks the attestation when it is used.
 *
 * Requests a verifier has opened are remembered in this browser only, so the
 * queue they make is per-device and private. Nothing here is shared.
 */

/** Longest note a recipient can put in a request link. */
export const REQUEST_NOTE_MAX = 200;

export interface ClaimRequest {
  programmeId: string;
  recipient: string;
  /** The tranche the recipient expects to release next, counting from 1. A hint only. */
  tranche: number | null;
  /** The recipient's own words. Travels in the link, never on the chain. */
  note: string;
}

export interface StoredRequest extends ClaimRequest {
  /** When this browser first opened the link, in ms. */
  openedAt: number;
}

export interface ReleaseReply {
  programmeId: string;
  /** 64-character lowercase hex. */
  attestation: string;
  attester: string;
}

const HEX_64 = /^[0-9a-f]{64}$/;

function cleanNote(raw: string | null): string {
  if (!raw) return '';
  // Control characters have no business in a note someone reads before signing.
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, REQUEST_NOTE_MAX);
}

function parseTranche(raw: string | null): number | null {
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

/** The path and query of a request link. Prefix with an origin to share it. */
export function requestPath(request: ClaimRequest): string {
  const params = new URLSearchParams({ programme: request.programmeId, recipient: request.recipient });
  if (request.tranche !== null) params.set('tranche', String(request.tranche));
  const note = cleanNote(request.note);
  if (note) params.set('note', note);
  return `/verifiers?${params.toString()}`;
}

/** A request read from `/verifiers`' query, or null when it does not name a usable claim. */
export function parseRequest(params: URLSearchParams): ClaimRequest | null {
  const programmeId = params.get('programme')?.trim() ?? '';
  const recipient = params.get('recipient')?.trim() ?? '';
  if (!isProgrammeContractId(programmeId) || !looksLikeAddress(recipient)) return null;
  return {
    programmeId,
    recipient,
    tranche: parseTranche(params.get('tranche')),
    note: cleanNote(params.get('note')),
  };
}

/** The path and query of a reply link. */
export function replyPath(reply: ReleaseReply): string {
  const params = new URLSearchParams({
    release: reply.programmeId,
    attestation: reply.attestation,
    attester: reply.attester,
  });
  return `/recipients?${params.toString()}`;
}

/** A reply read from `/recipients`' query, or null when any part is malformed. */
export function parseReply(params: URLSearchParams): ReleaseReply | null {
  const programmeId = params.get('release')?.trim() ?? '';
  const attestation = (params.get('attestation') ?? '').trim().toLowerCase().replace(/^0x/, '');
  const attester = params.get('attester')?.trim() ?? '';
  if (!isProgrammeContractId(programmeId) || !HEX_64.test(attestation) || !looksLikeAddress(attester)) {
    return null;
  }
  return { programmeId, attestation, attester };
}

/** An absolute link for sharing, built on the page's own origin. */
export function absoluteLink(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}`;
}

/**
 * The `data_hash` an attestation carries: SHA-256 of the verifier's reference
 * note, or 32 zero bytes when there is none. Only the hash goes on the chain,
 * so the verifier keeps the words.
 */
export async function referenceHash(reference: string): Promise<Buffer> {
  const text = reference.trim();
  if (!text) return Buffer.alloc(32);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Buffer.from(new Uint8Array(digest));
}

// ── This browser's memory ────────────────────────────────────────────────────

const REQUESTS_KEY = 'milepost.verify.requests';
const SIGNED_KEY = 'milepost.verify.signed';
const MAX_KEPT = 50;

export function claimKey(claim: { programmeId: string; recipient: string }): string {
  return `${claim.programmeId}:${claim.recipient}`;
}

function readJson<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, list: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_KEPT)));
  } catch {
    // Private windows and blocked storage: the queue just isn't remembered.
  }
}

/** Requests opened in this browser, newest first. Entries that no longer parse are dropped. */
export function loadRequests(): StoredRequest[] {
  return readJson<StoredRequest>(REQUESTS_KEY).filter(
    (r) =>
      r &&
      typeof r.openedAt === 'number' &&
      isProgrammeContractId(String(r.programmeId)) &&
      looksLikeAddress(String(r.recipient)),
  );
}

/** Remembers a request; opening the same claim again keeps its first-opened time. */
export function rememberRequest(request: ClaimRequest, now = Date.now()): StoredRequest[] {
  const list = loadRequests();
  const key = claimKey(request);
  const existing = list.find((r) => claimKey(r) === key);
  const entry: StoredRequest = { ...request, openedAt: existing?.openedAt ?? now };
  const next = [entry, ...list.filter((r) => claimKey(r) !== key)];
  writeJson(REQUESTS_KEY, next);
  return next;
}

export function forgetRequest(claim: { programmeId: string; recipient: string }): StoredRequest[] {
  const key = claimKey(claim);
  const next = loadRequests().filter((r) => claimKey(r) !== key);
  writeJson(REQUESTS_KEY, next);
  return next;
}

/** An attestation signed in this browser, kept so the verifier can resend its reply link. */
export interface SignedRecord {
  /** 64-character hex. */
  uid: string;
  programmeId: string;
  recipient: string;
  attester: string;
  /** The tranche it was signed for, counting from 1. */
  tranche: number;
  signedAt: number;
}

export function loadSigned(attester: string): SignedRecord[] {
  return readJson<SignedRecord>(SIGNED_KEY).filter(
    (s) => s && s.attester === attester && HEX_64.test(String(s.uid)),
  );
}

export function rememberSigned(record: SignedRecord): SignedRecord[] {
  const all = readJson<SignedRecord>(SIGNED_KEY).filter((s) => s && s.uid !== record.uid);
  writeJson(SIGNED_KEY, [record, ...all]);
  return loadSigned(record.attester);
}
