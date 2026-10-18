import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import type { Schema } from '@milepost/attest';
import { lookupSchema, lookupSchemaChain, parseSchemaUid, type SchemaReader } from './schemaLookup';

const AUTHORITY = 'GAKNDFRRWA3RPWNLTI3G4EBSD3RGNZZOY5WKWYMQ6CQTG3KIEKPYWAYC';
const uid = (n: number) => n.toString(16).padStart(2, '0').repeat(32);

function schema(n: number, predecessor: number | null, revocable = false): Schema {
  return {
    uid: Buffer.from(uid(n), 'hex'),
    authority: AUTHORITY,
    definition: `condition-met/v${n}: programme: address`,
    predecessor: predecessor === null ? undefined : Buffer.from(uid(predecessor), 'hex'),
    restricted: false,
    revocable,
  } as Schema;
}

/** Mimics the bindings: a missing schema throws the contract error on unwrap. */
function reader(registered: Schema[]): SchemaReader {
  const byUid = new Map(registered.map((s) => [Buffer.from(s.uid).toString('hex'), s]));
  return vi.fn(async ({ uid: key }: { uid: Buffer }) => ({
    result: {
      unwrap: () => {
        const found = byUid.get(key.toString('hex'));
        if (!found) throw new Error('SchemaNotFound');
        return found;
      },
    },
  }));
}

describe('parseSchemaUid', () => {
  it('accepts 64 hex characters, with or without 0x', () => {
    expect(parseSchemaUid(`0x${uid(10).toUpperCase()}`)).toBe(uid(10));
    expect(parseSchemaUid(` ${uid(10)} `)).toBe(uid(10));
  });

  it('rejects anything else', () => {
    expect(parseSchemaUid('abc')).toBeNull();
    expect(parseSchemaUid(`${uid(10)}00`)).toBeNull();
  });
});

describe('lookupSchema', () => {
  it('returns every field of a registered schema', async () => {
    const record = await lookupSchema(reader([schema(2, 1, true)]), uid(2));

    expect(record).toEqual({
      uid: uid(2),
      definition: 'condition-met/v2: programme: address',
      authority: AUTHORITY,
      revocable: true,
      restricted: false,
      predecessorUid: uid(1),
    });
  });

  it('returns null when the UID is not registered', async () => {
    expect(await lookupSchema(reader([]), uid(9))).toBeNull();
  });

  it('treats a raw contract error #1 as not found too', async () => {
    const read: SchemaReader = async () => ({
      result: {
        unwrap: () => {
          throw new Error('HostError: Error(Contract, #1)');
        },
      },
    });
    expect(await lookupSchema(read, uid(9))).toBeNull();
  });

  it('rethrows other failures', async () => {
    const read: SchemaReader = async () => {
      throw new Error('Failed to fetch');
    };
    await expect(lookupSchema(read, uid(9))).rejects.toThrow('Failed to fetch');
  });
});

describe('lookupSchemaChain', () => {
  it('follows a chain of predecessors back to the original', async () => {
    const result = await lookupSchemaChain(
      reader([schema(3, 2), schema(2, 1), schema(1, null)]),
      uid(3),
    );

    expect(result?.chain.map((s) => s.uid)).toEqual([uid(3), uid(2), uid(1)]);
    expect(result?.missingPredecessor).toBeNull();
    expect(result?.truncated).toBe(false);
  });

  it('reports a predecessor that is referenced but not registered', async () => {
    const result = await lookupSchemaChain(reader([schema(3, 2)]), uid(3));

    expect(result?.chain).toHaveLength(1);
    expect(result?.missingPredecessor).toBe(uid(2));
  });

  it('returns null when the requested schema is not registered', async () => {
    expect(await lookupSchemaChain(reader([]), uid(3))).toBeNull();
  });

  it('stops at the depth limit and never loops', async () => {
    const looping = reader([schema(1, 2), schema(2, 1)]);
    const result = await lookupSchemaChain(looping, uid(1));
    expect(result?.chain.map((s) => s.uid)).toEqual([uid(1), uid(2)]);

    const long = reader([schema(4, 3), schema(3, 2), schema(2, 1), schema(1, null)]);
    const truncated = await lookupSchemaChain(long, uid(4), 2);
    expect(truncated?.chain).toHaveLength(2);
    expect(truncated?.truncated).toBe(true);
  });
});
