import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import type { Award } from '@milepost/program';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import { formatAmount, describeAmount } from '../../lib/amount';
import { looksLikeContractId, truncateAddress } from '../../lib/format';
import { isSampleProgrammeId } from '../../lib/programmeView';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useWallet } from '../../context/useWallet';
import { useSoroban } from '../../context/useSoroban';
import { useTransaction } from '../../hooks/useTransaction';
import { sampleSendable, SAMPLE_TX_DELAY_MS } from '../../lib/fundingTx';
import { Field, Button, ModePill } from '../ui';
import { ErrorPanel, TransactionOutcome } from '../state/AsyncStates';
import { AllocatedSpending } from './AllocatedSpending';
import './AwardCard.css';

interface AwardCardProps {
  award: RecipientAwardFixture;
  /** Overridable for tests: keep stand-in delay short. */
  sampleDelayMs?: number;
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
  award: initialAward,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: AwardCardProps) {
  const announce = useAnnouncer();
  const { address } = useWallet();
  const { programmeAt } = useSoroban();

  // On-chain award state: starts from the fixture/prop and is updated after
  // each confirmed release so tiles reflect the chain, not a local counter.
  const [liveAward, setLiveAward] = useState<RecipientAwardFixture>(initialAward);
  // A new award from the caller replaces the local copy.
  const [seenAward, setSeenAward] = useState(initialAward);
  if (initialAward !== seenAward) {
    setSeenAward(initialAward);
    setLiveAward(initialAward);
  }

  // Sample ids have the contract shape too, so shape alone cannot tell them apart.
  const isReal = looksLikeContractId(initialAward.programmeId) && !isSampleProgrammeId(initialAward.programmeId);
  const isSample = !isReal;

  // Release form state
  const [attestationHex, setAttestationHex] = useState('');
  const [attesterInput, setAttesterInput] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const tx = useTransaction<{ amount: bigint; txHash: string }>({ contract: 'program' });

  // Derived display values from live award state.
  const grantedBigInt = BigInt(liveAward.granted);
  const releasedBigInt = BigInt(liveAward.released);
  const releasedCount = liveAward.tranchesReleased;
  const tranches = liveAward.tranches;
  const trancheBase = tranches > 0 ? grantedBigInt / BigInt(tranches) : 0n;

  const tranchesList = useMemo(
    () =>
      Array.from({ length: tranches }, (_, i) => {
        const isLast = i === tranches - 1;
        const amount = isLast
          ? grantedBigInt - trancheBase * BigInt(tranches - 1)
          : trancheBase;
        const isReleased = i < releasedCount;
        const isNext = i === releasedCount;

        let statusLabel = 'Locked';
        let statusClass = 'tranche-tile--locked';

        if (isReleased) {
          statusLabel = 'Released';
          statusClass = 'tranche-tile--released';
        } else if (isNext) {
          if (liveAward.attestationReady) {
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
      }),
    [tranches, grantedBigInt, trancheBase, releasedCount, liveAward.attestationReady],
  );

  // Validate the attestation hex and attester address.
  const attestationBuf = hexToBuffer(attestationHex);
  const attestationError =
    attestationHex.trim().length > 0 && attestationBuf === null
      ? 'Enter the 64-character hex attestation UID.'
      : '';
  const attesterError =
    attesterInput.trim().length > 0 && !/^G[A-Z2-7]{55}$/.test(attesterInput.trim())
      ? 'Enter a valid Stellar address (starts with G).'
      : '';
  const canRelease =
    releasedCount < tranches &&
    !tx.busy &&
    (isSample ||
      (attestationBuf !== null && /^G[A-Z2-7]{55}$/.test(attesterInput.trim())));

  const handleRelease = async () => {
    if (!canRelease) return;

    const recipient = address ?? initialAward.recipient;
    const progId = initialAward.programmeId;
    const client = isReal ? programmeAt(progId) : null;
    const nextTranche = releasedCount + 1;

    const result = await tx.send(async () => {
      if (isSample) {
        return sampleSendable(() => ({ amount: trancheBase, txHash: '' }), sampleDelayMs);
      }

      const attBuf = attestationBuf!;
      const attester = attesterInput.trim();

      const assembled = await client!.release({
        recipient,
        attestation: attBuf,
        attester,
      });

      return {
        signAndSend: async (
          options: Parameters<typeof assembled.signAndSend>[0],
        ) => {
          const sent = await assembled.signAndSend(options);
          const amount = sent.result.unwrap();
          const txHash =
            (sent as { sendTransactionResponse?: { hash?: string } })
              .sendTransactionResponse?.hash ?? '';

          // Re-read the award so tiles reflect chain state, not a local counter.
          try {
            const fresh = await client!.get_award({ recipient });
            const freshAward = fresh.result.unwrap() as Award;
            setLiveAward({
              ...initialAward,
              granted: freshAward.granted.toString(),
              released: freshAward.released.toString(),
              tranches: freshAward.tranches,
              tranchesReleased: freshAward.tranches_released,
              payee:
                freshAward.mode.tag === 'Direct'
                  ? freshAward.payee
                  : null,
              mode: freshAward.mode.tag,
            });
          } catch {
            // If the re-read fails, fall back to incrementing locally so the
            // UI is not left in a stale confirmed-but-unchanged state.
            setLiveAward((prev) => ({
              ...prev,
              released: (BigInt(prev.released) + amount).toString(),
              tranchesReleased: prev.tranchesReleased + 1,
            }));
          }

          return { result: { amount, txHash } };
        },
      };
    });

    if (result !== null) {
      // A sample has no chain to re-read, so advance the stand-in locally.
      if (isSample) {
        setLiveAward((prev) => ({
          ...prev,
          released: (BigInt(prev.released) + result.amount).toString(),
          tranchesReleased: prev.tranchesReleased + 1,
        }));
      }
      announce(`Tranche ${nextTranche} released.`);
      setFormOpen(false);
      setAttestationHex('');
      setAttesterInput('');
    } else if (tx.error) {
      announce(`Tranche not released. ${tx.error.message}`, 'alert');
    }
  };

  const allReleased = releasedCount >= tranches;
  const showReleaseForm = !allReleased && (formOpen || isSample);
  const destination = modeDestination(liveAward.mode, liveAward.payee);

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
        <div className="award-card__badges">
          {initialAward.sample && (
            <span className="award-card__sample">Sample data</span>
          )}
          <ModePill mode={liveAward.mode} />
        </div>
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

      {/* The form closes on success; the receipt stays until dismissed. */}
      {tx.phase === 'success' && !showReleaseForm && (
        <TransactionOutcome
          phase={tx.phase}
          error={null}
          successTitle={`Tranche ${releasedCount} released`}
          successDescription={
            tx.result
              ? `${formatAmount(tx.result.amount, { asset: 'USDC' })} released.`
              : undefined
          }
          onDismiss={() => tx.reset()}
        />
      )}

      {/* Mode-specific spending actions */}
      <div className="award-card__mode-spending">
        {liveAward.mode === 'Allocated' && (
          <AllocatedSpending award={liveAward} />
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
