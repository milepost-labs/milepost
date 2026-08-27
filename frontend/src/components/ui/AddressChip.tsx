import { truncateAddress } from '../../lib/format';
import { CopyButton } from './CopyButton';

/**
 * Displays a Stellar address (or any long identifier) in truncated form with
 * a copy affordance that copies the *full* value.
 *
 * Copying the truncated form is how people accidentally send to the wrong
 * account — this component makes it structurally impossible.
 */

export interface AddressChipProps {
  address: string;
  /** Passed through to `truncateAddress`. Defaults: lead=6, tail=4. */
  lead?: number;
  tail?: number;
  /** Accessible label for the copy button. Defaults to "Copy address". */
  copyLabel?: string;
}

export function AddressChip({ address, lead, tail, copyLabel = 'Copy address' }: AddressChipProps) {
  const display = truncateAddress(address, lead, tail);

  return (
    <span className="address-chip" title={address}>
      <code className="address-chip__text">{display}</code>
      <CopyButton value={address} label={copyLabel} />
    </span>
  );
}
