import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useWallet } from '../../context/useWallet';
import { SignInSheet } from '../layout/SignInSheet';
import { isPhase } from '../../lib/phaseGate';
import { programmeActions } from '../../lib/programmeActions';
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
export function ProgrammeActions({ programmeId, phase, refundsOpen, refundable, verified }: ProgrammeActionsProps) {
  const { address } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);
  const signedIn = Boolean(address);

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
      <h2 id="programme-actions-heading" className="programme-actions__heading">
        What you can do now
      </h2>

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
          <button type="button" className="programme-actions__button" onClick={() => setSignInOpen(true)}>
            Sign in
          </button>
        </div>
      )}

      <ul className="programme-actions__list">
        {actions.map((action) => {
          const reasonId = `programme-action-why-${action.key}`;
          return (
            <li
              key={action.key}
              className={`programme-action${action.phaseAllows ? '' : ' programme-action--unavailable'}`}
            >
              <div className="programme-action__row">
                <span className="programme-action__text">
                  <span className="programme-action__label">{action.label}</span>
                  <span className="programme-action__who">{action.who}</span>
                </span>
                {action.enabled && action.href ? (
                  <Link to={action.href} className="programme-actions__button" aria-describedby={reasonId}>
                    {action.button}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="programme-actions__button programme-actions__button--off"
                    aria-disabled="true"
                    aria-describedby={reasonId}
                  >
                    {action.button}
                  </button>
                )}
              </div>
              <span id={reasonId} className="programme-action__reason">
                {action.reason}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="programme-actions__manage">
        <Link
          to={`/admin/payees?programme=${encodeURIComponent(programmeId)}`}
          className="programme-actions__button"
        >
          Manage payees
        </Link>
        <span className="programme-actions__manage-note">
          Only the programme&rsquo;s creator can verify or remove a payee.
        </span>
      </div>

      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
    </aside>
  );
}
