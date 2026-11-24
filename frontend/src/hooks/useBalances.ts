import { useEffect } from 'react';
import { NETWORK } from '../config/network';
import { useWallet } from '../context/useWallet';
import { useIndexedList } from './useIndexedList';

export interface BalancesState {
  /** Native XLM in stroops, or null when the read failed or has not landed. */
  xlm: bigint | null;
  /** True when the account does not exist on the network yet, or holds 0 XLM. */
  isUnfunded: boolean;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface AccountRead {
  xlm: bigint;
  isUnfunded: boolean;
}

/**
 * The account's native balance, from its ledger entry on the RPC. No entry
 * means the account has never been funded. A failed read throws, so it shows
 * as an error and never as a zero balance.
 */
async function readAccount(address: string): Promise<AccountRead> {
  // Loaded when an account is first read, so the SDK is not part of the page
  // someone lands on before they have connected a wallet.
  const { Keypair, rpc, xdr } = await import('@stellar/stellar-sdk');
  const server = new rpc.Server(NETWORK.rpcUrl, { allowHttp: NETWORK.rpcUrl.startsWith('http://') });
  const key = xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(address).xdrAccountId() }),
  );
  const { entries } = await server.getLedgerEntries(key);

  const entry = entries[0];
  if (!entry) return { xlm: 0n, isUnfunded: true };

  const xlm = BigInt(entry.val.account().balance().toString());
  return { xlm, isUnfunded: xlm === 0n };
}

/**
 * Reads the native XLM balance for an address.
 * Automatically refreshes when a contract transaction succeeds.
 */
export function useBalances(targetAddress?: string | null): BalancesState {
  const wallet = useWallet();
  const address = targetAddress !== undefined ? targetAddress : wallet.address;

  const read = useIndexedList(() => readAccount(address as string), [address], {
    enabled: Boolean(address),
  });
  const { refetch } = read;

  useEffect(() => {
    window.addEventListener('milepost:transaction-success', refetch);
    return () => {
      window.removeEventListener('milepost:transaction-success', refetch);
    };
  }, [refetch]);

  const error =
    read.error == null ? null : read.error instanceof Error ? read.error : new Error(String(read.error));

  return {
    xlm: address && !error ? (read.data?.xlm ?? null) : null,
    isUnfunded: Boolean(address) && !error && (read.data?.isUnfunded ?? false),
    loading: Boolean(address) && read.fetching,
    error,
    refetch,
  };
}
