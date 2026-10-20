/**
 * Finding attestations by recipient or verifier.
 *
 * The attest contract can only be read by uid, and a recipient rarely has the
 * uid. Every `attest` call emits `Attested { subject, uid, attestation }`, so
 * the RPC's recent events are searched for the address as subject or as
 * attester, and each hit is re-read with `attest.get` so the status shown is
 * today's, not the one at signing. Events older than the RPC's window are not
 * seen; the result carries the window so the screen can say so.
 */

import { Buffer } from 'buffer';
import { scValToNative } from '@milepost/program';
import type { Attestation, Client as AttestClient } from '@milepost/attest';
import { readRecentEvents, symbolTopic, type EventWindow } from './contractEvents';

type EventsServer = Parameters<typeof readRecentEvents>[0];

/** Valid, revoked or expired. Whether it was used is per programme, read separately. */
export type AttestationStatus = 'valid' | 'revoked' | 'expired';

/** How the searched address appears on an attestation. */
export type AttestationRole = 'subject' | 'attester' | 'both';

export interface AttestationMatch {
  uid: string;
  role: AttestationRole;
  /** Ledger the `Attested` event was emitted in. */
  ledger: number;
  /** Re-read on-chain; null when the entry could not be read (usually archived). */
  attestation: Attestation | null;
}

export interface AttestationSearch {
  /** The address searched, so a screen can tell a result from a previous search. */
  address: string;
  matches: AttestationMatch[];
  window: EventWindow;
  truncated: boolean;
}

const ADDRESS_PATTERN = /^[GC][A-Z2-7]{55}$/;

export function isSearchableAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value.trim());
}

export function attestationStatus(attestation: Attestation, nowSeconds: number): AttestationStatus {
  if (attestation.revoked_at !== undefined && attestation.revoked_at !== null) return 'revoked';
  const expiresAt = attestation.expires_at;
  if (expiresAt !== undefined && expiresAt !== null && BigInt(expiresAt) <= BigInt(nowSeconds)) {
    return 'expired';
  }
  return 'valid';
}

function roleOf(address: string, subject: string, attester: string): AttestationRole | null {
  if (subject === address && attester === address) return 'both';
  if (subject === address) return 'subject';
  if (attester === address) return 'attester';
  return null;
}

/**
 * Attestations naming `address` as subject or attester within the RPC's
 * window, newest first, each re-read on-chain.
 */
export async function searchAttestations(
  server: EventsServer,
  attest: Pick<AttestClient, 'get' | 'options'>,
  address: string,
): Promise<AttestationSearch> {
  const target = address.trim();
  const { events, window, truncated } = await readRecentEvents(server, attest.options.contractId, [
    [symbolTopic('attest'), '*', '*'],
  ]);

  const found: Omit<AttestationMatch, 'attestation'>[] = [];
  for (const event of events) {
    const [, subjectVal, uidVal] = event.topic;
    if (!subjectVal || !uidVal) continue;
    const subject = String(scValToNative(subjectVal));
    const signed = scValToNative(event.value) as { attester?: unknown };
    const attester = String(signed?.attester ?? '');
    const role = roleOf(target, subject, attester);
    if (!role) continue;
    const uid = Buffer.from(scValToNative(uidVal) as Uint8Array).toString('hex');
    found.push({ uid, role, ledger: event.ledger });
  }

  found.sort((a, b) => b.ledger - a.ledger);

  const matches = await Promise.all(
    found.map(async (match) => {
      try {
        const read = await attest.get({ uid: Buffer.from(match.uid, 'hex') });
        return { ...match, attestation: read.result.unwrap() };
      } catch {
        return { ...match, attestation: null };
      }
    }),
  );

  return { address: target, matches, window, truncated };
}
