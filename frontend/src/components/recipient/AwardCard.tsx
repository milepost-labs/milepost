import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecipientAwardFixture, VerifiedPayeeFixture } from '../../fixtures/recipientFixtures';
import { FIXTURE_PAYEES } from '../../fixtures/recipientFixtures';
import { formatAmount } from '../../lib/amount';
import { explain } from '../../lib/errors';
import { useAnnouncer } from '../../context/useAnnouncer';
import { PendingPulse } from '../state/AsyncStates';
import './AwardCard.css';

interface AwardCardProps {
  award: RecipientAwardFixture;
  payees?: VerifiedPayeeFixture[];
  simulateAlreadyUsedError?: boolean;
  simulateUnverifiedPayeeError?: boolean;
}

export function AwardCard({
  award,
  payees = FIXTURE_PAYEES,
  simulateAlreadyUsedError = false,
  simulateUnverifiedPayeeError = false,
}: AwardCardProps) {
  const announce = useAnnouncer();

  // Local state for release lifecycle and payee sending
  const [releasedCount, setReleasedCount] = useState(award.tranchesReleased);
  const [releaseStatus, setReleaseStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [releaseErrorMessage, setReleaseErrorMessage] = useState<string | null>(null);

  // Escrow & payee state for Allocated mode
  const initialEscrow = award.escrow ? BigInt(award.escrow) : 0n;
  const [escrowAmount, setEscrowAmount] = useState<bigint>(initialEscrow);
  const [selectedPayeeIndex, setSelectedPayeeIndex] = useState<number>(0);
  const [payeeErrorMessage, setPayeeErrorMessage] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const grantedBigInt = BigInt(award.granted);
  const trancheBase = award.tranches > 0 ? grantedBigInt / BigInt(award.tranches) : 0n;
  const releasedAmount = trancheBase * BigInt(releasedCount);

  // Compute status for each tranche tile
  const isProofReady = award.attestationReady && releasedCount === award.tranchesReleased;
  const canRelease = isProofReady && releasedCount < award.tranches && releaseStatus !== 'pending';

  const tranchesList = Array.from({ length: award.tranches }, (_, i) => {
    const isLast = i === award.tranches - 1;
    const amount = isLast ? grantedBigInt - trancheBase * BigInt(award.tranches - 1) : trancheBase;
    const isReleased = i < releasedCount;
    const isNext = i === releasedCount;

    let statusLabel = 'Locked';
    let statusClass = 'tranche-tile--locked';

    if (isReleased) {
      statusLabel = 'Released';
      statusClass = 'tranche-tile--released';
    } else if (isNext) {
      if (isProofReady) {
        statusLabel = 'Proof received';
        statusClass = 'tranche-tile--proof-ready';
      } else {
        statusLabel = 'Waiting on verifier';
        statusClass = 'tranche-tile--waiting';
      }
    }

    return {
      index: i + 1,
      amountFormatted: formatAmount(amount, { asset: 'USDC' }),
      statusLabel,
      statusClass,
    };
  });

  const handleRelease = () => {
    setReleaseStatus('pending');
    setReleaseErrorMessage(null);

    setTimeout(() => {
      if (simulateAlreadyUsedError) {
        const errorDetail = explain(22, 'program');
        setReleaseStatus('error');
        setReleaseErrorMessage(errorDetail.message);
        announce('Tranche not released: proof already used.', 'alert');
      } else {
        const nextCount = releasedCount + 1;
        setReleasedCount(nextCount);
        setReleaseStatus('idle');

        // If allocated mode, add released tranche amount to escrow
        if (award.mode === 'Allocated') {
          setEscrowAmount((prev) => prev + trancheBase);
        }

        announce(`Tranche ${nextCount} released.`);
      }
    }, 1200);
  };

  const handleSendToPayee = () => {
    if (simulateUnverifiedPayeeError) {
      const err = explain(30, 'program');
      setPayeeErrorMessage(err.message);
      announce('Payment failed: ' + err.message, 'alert');
      return;
    }

    const chosenPayee = payees[selectedPayeeIndex];
    if (!chosenPayee) {
      const err = explain(30, 'program');
      setPayeeErrorMessage(err.message);
      announce('Payment failed: ' + err.message, 'alert');
      return;
    }

    setPayeeErrorMessage(null);
    setEscrowAmount(0n);
    const labelClean = chosenPayee.label.replace('Verified payee · ', '');
    const msg = `Sent to ${labelClean}.`;
    setSentMessage(msg);
    announce('Payment sent from escrow to the verified payee.');
  };

  return (
    <article className="award-card" aria-labelledby={`award-${award.programmeId}`}>
      {/* Header */}
      <div className="award-card__header">
        <div className="award-card__title-group">
          <Link
            id={`award-${award.programmeId}`}
            to={`/programme/${encodeURIComponent(award.programmeId)}`}
            className="award-card__title"
          >
            {award.programmeName}
          </Link>
          <span className="award-card__meta">
            {releasedCount} of {award.tranches} tranches released ·{' '}
            {formatAmount(releasedAmount, { asset: 'USDC' })} of{' '}
            {formatAmount(grantedBigInt, { asset: 'USDC' })}
          </span>
        </div>
        <span className="award-card__mode-badge">{award.mode} mode</span>
      </div>

      {/* Tranche Tiles (C03) */}
      <ol className="award-card__tranches" aria-label="Tranches">
        {tranchesList.map((t) => (
          <li key={t.index} className={`tranche-tile ${t.statusClass}`}>
            <span className="tranche-tile__num">Tranche {t.index}</span>
            <span className="tranche-tile__amount">{t.amountFormatted}</span>
            <span className="tranche-tile__status">{t.statusLabel}</span>
          </li>
        ))}
      </ol>

      {/* Release actions (#272) */}
      {canRelease && (
        <div className="award-card__banner award-card__banner--ready">
          <span className="award-card__banner-text">
            <strong>The verifier confirmed:</strong> {award.condition}. You can release the next tranche.
          </span>
          <button
            type="button"
            className="award-card__release-btn"
            onClick={handleRelease}
          >
            Release tranche
          </button>
        </div>
      )}

      {releaseStatus === 'pending' && (
        <div className="award-card__banner award-card__banner--releasing" role="status">
          <PendingPulse label="Releasing tranche" />
          <span>Releasing… waiting for the network.</span>
        </div>
      )}

      {releaseStatus === 'error' && (
        <div className="award-card__error-panel" role="alert">
          <span className="award-card__error-title">Tranche not released</span>
          <span>{releaseErrorMessage || explain(22, 'program').message}</span>
          <span className="award-card__error-technical">Nothing was transferred · program error 22</span>
        </div>
      )}

      {!isProofReady && releasedCount < award.tranches && (
        <div className="award-card__banner award-card__banner--waiting">
          <span>
            <strong>Waiting on your verifier.</strong> Next condition: {award.condition}. You'll be able to release it here once they confirm.
          </span>
        </div>
      )}

      {/* Mode-specific spending actions (#273) */}
      <div className="award-card__mode-spending">
        {award.mode === 'Allocated' && (
          <>
            <div className="award-card__spending-header">
              <span className="award-card__spending-title">Held for you in escrow</span>
              <span className="award-card__escrow-amount">
                {formatAmount(escrowAmount, { asset: 'USDC' })}
              </span>
            </div>
            {escrowAmount > 0n && !sentMessage && (
              <>
                <span className="award-card__spending-note">
                  Choose which verified payee receives it.
                </span>
                <div
                  className="award-card__payees-grid"
                  role="radiogroup"
                  aria-label="Verified payee"
                >
                  {payees.map((py, idx) => {
                    const isChecked = idx === selectedPayeeIndex;
                    return (
                      <button
                        key={py.address}
                        type="button"
                        role="radio"
                        aria-checked={isChecked}
                        className={`payee-option ${isChecked ? 'payee-option--selected' : ''}`}
                        onClick={() => setSelectedPayeeIndex(idx)}
                      >
                        <span className="payee-option__label">{py.label}</span>
                        <span className="payee-option__address">{py.address}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="award-card__send-btn"
                  onClick={handleSendToPayee}
                >
                  Send to payee
                </button>
              </>
            )}
            {payeeErrorMessage && (
              <div className="award-card__error-panel" role="alert">
                <span className="award-card__error-title">Payee not verified</span>
                <span>{payeeErrorMessage}</span>
                <span className="award-card__error-technical">Only verified payees can receive escrowed funds · program error 30</span>
              </div>
            )}
            {sentMessage && (
              <span className="award-card__success-msg" role="status">
                ✓ {sentMessage}
              </span>
            )}
          </>
        )}

        {award.mode === 'Restricted' && (
          <>
            <div className="award-card__spending-header">
              <span className="award-card__spending-title">Released money goes to your own wallet</span>
            </div>
            <p className="award-card__spending-note">
              The spending policy constrains one signer, not the wallet, limiting onward spending to USDC, verified payees, and a cap.{' '}
              <Link to="/policy">Check your spend policy</Link>. If the policy isn't set up, there is no restriction at all.
            </p>
          </>
        )}

        {award.mode === 'Direct' && (
          <>
            <div className="award-card__spending-header">
              <span className="award-card__spending-title">Paid directly to payee</span>
            </div>
            <p className="award-card__spending-note">
              Each award is paid straight to a verified payee chosen at award time. The recipient never holds the money.
            </p>
          </>
        )}

        {award.mode === 'Open' && (
          <>
            <div className="award-card__spending-header">
              <span className="award-card__spending-title">Paid directly to your wallet</span>
            </div>
            <p className="award-card__spending-note">
              Released money goes directly to your wallet with no spending restrictions.
            </p>
          </>
        )}
      </div>
    </article>
  );
}
