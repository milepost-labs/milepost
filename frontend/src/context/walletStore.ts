import { createContext } from 'react';

/**
 * Context object and types, separated from the provider component so that
 * React Fast Refresh works: a module exporting both a component and a value
 * cannot be hot-reloaded reliably.
 */

export type WalletStatus =
  | 'checking'
  | 'unavailable'
  | 'disconnected'
  | 'connected'
  | 'wrong-network';

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  /** What Freighter reports, e.g. "TESTNET". Null until known. */
  network: string | null;
  /** Present only when the connected network is not the expected one. */
  networkError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /**
   * Signer for the generated clients:
   * `tx.signAndSend({ signTransaction: wallet.signTransaction })`.
   */
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>;
}

export const WalletContext = createContext<WalletState | undefined>(undefined);
