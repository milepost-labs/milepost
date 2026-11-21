import { describe, expect, it } from 'vitest';
import { mergeSigned } from './signedAttestations';
import type { AttestationMatch } from './attestationSearch';
import type { SignedRecord } from './verifyLinks';

const ME = `G${'A'.repeat(55)}`;
const ALICE = `G${'B'.repeat(55)}`;
const BOB = `G${'C'.repeat(55)}`;
const PROGRAMME = `C${'D'.repeat(55)}`;
const uid = (c: string) => c.repeat(64);

const local = (u: string, recipient = ALICE): SignedRecord => ({
  uid: u,
  programmeId: PROGRAMME,
  recipient,
  attester: ME,
  tranche: 2,
  signedAt: 1,
});
const match = (u: string, ledger: number, role: AttestationMatch['role'] = 'attester', subject = BOB): AttestationMatch => ({
  uid: u,
  role,
  subject,
  ledger,
  attestation: null,
});

describe('merging signed attestations', () => {
  it('lists this browser\'s entries and the ones found only in events', () => {
    const entries = mergeSigned([local(uid('a'))], [match(uid('b'), 10)]);

    expect(entries).toEqual([
      {
        uid: uid('a'),
        subject: ALICE,
        programmeId: PROGRAMME,
        tranche: 2,
        attester: ME,
        signedHere: true,
        foundInEvents: false,
      },
      {
        uid: uid('b'),
        subject: BOB,
        programmeId: null,
        tranche: null,
        attester: null,
        signedHere: false,
        foundInEvents: true,
      },
    ]);
  });

  it('shows an attestation in both sources once, keeping what this browser knows', () => {
    const entries = mergeSigned([local(uid('a'))], [match(uid('A'), 10), match(uid('a'), 11)]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ uid: uid('a'), programmeId: PROGRAMME, signedHere: true, foundInEvents: true });
  });

  it('keeps only events this address signed, newest first', () => {
    const entries = mergeSigned(
      [],
      [match(uid('b'), 5), match(uid('c'), 9, 'both'), match(uid('d'), 7, 'subject')],
    );

    expect(entries.map((e) => e.uid)).toEqual([uid('c'), uid('b')]);
  });

  it('is empty when neither source has anything', () => {
    expect(mergeSigned([], [])).toEqual([]);
  });
});
