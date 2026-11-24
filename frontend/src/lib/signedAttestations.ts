import type { AttestationMatch } from './attestationSearch';
import type { SignedRecord } from './verifyLinks';

/**
 * One attestation a verifier signed, from this browser's memory, from the
 * attest contract's recent events, or both.
 */
export interface SignedEntry {
  /** 64-character lowercase hex. */
  uid: string;
  subject: string;
  /** Only this browser knows which programme and tranche it was signed for. */
  programmeId: string | null;
  tranche: number | null;
  /** The `attester` the reply link names, when this browser signed it. */
  attester: string | null;
  signedHere: boolean;
  foundInEvents: boolean;
}

/**
 * Local entries first, newest first as stored, then attestations found only
 * in the events, newest ledger first. An attestation in both appears once,
 * keeping what this browser knows about it.
 */
export function mergeSigned(local: SignedRecord[], matches: AttestationMatch[]): SignedEntry[] {
  const signed = matches.filter((m) => m.role === 'attester' || m.role === 'both');
  const inEvents = new Set(signed.map((m) => m.uid.toLowerCase()));
  const entries: SignedEntry[] = [];
  const seen = new Set<string>();

  for (const record of local) {
    const uid = record.uid.toLowerCase();
    if (seen.has(uid)) continue;
    seen.add(uid);
    entries.push({
      uid,
      subject: record.recipient,
      programmeId: record.programmeId,
      tranche: record.tranche,
      attester: record.attester,
      signedHere: true,
      foundInEvents: inEvents.has(uid),
    });
  }

  for (const match of [...signed].sort((a, b) => b.ledger - a.ledger)) {
    const uid = match.uid.toLowerCase();
    if (seen.has(uid)) continue;
    seen.add(uid);
    entries.push({
      uid,
      subject: match.subject,
      programmeId: null,
      tranche: null,
      attester: null,
      signedHere: false,
      foundInEvents: true,
    });
  }

  return entries;
}
