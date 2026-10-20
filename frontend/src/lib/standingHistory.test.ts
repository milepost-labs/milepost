import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import {
  parseStandingHistory,
  verifyStandingHistory,
  type NextRoot,
  type StandingHistoryEntry,
} from './standingHistory';

const PROGRAMME = `C${'A'.repeat(55)}`;
const ATTESTATION = '11'.repeat(32);

const nextRoot: NextRoot = async ({ root, programme, amount, attestation, timestamp }) => {
  const input = Buffer.concat([
    Buffer.from(root),
    Buffer.from(programme),
    Buffer.from(amount.toString()),
    Buffer.from(attestation),
    Buffer.from(timestamp.toString()),
  ]);
  const out = Buffer.alloc(32);
  let seed = 7;
  for (let index = 0; index < input.length; index++) {
    seed = (seed * 31 + input[index]) % 251;
  }
  for (let index = 0; index < out.length; index++) out[index] = (seed + index * 17) % 256;
  return out;
};

async function buildHistory(amounts: string[]): Promise<StandingHistoryEntry[]> {
  const entries: StandingHistoryEntry[] = [];
  let root = Buffer.alloc(32, 0);
  for (let index = 0; index < amounts.length; index++) {
    root = await nextRoot({
      root,
      programme: PROGRAMME,
      amount: BigInt(amounts[index]),
      attestation: Buffer.from(ATTESTATION, 'hex'),
      timestamp: BigInt(1_700_000_000 + index),
    });
    entries.push({
      programme: PROGRAMME,
      amount: amounts[index],
      attestation: ATTESTATION,
      timestamp: String(1_700_000_000 + index),
      root: root.toString('hex'),
    });
  }
  return entries;
}

describe('parseStandingHistory', () => {
  it('refuses malformed JSON with a message naming the problem', () => {
    const result = parseStandingHistory('{not json');
    expect(result).toEqual({
      ok: false,
      error: 'That is not valid JSON — paste the credit list as a JSON array.',
    });
  });

  it('refuses an entry with the wrong shape', () => {
    const result = parseStandingHistory(
      JSON.stringify([{ programme: PROGRAMME, amount: 'not-a-number' }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Entry 1: "amount"/);
  });

  it('accepts a history without per-entry roots, but still validates them when present', () => {
    const withoutRoot = parseStandingHistory(
      JSON.stringify([
        {
          programme: PROGRAMME,
          amount: '1000',
          attestation: ATTESTATION,
          timestamp: '1700000000',
        },
      ]),
    );
    expect(withoutRoot.ok).toBe(true);

    const badRoot = parseStandingHistory(
      JSON.stringify([
        {
          programme: PROGRAMME,
          amount: '1000',
          attestation: ATTESTATION,
          timestamp: '1700000000',
          root: 'nope',
        },
      ]),
    );
    expect(badRoot.ok).toBe(false);
    if (!badRoot.ok) expect(badRoot.error).toMatch(/"root"/);
  });
});

describe('verifyStandingHistory', () => {
  it('verifies a history that reproduces the on-chain root', async () => {
    const entries = await buildHistory(['1000', '2500', '500']);
    const onChain = Buffer.from(entries[entries.length - 1].root!, 'hex');

    await expect(verifyStandingHistory(entries, onChain, nextRoot)).resolves.toEqual({
      kind: 'match',
    });
  });

  it('names the first entry that diverges when a value is tampered with', async () => {
    const entries = await buildHistory(['1000', '2500', '500']);
    const onChain = Buffer.from(entries[entries.length - 1].root!, 'hex');
    const tampered = entries.map((entry) => ({ ...entry }));
    tampered[1] = { ...tampered[1], amount: '9999' };

    const verdict = await verifyStandingHistory(tampered, onChain, nextRoot);
    expect(verdict.kind).toBe('mismatch');
    if (verdict.kind === 'mismatch') {
      expect(verdict.firstBadIndex).toBe(1);
      expect(verdict.message).toMatch(/Entry 2/);
    }
  });

  it('refuses an empty history against a non-zero root', async () => {
    const entries = await buildHistory(['1000']);
    const verdict = await verifyStandingHistory(
      [],
      Buffer.from(entries[0].root!, 'hex'),
      nextRoot,
    );
    expect(verdict.kind).toBe('mismatch');
  });
});
