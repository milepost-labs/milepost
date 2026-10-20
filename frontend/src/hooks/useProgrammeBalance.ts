import { useEffect, useMemo } from 'react';
import { rpc, type ProgrammeConfig } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { FIXTURE_BALANCE } from '../fixtures/funding';
import type { DirectoryProgramme } from '../lib/programmeView';
import { useContractRead, useContractResult } from './useContractRead';

/**
 * `balance(address)` on a Stellar Asset Contract.
 *
 * A programme's asset is its `token` in `get_config`; the balance lives on the
 * token contract, not the programme. `queryContract` simulates the call and
 * decodes the value, so nothing is built, signed or sent.
 */
async function readTokenBalance(
  rpcUrl: string,
  token: string,
  address: string,
): Promise<{ result: bigint }> {
  const server = new rpc.Server(rpcUrl);
  const { result } = await server.queryContract<bigint>(token, 'balance', { id: address });
  return { result };
}

export type ProgrammeBalanceStatus =
  /** Nothing to read: no programme chosen, or no signed-in address. */
  | 'idle'
  /** The token, or the balance on it, is still being read. */
  | 'reading'
  /** A balance was read. */
  | 'ready'
  /** The read failed: the balance is unknown, not zero. */
  | 'unavailable';

export interface ProgrammeBalanceState {
  /**
   * The signed-in address's balance of the chosen programme's asset, in
   * stroops. Null when there is nothing to read, the read is in flight, or it
   * failed — never treat null as zero, which would refuse every amount.
   */
  balance: bigint | null;
  status: ProgrammeBalanceStatus;
  refetch: () => void;
}

/**
 * The signed-in address's balance of the chosen programme's asset.
 *
 * Read from the programme's token contract once a programme is chosen, so the
 * contribute amount is capped by what the chain says rather than a stand-in.
 * A sample programme has no contract behind it, so its balance is the
 * stand-in, matching how its phase and receipt are stand-ins too.
 *
 * `balance` stays null while the read is in flight and after it fails, so an
 * amount is only ever refused against a figure that was actually read. Refetch
 * on `milepost:transaction-success` so a contribution updates it.
 */
export function useProgrammeBalance(programme?: DirectoryProgramme | null): ProgrammeBalanceState {
  const { address } = useWallet();
  const { programmeAt, rpcUrl } = useSoroban();

  const programmeId = programme?.id ?? null;
  const sample = Boolean(programme?.sample);

  // No point building a client for a sample: there is no contract to read.
  const client = useMemo(
    () => (programmeId && !sample ? programmeAt(programmeId) : null),
    [programmeId, sample, programmeAt],
  );

  const config = useContractResult<ProgrammeConfig>(() => client!.get_config(), [client], {
    enabled: Boolean(client),
  });
  const token = config.data?.token ?? null;

  const read = useContractRead(
    () => readTokenBalance(rpcUrl, token!, address!),
    [rpcUrl, token, address],
    { enabled: !sample && Boolean(token) && Boolean(address) },
  );
  const { refetch } = read;

  useEffect(() => {
    window.addEventListener('milepost:transaction-success', refetch);
    return () => {
      window.removeEventListener('milepost:transaction-success', refetch);
    };
  }, [refetch]);

  return useMemo(() => {
    if (sample) return { balance: BigInt(FIXTURE_BALANCE), status: 'ready' as const, refetch };
    if (!programmeId || !address) return { balance: null, status: 'idle' as const, refetch };
    if (config.error || read.error) return { balance: null, status: 'unavailable' as const, refetch };
    if (token === null || read.data === null) {
      return { balance: null, status: 'reading' as const, refetch };
    }
    return { balance: read.data, status: 'ready' as const, refetch };
  }, [sample, programmeId, address, config.error, read.error, token, read.data, refetch]);
}
