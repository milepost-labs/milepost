import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { truncateAddress } from '../../lib/format';
import { registryVerificationCopy } from '../../lib/registryVerification';
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
  /** Passed through to `truncateAddress`. Defaults: lead=6, tail=4 — enough
   * of both ends to tell two addresses apart at a glance. */
  lead?: number;
  tail?: number;
  /** Accessible label for the copy button. Defaults to "Copy address". */
  copyLabel?: string;
  /**
   * Whether the registry deployed this address, from an existing
   * `registry.is_programme` read — omit entirely for addresses that are not
   * programmes (donors, reviewers, verifiers). Verifying on-chain is the
   * caller's job; this only renders what it is told.
   */
  verified?: boolean;
}

export function AddressChip({ address, lead, tail, copyLabel = 'Copy address', verified }: AddressChipProps) {
  const display = truncateAddress(address, lead, tail);
  const verification = verified === undefined ? null : registryVerificationCopy(verified);

  return (
    <span className="address-chip" title={address}>
      <code className="address-chip__text">{display}</code>
      {verification && (
        <span className={`address-chip__verified address-chip__verified--${verification.tone}`} title={verification.description}>
          {verified ? <ShieldCheck size={14} aria-hidden="true" /> : <ShieldAlert size={14} aria-hidden="true" />}
          <span className="visually-hidden">{verification.label}</span>
        </span>
      )}
      <CopyButton value={address} label={copyLabel} />
    </span>
  );
}
