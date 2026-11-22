import { Buffer } from 'buffer';
import { attestationStatus, type AttestationMatch } from './attestationSearch';

export interface EligibleAttestation {
  uid: string;
  attester: string;
  ledger: number;
}

export interface FilterReleaseAttestationsOptions {
  matches: readonly AttestationMatch[];
  /** 64-char hex schema id from the programme's config. */
  schemaHex: string;
  isVerifier: (attester: string) => Promise<boolean>;
  isSpent: (uid: Buffer) => Promise<boolean>;
  nowSeconds?: number;
}

/**
 * Narrow recent attestation matches about a recipient down to the ones that
 * can release a tranche on this programme:
 * - the recipient is the subject (`role` is `'subject'` or `'both'`)
 * - the on-chain attestation read succeeded
 * - its schema matches the programme's schema
 * - it is neither revoked nor expired
 * - its attester is a current verifier of the programme
 * - it has not already been spent on this programme
 */
export async function filterReleaseAttestations({
  matches,
  schemaHex,
  isVerifier,
  isSpent,
  nowSeconds = Math.floor(Date.now() / 1000),
}: FilterReleaseAttestationsOptions): Promise<EligibleAttestation[]> {
  const targetSchema = schemaHex.trim().toLowerCase();
  const candidates = matches.filter((match) => {
    if (match.role !== 'subject' && match.role !== 'both') return false;
    if (!match.attestation) return false;
    const matchSchema = Buffer.from(match.attestation.schema).toString('hex').toLowerCase();
    if (matchSchema !== targetSchema) return false;
    if (attestationStatus(match.attestation, nowSeconds) !== 'valid') return false;
    return true;
  });

  const verifierCache = new Map<string, Promise<boolean>>();
  const checkVerifier = (attester: string): Promise<boolean> => {
    let pending = verifierCache.get(attester);
    if (!pending) {
      pending = isVerifier(attester).catch(() => false);
      verifierCache.set(attester, pending);
    }
    return pending;
  };

  const checked = await Promise.all(
    candidates.map(async (match) => {
      const attester = match.attestation!.attester;
      const [verifierOk, spent] = await Promise.all([
        checkVerifier(attester),
        isSpent(Buffer.from(match.uid, 'hex')).catch(() => true),
      ]);
      if (!verifierOk || spent) return null;
      return { uid: match.uid, attester, ledger: match.ledger };
    }),
  );

  return checked.filter((item): item is EligibleAttestation => item !== null);
}
