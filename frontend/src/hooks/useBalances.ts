import { useEffect } from 'react';
import { useWallet } from '../context/useWallet';
import { parseAmount } from '../lib/amount';
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

const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';

interface AccountRead {
  xlm: bigint;
  isUnfunded: boolean;
}

async function readAccount(address: string): Promise<AccountRead> {
  const response = await fetch(`${HORIZON_TESTNET_URL}/accounts/${encodeURIComponent(address)}`);

  // Horizon answers 404 for an account that has never been funded.
  if (response.status === 404) return { xlm: 0n, isUnfunded: true };
  if (!response.ok) throw new Error(`Horizon error: ${response.statusText}`);

  const data = await response.json();
  const balances = (data.balances || []) as Array<{ asset_type: string; balance: string }>;
  const native = balances.find((b) => b.asset_type === 'native');
  const xlm = native ? parseAmount(native.balance) : 0n;
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
