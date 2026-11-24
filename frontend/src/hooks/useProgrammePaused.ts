import { useContractRead } from './useContractRead';
import { PAUSED_REASON, readPaused, type PausedReader } from '../lib/paused';

export interface ProgrammePaused {
  /** True when the creator has paused it. */
  paused: boolean;
  /** Still reading. Treated as not paused: the contract re-checks when sending. */
  loading: boolean;
  /** The sentence to show beside a disabled action, or null while it is not paused. */
  reason: string | null;
}

/**
 * Whether a programme is paused, for the sheets that send a paused action.
 * Pass `null` for a sample programme or while no programme is chosen: nothing
 * is read and nothing is paused. One read per programme is shared through
 * `readPaused`. A read that fails does not block: the contract is the final
 * check, and its `Paused` refusal goes through `explain()`.
 */
export function useProgrammePaused(client: PausedReader | null, version = 0): ProgrammePaused {
  const read = useContractRead<boolean>(
    async () => ({ result: await readPaused(client!, version) }),
    [client, version],
    { contract: 'program', enabled: client !== null },
  );
  const paused = read.data === true;
  return { paused, loading: client !== null && read.loading, reason: paused ? PAUSED_REASON : null };
}
