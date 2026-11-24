import { useState } from 'react';
import { Info, Wallet } from 'lucide-react';
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
    <Modal open={open} onClose={close} title="Connect your wallet" busy={step === 'waiting'}>
      {step === 'waiting' ? (
        <PendingState title="Waiting for Freighter" note="Approve the connection in the Freighter window." />
      ) : (
        <div className="sign-in">
          <p className="sign-in__lead">
            Milepost works with <strong>Freighter</strong>, a browser wallet for Stellar. Signing in lets you
            contribute, apply, verify and release. Browsing programmes never needs sign-in.
          </p>
          <button type="button" className="btn-primary sign-in__option" onClick={signIn} disabled={unavailable}>
            <Wallet aria-hidden="true" />
            Connect Freighter
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
          <p className="sign-in__info">
            <Info aria-hidden="true" />
            <span>
              You pay your own network fees in XLM, a small amount per action. This is Stellar{' '}
              <strong>testnet</strong>: don’t use real funds.
            </span>
          </p>
        </div>
      )}
    </Modal>
  );
}
