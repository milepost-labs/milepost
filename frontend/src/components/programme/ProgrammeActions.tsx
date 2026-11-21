import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { useWallet } from '../../context/useWallet';
import { SignInSheet } from '../layout/SignInSheet';
import { formatIn } from '../../lib/funding';
import { isPhase } from '../../lib/phaseGate';
import { programmeActions } from '../../lib/programmeActions';
import { sweepFeeGate } from '../../lib/sweepActions';
import { Button, DisabledReason } from '../ui';
import { SweepFeeSheet } from './SweepFeeSheet';
import './ProgrammeActions.css';

export interface ProgrammeActionsProps {
  programmeId: string;
  /** The on-chain phase tag, or null while it is being read. */
  phase: string | null;
  refundsOpen: boolean;
  /** Refundable amount, formatted with its asset. Null when nothing is refundable or it is unknown. */
  refundable: string | null;
  /**
   * Registry verification result.
   *
   * - `true`  — confirmed registry-deployed; normal phase/sign-in gating applies.
   * - `false` — not registry-deployed (or read failed); all writes blocked.
   * - `null`  — read still in flight; all writes blocked until answer arrives.
   *
   * The caller is responsible for mapping a failed read to `false` so network
   * errors never grant unverified programmes write access.
   */
  verified: boolean | null;
  /**
   * What the "send to the treasury" actions need. Omit to leave them off the
   * panel (screens that have not read the programme's figures).
   */
  sweep?: ProgrammeSweep;
}

export interface ProgrammeSweep {
  /** `fee()`: the protocol's cut. Null while it is being read. */
  fee: bigint | null;
  /** `get_config().treasury`. Null while it is being read. */
  treasury: string | null;
  /** Whether `sweep_fee` has already run. Null while it is being read. */
  feeSwept: boolean | null;
  asset: string;
  sample?: boolean;
  /** Called after a sweep lands, so the page re-reads what it changed. */
  onChanged: () => void;
}

/**
 * "What you can do now": every programme action, with who it is for and why
 * it is or is not available.
 *
 * Unavailable actions use `aria-disabled` rather than `disabled` so they stay
 * in the tab order: someone moving by keyboard or screen reader reaches the
 * button and hears the reason through `aria-describedby`, instead of the
 * action silently vanishing from the sequence.
 *
 * When `verified` is `false` (not registry-deployed) or `null` (still
 * reading), every write action is disabled and a warning banner explains why,
 * linking to the directory where trustworthy programmes can be found.
 */
