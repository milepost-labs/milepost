import { Buffer } from 'buffer';
import type { Schema } from '@milepost/attest';
import { extractCode } from './errors';

/** A schema as read from `attest.get_schema`, with UIDs hex-encoded. */
export interface SchemaRecord {
  uid: string;
  definition: string;
  authority: string;
  revocable: boolean;
  restricted: boolean;
  predecessorUid: string | null;
}

export interface SchemaChain {
  /** The requested schema first, then each predecessor in turn. */
  chain: SchemaRecord[];
  /** A predecessor UID that is referenced but not registered, if any. */
  missingPredecessor: string | null;
  /** True when the walk stopped at the depth limit. */
  truncated: boolean;
}

/** Reads one schema; the shape of `attest.get_schema`. */
export type SchemaReader = (args: { uid: Buffer }) => Promise<{ result: { unwrap: () => Schema } }>;

const SCHEMA_NOT_FOUND = 1;
const HEX_UID = /^(0x)?([0-9a-fA-F]{64})$/;

/** Normalises a 32-byte hex UID (optional `0x`), or null if it is not one. */
export function parseSchemaUid(input: string): string | null {
  const match = HEX_UID.exec(input.trim());
  return match ? match[2].toLowerCase() : null;
}

function isSchemaNotFound(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /SchemaNotFound/.test(text) || extractCode(error) === SCHEMA_NOT_FOUND;
}

function toRecord(schema: Schema, uid: string): SchemaRecord {
  const predecessor = schema.predecessor as Buffer | undefined | null;
  return {
    uid: schema.uid ? Buffer.from(schema.uid).toString('hex') : uid,
    definition: schema.definition,
    authority: schema.authority,
    revocable: schema.revocable,
    restricted: schema.restricted,
    predecessorUid: predecessor ? Buffer.from(predecessor).toString('hex') : null,
  };
}

/** One schema by UID; null when no schema with that UID is registered. */
export async function lookupSchema(read: SchemaReader, uid: string): Promise<SchemaRecord | null> {
  try {
    const response = await read({ uid: Buffer.from(uid, 'hex') });
    return toRecord(response.result.unwrap(), uid);
  } catch (error) {
    if (isSchemaNotFound(error)) return null;
    throw error;
  }
}

/**
 * The schema and its replacement history. Returns null when the requested UID
 * is not registered. The contract refuses predecessor cycles, but the walk is
 * still bounded so a bad read can never loop.
 */
export async function lookupSchemaChain(
  read: SchemaReader,
  uid: string,
  maxDepth = 10,
): Promise<SchemaChain | null> {
  const first = await lookupSchema(read, uid);
  if (!first) return null;

  const chain = [first];
  const seen = new Set([first.uid]);
  let next = first.predecessorUid;
  while (next && !seen.has(next)) {
    if (chain.length >= maxDepth) return { chain, missingPredecessor: null, truncated: true };
    const record = await lookupSchema(read, next);
    if (!record) return { chain, missingPredecessor: next, truncated: false };
    chain.push(record);
    seen.add(record.uid);
    next = record.predecessorUid;
  }
  return { chain, missingPredecessor: null, truncated: false };
}
