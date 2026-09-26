import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useWallet } from '../../context/useWallet';
import { explain, isFailure } from '../../lib/errors';
import { ErrorPanel, PendingState } from '../state/AsyncStates';
import { Modal } from '../ui';

const FREIGHTER_URL = 'https://www.freighter.app/';

/**
 * Sign-in sheet. Freighter only: passkey sign-in and fee sponsorship do not
 * exist yet, so neither is offered or promised here.
 */
export function SignInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connect, status } = useWallet();
  const [step, setStep] = useState<'choose' | 'waiting'>('choose');
  const [error, setError] = useState<unknown>(null);
  const unavailable = status === 'unavailable';

  const close = () => {
    setStep('choose');
    setError(null);
    onClose();
  };

  const signIn = async () => {
    setError(null);
    setStep('waiting');
    try {
      await connect();
      close();
    } catch (caught) {
      setError(caught);
      setStep('choose');
    }
  };

  const explained = error ? explain(error, 'registry') : null;

  return (
    <Modal open={open} onClose={close} title="Sign in" busy={step === 'waiting'}>
      {step === 'waiting' ? (
        <PendingState title="Approve in Freighter" note="Check the Freighter window to continue." />
      ) : (
        <div className="sign-in">
          <button type="button" className="sign-in__option" onClick={signIn} disabled={unavailable}>
            <Wallet size={20} aria-hidden="true" />
            <span className="sign-in__text">
              <span className="sign-in__name">Freighter</span>
              <span className="sign-in__description">Browser extension wallet for Stellar.</span>
            </span>
          </button>
          {unavailable && (
            <p className="sign-in__note">
              Freighter is not installed in this browser.{' '}
              <a href={FREIGHTER_URL} target="_blank" rel="noreferrer">
                Get Freighter
              </a>
            </p>
          )}
          {explained &&
            (isFailure(explained) ? (
              <ErrorPanel explained={explained} onRetry={signIn} />
            ) : (
              <p className="sign-in__note">{explained.message}</p>
            ))}
          <p className="sign-in__note">Browsing programmes never needs sign-in.</p>
        </div>
      )}
    </Modal>
  );
}
