import { Address, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  entryLedgerKey,
  instanceLedgerKey,
  ledgersToDays,
  readProgrammeLifetimes,
} from './entryTtl';

const PROGRAMME = 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6';
const ALICE = 'GAKNDFRRWA3RPWNLTI3G4EBSD3RGNZZOY5WKWYMQ6CQTG3KIEKPYWAYC';
const BOB = 'GD6WU64OEP5C4LRBH6NK3MHYIA2ADN6K6II6EXPNVUR3ERBXT4AN4ACD';

describe('ledger key derivation', () => {
  it('addresses the contract instance entry', () => {
    const data = instanceLedgerKey(PROGRAMME).contractData();

    expect(Address.fromScAddress(data.contract()).toString()).toBe(PROGRAMME);
    expect(data.key().switch()).toBe(xdr.ScValType.scvLedgerKeyContractInstance());
    expect(data.durability()).toBe(xdr.ContractDataDurability.persistent());
  });

  it('encodes Key::Award(recipient) as Vec[Symbol("Award"), Address]', () => {
    const data = entryLedgerKey(PROGRAMME, 'Award', ALICE).contractData();
    const parts = data.key().vec() ?? [];

    expect(parts).toHaveLength(2);
    expect(parts[0].sym().toString()).toBe('Award');
    expect(Address.fromScVal(parts[1]).toString()).toBe(ALICE);
    expect(data.durability()).toBe(xdr.ContractDataDurability.persistent());
  });

  it('gives different subjects different keys', () => {
    const a = entryLedgerKey(PROGRAMME, 'Award', ALICE).toXDR('base64');
    const b = entryLedgerKey(PROGRAMME, 'Award', BOB).toXDR('base64');
    const donor = entryLedgerKey(PROGRAMME, 'Donor', ALICE).toXDR('base64');

    expect(new Set([a, b, donor]).size).toBe(3);
  });
});

describe('ledgersToDays', () => {
  it('converts at 5 seconds per ledger (17,280 ledgers a day)', () => {
    expect(ledgersToDays(1_000 + 17_280 * 30, 1_000)).toBe(30);
    expect(ledgersToDays(1_000 + 17_280 * 30 - 1, 1_000)).toBe(29);
  });

  it('returns 0 once an entry is due or past due', () => {
    expect(ledgersToDays(500, 1_000)).toBe(0);
    expect(ledgersToDays(1_000, 1_000)).toBe(0);
  });

  it('accepts a different ledger close time', () => {
    expect(ledgersToDays(1_000 + 8_640, 1_000, 10)).toBe(1);
  });
});

describe('readProgrammeLifetimes', () => {
  it('reads every key in one call and reports the shortest award lifetime', async () => {
    const latestLedger = 100_000;
    const live = new Map([
      [instanceLedgerKey(PROGRAMME).toXDR('base64'), latestLedger + 17_280 * 61],
      [entryLedgerKey(PROGRAMME, 'Award', ALICE).toXDR('base64'), latestLedger + 17_280 * 12],
      [entryLedgerKey(PROGRAMME, 'Award', BOB).toXDR('base64'), latestLedger + 17_280 * 44],
    ]);
    const getLedgerEntries = vi.fn(async (...keys: xdr.LedgerKey[]) => ({
      latestLedger,
      entries: keys.map((key) => ({ key, liveUntilLedgerSeq: live.get(key.toXDR('base64')) })),
    }));

    const result = await readProgrammeLifetimes(
      { getLedgerEntries } as never,
      PROGRAMME,
      [ALICE, BOB, ALICE],
    );

    expect(getLedgerEntries).toHaveBeenCalledTimes(1);
    expect(getLedgerEntries.mock.calls[0]).toHaveLength(3);
    expect(result.rows).toEqual([
      expect.objectContaining({ key: 'instance', liveForDays: 61 }),
      expect.objectContaining({ key: 'awards', liveForDays: 12, note: '2 of 2 entries found' }),
    ]);
    expect(result.unchecked).toEqual(['Contributions', 'Applications and votes']);
  });

  it('reports a missing entry as unknown rather than as zero days', async () => {
    const getLedgerEntries = vi.fn(async () => ({ latestLedger: 10, entries: [] }));

    const result = await readProgrammeLifetimes({ getLedgerEntries } as never, PROGRAMME, [ALICE]);

    expect(result.rows[0].liveForDays).toBeNull();
    expect(result.rows[1]).toMatchObject({ liveForDays: null, note: '0 of 1 entry found' });
  });
});
