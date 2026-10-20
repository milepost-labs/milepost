import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import { Keypair, nativeToScVal, Address, xdr, type rpc } from '@milepost/program';
import type { Attestation } from '@milepost/attest';
import { attestationStatus, isSearchableAddress, searchAttestations } from './attestationSearch';
import { EVENTS_MAX_PAGES, EVENTS_PAGE_SIZE, describeWindow, readRecentEvents } from './contractEvents';

const ATTEST_ID = `C${'A'.repeat(55)}`;
const RECIPIENT = Keypair.random().publicKey();
const VERIFIER = Keypair.random().publicKey();
const OTHER = Keypair.random().publicKey();
const uid = (n: number) => n.toString(16).padStart(2, '0').repeat(32);

function attestedEvent(n: number, subject: string, attester: string, ledger: number) {
  return {
    ledger,
    topic: [
      xdr.ScVal.scvSymbol('attest'),
      new Address(subject).toScVal(),
      xdr.ScVal.scvBytes(Buffer.from(uid(n), 'hex')),
    ],
    value: nativeToScVal({ attester: new Address(attester) }),
  } as unknown as rpc.Api.EventResponse;
}

function attestation(n: number, overrides: Partial<Attestation> = {}): Attestation {
  return {
    uid: Buffer.from(uid(n), 'hex'),
    schema: Buffer.from(uid(99), 'hex'),
    attester: VERIFIER,
    subject: RECIPIENT,
    data_hash: Buffer.alloc(32),
    created_at: 1_700_000_000n,
    expires_at: undefined,
    revoked_at: undefined,
    ...overrides,
  } as Attestation;
}

function server(pages: rpc.Api.EventResponse[][], oldestLedger = 1_000, latestLedger = 121_960) {
  const getEvents = vi.fn();
  pages.forEach((events, i) =>
    getEvents.mockResolvedValueOnce({ events, cursor: `c${i}`, latestLedger }),
  );
  return {
    getHealth: vi.fn(async () => ({ status: 'healthy', oldestLedger, latestLedger })),
    getEvents,
  } as unknown as Parameters<typeof readRecentEvents>[0] & {
    getEvents: ReturnType<typeof vi.fn>;
  };
}

function attestClient(byUid: Record<string, Attestation>) {
  return {
    options: { contractId: ATTEST_ID },
    get: vi.fn(async ({ uid: key }: { uid: Buffer }) => ({
      result: {
        unwrap: () => {
          const found = byUid[key.toString('hex')];
          if (!found) throw new Error('NotFound');
          return found;
        },
      },
    })),
  } as unknown as Parameters<typeof searchAttestations>[1];
}

describe('readRecentEvents', () => {
  it('starts at the oldest retained ledger and filters to the contract', async () => {
    const s = server([[]]);
    const read = await readRecentEvents(s, ATTEST_ID, [['x', '*']]);

    expect(s.getEvents.mock.calls[0][0]).toMatchObject({
      startLedger: 1_000,
      filters: [{ type: 'contract', contractIds: [ATTEST_ID], topics: [['x', '*']] }],
    });
    expect(read.window).toEqual({ fromLedger: 1_000, toLedger: 121_960 });
    expect(read.truncated).toBe(false);
  });

  it('follows the cursor until a short page', async () => {
    const full = Array.from({ length: EVENTS_PAGE_SIZE }, (_, i) => attestedEvent(1, RECIPIENT, VERIFIER, i));
    const s = server([full, [attestedEvent(2, RECIPIENT, VERIFIER, 500)]]);
    const read = await readRecentEvents(s, ATTEST_ID, []);

    expect(read.events).toHaveLength(EVENTS_PAGE_SIZE + 1);
    expect(s.getEvents.mock.calls[1][0]).toMatchObject({ cursor: 'c0' });
  });

  it('stops at the page cap and ends the window at the last event read', async () => {
    const full = Array.from({ length: EVENTS_PAGE_SIZE }, (_, i) => attestedEvent(1, RECIPIENT, VERIFIER, 2_000 + i));
    const s = server(Array.from({ length: EVENTS_MAX_PAGES + 1 }, () => full));
    const read = await readRecentEvents(s, ATTEST_ID, []);

    expect(s.getEvents).toHaveBeenCalledTimes(EVENTS_MAX_PAGES);
    expect(read.truncated).toBe(true);
    expect(read.window.toLedger).toBe(2_000 + EVENTS_PAGE_SIZE - 1);
  });
});

describe('describeWindow', () => {
  it('names the window in days, roughly', () => {
    expect(describeWindow({ fromLedger: 1_000, toLedger: 121_960 })).toBe('about 7 days');
    expect(describeWindow({ fromLedger: 0, toLedger: 720 })).toBe('about 1 hour');
  });
});

describe('isSearchableAddress', () => {
  it('accepts account and contract addresses only', () => {
    expect(isSearchableAddress(RECIPIENT)).toBe(true);
    expect(isSearchableAddress(ATTEST_ID)).toBe(true);
    expect(isSearchableAddress(uid(1))).toBe(false);
    expect(isSearchableAddress('GABC')).toBe(false);
  });
});

describe('attestationStatus', () => {
  const now = 1_800_000_000;

  it('is valid without revocation or a passed expiry', () => {
    expect(attestationStatus(attestation(1), now)).toBe('valid');
    expect(attestationStatus(attestation(1, { expires_at: BigInt(now + 1) }), now)).toBe('valid');
  });

  it('is expired once the expiry has passed', () => {
    expect(attestationStatus(attestation(1, { expires_at: BigInt(now) }), now)).toBe('expired');
  });

  it('reports revoked ahead of expired', () => {
    const both = attestation(1, { revoked_at: 0n, expires_at: BigInt(now - 1) });
    expect(attestationStatus(both, now)).toBe('revoked');
  });
});

describe('searchAttestations', () => {
  it('finds the address as subject or attester, newest first, re-read on-chain', async () => {
    const s = server([
      [
        attestedEvent(1, RECIPIENT, VERIFIER, 100),
        attestedEvent(2, OTHER, VERIFIER, 200),
        attestedEvent(3, OTHER, RECIPIENT, 300),
      ],
    ]);
    const revoked = attestation(3, { subject: OTHER, attester: RECIPIENT, revoked_at: 5n });
    const attest = attestClient({ [uid(1)]: attestation(1), [uid(3)]: revoked });

    const found = await searchAttestations(s, attest, ` ${RECIPIENT} `);

    expect(found.matches.map((m) => [m.uid, m.role, m.ledger])).toEqual([
      [uid(3), 'attester', 300],
      [uid(1), 'subject', 100],
    ]);
    expect(found.matches[0].attestation).toBe(revoked);
    expect(found.window).toEqual({ fromLedger: 1_000, toLedger: 121_960 });
  });

  it('keeps a hit whose entry cannot be read, without its attestation', async () => {
    const s = server([[attestedEvent(4, RECIPIENT, VERIFIER, 100)]]);
    const found = await searchAttestations(s, attestClient({}), RECIPIENT);

    expect(found.matches).toHaveLength(1);
    expect(found.matches[0].attestation).toBeNull();
  });

  it('returns nothing when the address appears in no event', async () => {
    const s = server([[attestedEvent(1, RECIPIENT, VERIFIER, 100)]]);
    const attest = attestClient({});
    const found = await searchAttestations(s, attest, OTHER);

    expect(found.matches).toEqual([]);
    expect(attest.get).not.toHaveBeenCalled();
  });
});