export function ProgrammeActions({ programmeId, phase, refundsOpen, refundable, verified, sweep }: ProgrammeActionsProps) {
  const { address } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);
  const [sweepingFee, setSweepingFee] = useState(false);
  const signedIn = Boolean(address);

  const feeGate = sweep
    ? sweepFeeGate({
        phase: isPhase(phase) ? phase : null,
        signedIn,
        verified,
        sample: sweep.sample,
        feeSwept: sweep.feeSwept,
      })
    : null;
  // The sheet needs both figures; without them the action waits, with a reason.
  const feeReady = sweep !== undefined && sweep.fee !== null && sweep.treasury !== null;
  const feeBlockedReason =
    feeGate && feeGate.enabled && !feeReady ? 'Reading the fee and the treasury address…' : null;
  const feeEnabled = Boolean(feeGate?.enabled) && feeReady;

  const actions = programmeActions({
    programmeId,
    phase: isPhase(phase) ? phase : null,
    signedIn,
    refundsOpen,
    refundable,
    verified,
  });

  // Show the warning banner whenever writes are blocked due to verification —
  // either the read is still pending (null) or it came back negative (false).
  const showVerificationWarning = verified !== true;

  return (
    <aside className="programme-actions" aria-labelledby="programme-actions-heading">
      <div className="programme-actions__head">
        <h2 id="programme-actions-heading" className="programme-actions__heading">
          What you can do now
        </h2>
        <p className="programme-actions__sub">Checked against the clock and the chain.</p>
      </div>

      {showVerificationWarning && (
        <div
          className={`programme-actions__verify-warning${verified === null ? ' programme-actions__verify-warning--pending' : ''}`}
          role={verified === false ? 'alert' : 'status'}
          aria-live={verified === false ? 'assertive' : 'polite'}
        >
          {verified === false && (
            <ShieldAlert className="programme-actions__verify-icon" aria-hidden="true" size={20} />
          )}
          <div className="programme-actions__verify-body">
            <p className="programme-actions__verify-title">
              {verified === null
                ? 'Checking registry…'
                : 'Not deployed by the Milepost registry'}
            </p>
            {verified === false && (
              <p className="programme-actions__verify-desc">
                This address was not deployed by the Milepost registry. Write
                actions are disabled to protect against look-alike contracts.{' '}
                <Link to="/directory" className="programme-actions__verify-link">
                  Find a programme in the directory.
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {!signedIn && (
        <div className="programme-actions__signin">
          <p>Sign in to act on this programme. Everything on this page stays readable without it.</p>
          <Button size="sm" onClick={() => setSignInOpen(true)}>
            Sign in
          </Button>
        </div>
      )}

      <ul className="programme-actions__list">
        {actions.map((action) => {
          const reasonId = `programme-action-why-${action.key}`;
          return (
            <li key={action.key} className="programme-action">
              <div className="programme-action__row">
                <span className="programme-action__text">
                  <span className="programme-action__label">{action.label}</span>
                  <span className="programme-action__who">{action.who}</span>
                </span>
                {action.enabled && action.href ? (
                  <Link
                    to={action.href}
                    className="ui-button ui-button--primary ui-button--sm"
                    aria-describedby={reasonId}
                  >
                    {action.button}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="ui-button ui-button--secondary ui-button--sm"
                    aria-disabled="true"
                    aria-describedby={reasonId}
                  >
                    {action.button}
                  </button>
                )}
              </div>
              {action.enabled ? (
                <p id={reasonId} className="programme-action__reason">
                  {action.reason}
                </p>
              ) : (
                <DisabledReason id={reasonId}>{action.reason}</DisabledReason>
              )}
            </li>
          );
        })}

        {sweep && feeGate && (
          <li className="programme-action">
            <div className="programme-action__row">
              <span className="programme-action__text">
                <span className="programme-action__label">Send the protocol fee to the treasury</span>
                <span className="programme-action__who">Anyone, once applications have closed</span>
              </span>
              {feeEnabled ? (
                <Button size="sm" onClick={() => setSweepingFee(true)} aria-describedby="programme-action-why-sweep-fee">
                  Send fee
                </Button>
              ) : (
                <button
                  type="button"
                  className="ui-button ui-button--secondary ui-button--sm"
                  aria-disabled="true"
                  aria-describedby="programme-action-why-sweep-fee"
                >
                  Send fee
                </button>
              )}
            </div>
            {feeEnabled ? (
              <p id="programme-action-why-sweep-fee" className="programme-action__reason">
                {sweep.fee !== null ? `${formatIn(sweep.fee, sweep.asset)} goes to the treasury. ` : ''}
                {feeGate.reason}
              </p>
            ) : (
              <DisabledReason id="programme-action-why-sweep-fee">{feeBlockedReason ?? feeGate.reason}</DisabledReason>
            )}
          </li>
        )}
      </ul>

      <div className="programme-actions__manage">
        <Link
          to={`/admin/payees?programme=${encodeURIComponent(programmeId)}`}
          className="programme-actions__manage-link"
        >
          Manage payees
          <ArrowRight aria-hidden="true" />
        </Link>
        <span className="programme-actions__manage-note">
          Only the programme&rsquo;s creator can verify or remove a payee.
        </span>
      </div>

      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />

      {/* Stays mounted once opened, so the receipt is still there after the
          fee flag flips and the row above goes unavailable. */}
      {sweepingFee && sweep && sweep.fee !== null && sweep.treasury !== null && (
        <SweepFeeSheet
          programmeId={programmeId}
          open
          onClose={() => setSweepingFee(false)}
          fee={sweep.fee}
          asset={sweep.asset}
          treasury={sweep.treasury}
          onSwept={sweep.onChanged}
        />
      )}
    </aside>
  );
}
