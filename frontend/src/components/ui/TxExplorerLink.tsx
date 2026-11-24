import { ExternalLink } from 'lucide-react';
import { EXPECTED_NETWORK_NAME } from '../../context/walletStore';
import { explorerUrl } from '../../lib/format';

export interface TxExplorerLinkProps {
  /** The full transaction hash, never a shortened display form. */
  hash: string;
}

/**
 * Link a transaction hash to Stellar Expert on the network the app's
 * contracts are deployed to. The hash is the proof of a receipt, and the
 * explorer is where anyone can check it without trusting this app.
 */
export function TxExplorerLink({ hash }: TxExplorerLinkProps) {
  return (
    <a
      href={explorerUrl(hash, EXPECTED_NETWORK_NAME)}
      target="_blank"
      rel="noopener noreferrer"
      className="tx-explorer-link"
      aria-label="View on explorer: opens this transaction on Stellar Expert in a new tab"
    >
      View on explorer
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}
