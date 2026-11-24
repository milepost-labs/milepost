import { useKeyedRead } from './useKeyedRead';
import { isZeroHash, resolveMetadata, type ResolvedMetadata } from '../lib/metadata';

/**
 * A programme's description, looked up in the metadata store by the hash it
 * committed to on the chain, and checked against that hash before anything
 * is shown. Null while there is no hash to look up.
 */
export function useProgrammeMetadata(hashHex: string | null): ResolvedMetadata | null {
  const read = useKeyedRead(hashHex, (hash) => resolveMetadata(hash));
  if (hashHex === null) return null;
  if (isZeroHash(hashHex)) return { status: 'none' };
  return read.status === 'ok' ? read.data : read.status === 'error' ? { status: 'unavailable', reason: 'Could not read the description.' } : null;
}

