import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import { formatAmount, describeAmount } from '../../lib/amount';
import { looksLikeContractId, truncateAddress } from '../../lib/format';
import { useAnnouncer } from '../../context/useAnnouncer';
import { PendingPulse } from '../state/AsyncStates';
import { ModePill } from '../ui';
import { AllocatedSpending } from './AllocatedSpending';
import './AwardCard.css';

interface AwardCardProps {
  award: RecipientAwardFixture;
  simulateAlreadyUsedError?: boolean;
}

/**
 * Convert a 64-char hex string to a 32-byte Buffer.
 * Returns null when the input is not valid 64-char lowercase/uppercase hex.
 */
function hexToBuffer(hex: string): Buffer | null {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) return null;
  return Buffer.from(clean, 'hex');
}

/** Where the money lands for each mode, in plain language. */
function modeDestination(mode: RecipientAwardFixture['mode'], payee: string | null): string {
  switch (mode) {
    case 'Direct':
      return payee
        ? `Paid straight to payee ${truncateAddress(payee)} — the recipient never holds the funds.`
        : 'Paid straight to the verified payee — the recipient never holds the funds.';
    case 'Allocated':
      return 'Held in escrow for you to direct to a verified payee when you are ready.';
    case 'Restricted':
      return 'Paid into your wallet. Spending is limited to verified payees by your policy signer.';
    case 'Open':
      return 'Paid directly into your wallet with no spending restriction.';
  }
}

/**
 * AwardCard — one award and its tranche tiles.
 *
 * Release is real for real programmes (56-char C… contract ids): it calls
 * `program.release({ recipient, attestation, attester })` through
 * `useTransaction`, re-reads `get_award` after confirmation so the tiles
 * reflect the chain, and shows the amount paid out in the success state.
 *
 * Sample programmes (fixture ids that are not contract addresses) keep the
 * stand-in path via `sampleSendable` so the layout can be judged without a
 * wallet.
 */
