import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import { networks } from '@milepost/registry';
import { WalletContext, EXPECTED_NETWORK_NAME, type WalletState, type WalletStatus } from './walletStore';

/**
 * Wallet connection and the signer every write depends on.
 *
 * Deliberately does not model a "current role". Roles in this protocol are
 * per-programme, not per-session: the same person may be a donor on one
 * programme and a reviewer on another, and a global role would be wrong for
 * both.
 */

const EXPECTED_PASSPHRASE = networks.testnet.networkPassphrase;


/** Freighter returns errors in the payload rather than throwing. */
function unwrap<T extends { error?: unknown }>(result: T): T {
  if (result.error) {
    const message =
      typeof result.error === 'string'
        ? result.error
        : (result.error as { message?: string })?.message ?? 'Freighter request failed';
    throw new Error(message);
  }
  return result;
}

const IS_FIXTURE_MODE = import.meta.env.VITE_FIXTURES === '1';
const FIXTURE_WALLET_ADDRESS = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>(IS_FIXTURE_MODE ? 'connected' : 'checking');
  const [address, setAddress] = useState<string | null>(IS_FIXTURE_MODE ? FIXTURE_WALLET_ADDRESS : null);
  const [network, setNetwork] = useState<string | null>(IS_FIXTURE_MODE ? 'TESTNET' : null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const readNetwork = useCallback(async () => {
    if (IS_FIXTURE_MODE) {
      setNetwork('TESTNET');
      setNetworkError(null);
      return true;
    }
    const result = unwrap(await getNetwork());
    setNetwork(result.network);
    const actual = result.network ?? 'an unknown network';

    if (result.networkPassphrase !== EXPECTED_PASSPHRASE) {
      setNetworkError(
        `Freighter is on ${actual}, but these contracts are deployed on ${EXPECTED_NETWORK_NAME}. Switch network in Freighter to continue.`,
      );
      return false;
    }
    setNetworkError(null);
    return true;
  }, []);

  // Restore an existing connection on load, so a refresh does not look like a
  // disconnect.
  useEffect(() => {
    if (IS_FIXTURE_MODE) {
      setStatus('connected');
      setAddress(FIXTURE_WALLET_ADDRESS);
      setNetwork('TESTNET');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (!unwrap(await isConnected()).isConnected) {
          if (!cancelled) setStatus('unavailable');
          return;
        }
        if (!unwrap(await isAllowed()).isAllowed) {
          if (!cancelled) setStatus('disconnected');
          return;
        }

        const { address: existing } = unwrap(await getAddress());
        const onExpectedNetwork = await readNetwork();
        if (cancelled) return;

        setAddress(existing || null);
        setStatus(!existing ? 'disconnected' : onExpectedNetwork ? 'connected' : 'wrong-network');
      } catch {
        // A wallet that cannot be interrogated is indistinguishable from one
        // that is not installed, and the remedy is the same.
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [readNetwork]);

  const connect = useCallback(async () => {
    if (IS_FIXTURE_MODE) {
      setAddress(FIXTURE_WALLET_ADDRESS);
      setNetwork('TESTNET');
      setStatus('connected');
      return;
    }
    const { address: granted } = unwrap(await requestAccess());
    const onExpectedNetwork = await readNetwork();
    setAddress(granted);
    setStatus(onExpectedNetwork ? 'connected' : 'wrong-network');
  }, [readNetwork]);

  // Local only. Freighter has no revoke API, so this forgets the account here
  // rather than pretending to disconnect the wallet itself.
  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus('disconnected');
  }, []);

  // Recovery after switching networks in the wallet: re-read the network and
  // update the status, so the banner clears without a reconnect. Reads and
  // browsing never depended on this; only writes check it.
  const recheckNetwork = useCallback(async () => {
    if (IS_FIXTURE_MODE) return;
    try {
      const onExpectedNetwork = await readNetwork();
      setStatus((previous) => {
        if (previous === 'wrong-network' && onExpectedNetwork) return address ? 'connected' : 'disconnected';
        if (!onExpectedNetwork && address) return 'wrong-network';
        return previous;
      });
    } catch {
      // Keep the previous state; the next connect attempt re-reads anyway.
    }
  }, [address, readNetwork]);

  const sign = useCallback(
    async (xdr: string) => {
      if (IS_FIXTURE_MODE) {
        return { signedTxXdr: xdr, signerAddress: address ?? FIXTURE_WALLET_ADDRESS };
      }
      if (!address) throw new Error('Connect a wallet before signing.');
      const result = unwrap(await getNetwork());
      if (result.networkPassphrase !== EXPECTED_PASSPHRASE) {
        throw new Error(
          `Freighter is on ${result.network ?? 'an unknown network'}, but these contracts are deployed on ${EXPECTED_NETWORK_NAME}. Switch network in Freighter to continue.`,
        );
      }
      const signed = unwrap(
        await signTransaction(xdr, { networkPassphrase: EXPECTED_PASSPHRASE, address }),
      );
      return { signedTxXdr: signed.signedTxXdr, signerAddress: signed.signerAddress };
    },
    [address],
  );

  const value = useMemo<WalletState>(
    () => ({
      status,
      address,
      network,
      networkError,
      expectedNetwork: EXPECTED_NETWORK_NAME,
      connect,
      disconnect,
      recheckNetwork,
      signTransaction: sign,
    }),
    [status, address, network, networkError, connect, disconnect, recheckNetwork, sign],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}


