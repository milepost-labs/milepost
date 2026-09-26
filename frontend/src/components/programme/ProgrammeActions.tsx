import { useState } from 'react';
import { Link } from 'react-router-dom';
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
}

/**
 * "What you can do now": every programme action, with who it is for and why
 * it is or is not available.
 *
 * Unavailable actions use `aria-disabled` rather than `disabled` so they stay
 * in the tab order: someone moving by keyboard or screen reader reaches the
 * button and hears the reason through `aria-describedby`, instead of the
 * action silently vanishing from the sequence.
 */
export function ProgrammeActions({ programmeId, phase, refundsOpen, refundable }: ProgrammeActionsProps) {
  const { address } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);
  const signedIn = Boolean(address);

  const actions = programmeActions({
    programmeId,
    phase: isPhase(phase) ? phase : null,
    signedIn,
    refundsOpen,
    refundable,
  });

  return (
    <aside className="programme-actions" aria-labelledby="programme-actions-heading">
      <h2 id="programme-actions-heading" className="programme-actions__heading">
        What you can do now
      </h2>

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

      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
    </aside>
  );
}