export function AwardCard({
  award,
  simulateAlreadyUsedError = false,
}: AwardCardProps) {
  const announce = useAnnouncer();
  const { address } = useWallet();
  const { programmeAt } = useSoroban();

  // Local state for release lifecycle
  const [releasedCount, setReleasedCount] = useState(award.tranchesReleased);
  const [releaseStatus, setReleaseStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [releaseErrorMessage, setReleaseErrorMessage] = useState<string | null>(null);

  const grantedBigInt = BigInt(award.granted);
  const trancheBase = award.tranches > 0 ? grantedBigInt / BigInt(award.tranches) : 0n;
  const releasedAmount = trancheBase * BigInt(releasedCount);

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
      amount,
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

        announce(`Tranche ${nextCount} released.`);
      }

  return (
    <article className="award-card" aria-labelledby={`award-${initialAward.programmeId}`}>
      {/* Header */}
      <div className="award-card__header">
        <div className="award-card__title-group">
          <Link
            id={`award-${initialAward.programmeId}`}
            to={`/programme/${encodeURIComponent(initialAward.programmeId)}`}
            className="award-card__title"
          >
            {liveAward.programmeName}
          </Link>
          <span className="award-card__meta">
            {releasedCount} of {tranches} tranches released ·{' '}
            <span className="numeric" aria-label={describeAmount(releasedBigInt, 'USDC')}>
              {formatAmount(releasedBigInt, { asset: 'USDC' })}
            </span>{' '}
            of{' '}
            <span className="numeric" aria-label={describeAmount(grantedBigInt, 'USDC')}>
              {formatAmount(grantedBigInt, { asset: 'USDC' })}
            </span>
          </span>
        </div>
        <ModePill mode={award.mode} />
      </div>

      {/* Tranche tiles */}
      <ol className="award-card__tranches" aria-label="Tranches">
        {tranchesList.map((t) => (
          <li key={t.index} className={`tranche-tile ${t.statusClass}`}>
            <span className="tranche-tile__num">Tranche {t.index}</span>
            <span
              className="tranche-tile__amount numeric"
              aria-label={describeAmount(t.amount, 'USDC')}
            >
              {t.amountFormatted}
            </span>
            <span className="tranche-tile__status">{t.statusLabel}</span>
          </li>
        ))}
      </ol>

      {/* Waiting-on-verifier banner (no proof yet) */}
      {!allReleased && !liveAward.attestationReady && !formOpen && (
        <div className="award-card__banner award-card__banner--waiting">
          <span>
            <strong>Waiting on your verifier.</strong>{' '}
            {liveAward.condition
              ? `Next condition: ${liveAward.condition}. `
              : ''}
            You&rsquo;ll be able to release it here once they confirm.
          </span>
        </div>
      )}

      {/* "Open release form" action for real programmes — permissionless */}
      {!allReleased && isReal && !formOpen && (
        <div className="award-card__banner award-card__banner--ready">
          <span className="award-card__banner-text">
            {liveAward.attestationReady
              ? <><strong>Proof received:</strong> {liveAward.condition}. Ready to release.</>
              : 'Have an attestation UID? You can submit a release.'}
          </span>
          <button
            type="button"
            className="award-card__release-btn"
            onClick={() => setFormOpen(true)}
          >
            Release tranche
          </button>
        </div>
      )}

      {/* Release form (real programmes) or sample release banner */}
      {showReleaseForm && (
        <div className="award-card__release-form" role="region" aria-label="Release a tranche">
          {/* Where-the-money-goes confirmation */}
          <p className="award-card__release-destination">
            <strong>Where this goes:</strong> {destination}
          </p>

          {isReal && (
            <>
              <div className="award-card__release-field">
                <Field
                  label="Attestation UID (hex)"
                  placeholder="64-character hex, e.g. 3f1a…"
                  value={attestationHex}
                  onChange={(e) => setAttestationHex(e.target.value)}
                  error={attestationError}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="award-card__release-field">
                <Field
                  label="Attester address"
                  placeholder="G…"
                  value={attesterInput}
                  onChange={(e) => setAttesterInput(e.target.value)}
                  error={attesterError}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </>
          )}

          <div className="award-card__release-actions">
            <Button
              onClick={() => void handleRelease()}
              disabled={!canRelease}
              loading={tx.busy}
            >
              {isSample ? 'Release tranche' : 'Sign and release'}
            </Button>
            {isReal && (
              <Button
                variant="secondary"
                onClick={() => {
                  setFormOpen(false);
                  setAttestationHex('');
                  setAttesterInput('');
                  tx.reset();
                }}
              >
                Cancel
              </Button>
            )}
          </div>

          <TransactionOutcome
            phase={tx.phase}
            error={tx.error}
            successTitle={`Tranche ${releasedCount} released`}
            successDescription={
              tx.result
                ? `${formatAmount(tx.result.amount, { asset: 'USDC' })} released.`
                : undefined
            }
            pendingTitle="Releasing tranche…"
            pendingNote="Usually a few seconds."
            onDismiss={() => tx.reset()}
            onRetry={() => void handleRelease()}
          />
        </div>
      )}

      {/* Error panel outside the form (e.g. after form was closed) */}
      {tx.phase === 'error' && tx.error && !showReleaseForm && (
        <ErrorPanel explained={tx.error} onRetry={() => setFormOpen(true)} live={false} />
      )}

      {/* Mode-specific spending actions */}
      <div className="award-card__mode-spending">
        {award.mode === 'Allocated' && (
          <AllocatedSpending award={award} />
        )}

        {liveAward.mode === 'Restricted' && (
          <>
            <div className="award-card__spending-header">
              <span className="award-card__spending-title">
                Released money goes to your own wallet
              </span>
            </div>
            <p className="award-card__spending-note">
              The spending policy constrains one signer, not the wallet, limiting
              onward spending to USDC, verified payees, and a cap.{' '}
              <Link to="/policy">Check your spend policy</Link>. If the policy
              isn&rsquo;t set up, there is no restriction at all.
            </p>
          </>
        )}

        {liveAward.mode === 'Direct' && (
          <>
            <div className="award-card__spending-header">
              <span className="award-card__spending-title">Paid directly to payee</span>
            </div>
            <p className="award-card__spending-note">
              Each award is paid straight to a verified payee chosen at award
              time. The recipient never holds the money.
            </p>
          </>
        )}

        {liveAward.mode === 'Open' && (
          <>
            <div className="award-card__spending-header">
              <span className="award-card__spending-title">
                Paid directly to your wallet
              </span>
            </div>
            <p className="award-card__spending-note">
              Released money goes directly to your wallet with no spending
              restrictions.
            </p>
          </>
        )}
      </div>
    </article>
  );
}
