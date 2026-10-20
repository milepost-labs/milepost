import { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import { useOpenProgrammes } from '../../hooks/useOpenProgrammes';
import { useTransaction } from '../../hooks/useTransaction';
import { useWallet } from '../../context/useWallet';
import { useSoroban } from '../../context/useSoroban';
import { useOpenProgrammes } from '../../hooks/useOpenProgrammes';
import { explain } from '../../lib/errors';
import { parseAmount, formatAmount } from '../../lib/amount';
import { isSampleProgrammeId } from '../../lib/programmeView';
import { SAMPLE_TX_DELAY_MS, sampleSendable, sampleOutcome } from '../../lib/fundingTx';
import { useAnnouncer } from '../../context/useAnnouncer';
import { Loading, ErrorState, TransactionOutcome } from '../state/AsyncStates';
import { Loading, ErrorState } from '../state/AsyncStates';
import { PendingPulse } from '../state/AsyncStates';
import './ApplyForm.css';

interface ApplyFormProps {
  preselectedProgrammeId?: string;
  onSubmitted?: (programmeId: string) => void;
  /** Milliseconds for the sample stand-in delay. */
  sampleDelayMs?: number;
}

export interface ApplyReceipt {
  programmeId: string;
  programmeName: string;
  amountFormatted: string;
  /** Transaction hash, empty string for samples. */
  txHash: string;
  /** Hex of the SHA-256 hash of the submitted notes. */
  metadataHashHex: string;
  sample: boolean;
}

/** SHA-256 of the exact UTF-8 bytes, returned as a 32-byte Buffer. */
async function sha256Buffer(text: string): Promise<Buffer> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Buffer.from(digest);
}

/** Lower-case hex representation of a Buffer. */
function toHex(buf: Buffer): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Shorten a hash for display: first 8 + '…' + last 8 characters. */
function shortHash(hex: string): string {
  if (hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

export function ApplyForm({
  preselectedProgrammeId,
  onSubmitted,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: ApplyFormProps) {
  const announce = useAnnouncer();
  const amountFieldId = useId();
  const notesFieldId = useId();
  const helpId = useId();

  const { address } = useWallet();
  const { programmeAt } = useSoroban();

  const { real, samples, loading, error, refetch } = useOpenProgrammes();

  // All Open programmes: real first, then samples.
  const allOpen = [...real, ...samples];

  const { real, samples, loading, error, refetch } = useOpenProgrammes();

  // All Open programmes in display order: real first, then samples.
  const allOpen = [...real, ...samples];

  const queryProgId = preselectedProgrammeId ?? '';
  const initialProgId =
    allOpen.some((p) => p.id === queryProgId)
      ? queryProgId
      : allOpen[0]?.id ?? '';

  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>(initialProgId);
  const [amountInput, setAmountInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [receipt, setReceipt] = useState<ApplyReceipt | null>(null);

  // Keep the selection valid as the list changes (e.g. a programme closes).
  const effectiveSelection =
    allOpen.some((p) => p.id === selectedProgrammeId)
      ? selectedProgrammeId
      : allOpen[0]?.id ?? '';

  // Amount validation using the project's existing parseAmount util.
  const amountResult = amountInput.trim()
    ? (() => {
        try {
          const v = parseAmount(amountInput);
          return { ok: true as const, value: v };
        } catch (e) {
          return { ok: false as const, error: e instanceof Error ? e.message : 'Invalid amount' };
        }
      })()
    : null;

  const amountError = amountResult && !amountResult.ok ? amountResult.error : '';
  const isValid =
    amountResult?.ok === true &&
    Boolean(effectiveSelection) &&
    notes.trim().length > 0;

  const tx = useTransaction<ApplyReceipt>({ contract: 'program' });

  const handleSubmit = async (e: React.FormEvent) => {
  const [step, setStep] = useState<'form' | 'pending' | 'done'>('form');
  const [submittedData, setSubmittedData] = useState<{
    progName: string;
    amountFormatted: string;
  } | null>(null);

  // Keep the selection valid if the programme list changes while the form is
  // open (e.g. a programme closes between renders).
  const effectiveSelection =
    allOpen.some((p) => p.id === selectedProgrammeId) ? selectedProgrammeId : allOpen[0]?.id ?? '';

  // Validate amount
  const cleanedAmount = amountInput.replace(/,/g, '').trim();
  const parsedNum = Number(cleanedAmount);
  const hasTyped = amountInput.length > 0;
  const isPositive = !Number.isNaN(parsedNum) && parsedNum > 0;
  const amountError = hasTyped && !isPositive ? explain(3, 'program').message : '';
  const isValid = isPositive && Boolean(effectiveSelection);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !amountResult?.ok) return;

    const stroops = amountResult.value;
    const selectedProg = allOpen.find((p) => p.id === effectiveSelection);
    if (!selectedProg) return;

    const isSample = isSampleProgrammeId(selectedProg.id) || selectedProg.sample;

    announce('Submitting your application…');

    const result = await tx.send(async () => {
      const notesText = notes.trim();
      const metadataHash = await sha256Buffer(notesText);
      const metadataHashHex = toHex(metadataHash);
      const amountFormatted = formatAmount(stroops, { asset: 'USDC' });
      const progName = selectedProg.name;
      const progId = selectedProg.id;
    const selectedProg = allOpen.find((p) => p.id === effectiveSelection);
    const progName = selectedProg?.name ?? 'Selected Programme';
    const stroops = BigInt(Math.floor(parsedNum * 10_000_000));
    const amountFormatted = formatAmount(stroops, { asset: 'USDC' });

      if (isSample) {
        return sampleSendable(() => {
          const { hash } = sampleOutcome(progId);
          return {
            programmeId: progId,
            programmeName: progName,
            amountFormatted,
            txHash: hash,
            metadataHashHex,
            sample: true,
          } satisfies ApplyReceipt;
        }, sampleDelayMs);
      }

      if (!address) throw new Error('No wallet connected.');

      const client = programmeAt(progId);
      const assembled = await client.apply({
        applicant: address,
        requested: stroops,
        metadata_hash: metadataHash,
      });

      return {
        signAndSend: async (
          options: Parameters<typeof assembled.signAndSend>[0],
        ) => {
          const sent = await assembled.signAndSend(options);
          // apply returns Result<void>; unwrap to surface contract errors.
          sent.result.unwrap();
          const txHash =
            (sent as { sendTransactionResponse?: { hash?: string } })
              .sendTransactionResponse?.hash ?? '';
          return {
            result: {
              programmeId: progId,
              programmeName: progName,
              amountFormatted,
              txHash,
              metadataHashHex,
              sample: false,
            } satisfies ApplyReceipt,
          };
        },
      };
    });

    if (result !== null) {
      setReceipt(result);
      announce('Application submitted.');
      onSubmitted?.(effectiveSelection);
    }
      onSubmitted?.(effectiveSelection, cleanedAmount);
    }, 1200);
  };

  const handleReset = () => {
    setAmountInput('');
    setNotes('');
    setReceipt(null);
    tx.reset();
  };

  // Show receipt once we have one (success), even after tx.reset would clear
  // tx.phase — receipt state drives the done view, not tx.phase.
  const showReceipt = receipt !== null && tx.phase !== 'error';

  return (
    <div className="apply-form-card">
      {/* ── Form ── */}
      {!tx.busy && !showReceipt && (
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <h2 className="apply-form__title">Apply for an award</h2>

          {/* Programme selection */}
          <fieldset className="apply-form__fieldset">
            <legend className="apply-form__legend">
              Programme · applications are only accepted while Open
            </legend>

            {loading && <Loading label="Reading open programmes" rows={2} />}

            {!loading && error && (
              <ErrorState error={error} contract="program" onRetry={refetch} />
            )}

            {!loading && !error && allOpen.length === 0 && (
              <p className="apply-form__empty">
                No programmes are currently accepting applications.
              </p>
            )}

            {!loading && !error && allOpen.length > 0 && (
              <div
                className="apply-form__programmes"
                role="radiogroup"
                aria-label="Open programmes"
              >
              <div className="apply-form__programmes" role="radiogroup" aria-label="Open programmes">
                {/* Real programmes from the index */}
                {real.length > 0 && (
                  <div className="apply-form__prog-group">
                    {real.map((p) => {
                      const isSelected = p.id === effectiveSelection;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`programme-option${isSelected ? ' programme-option--selected' : ''}`}
                          onClick={() => setSelectedProgrammeId(p.id)}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Sample programmes — always labelled as sample data */}
                {samples.length > 0 && (
                  <div className="apply-form__prog-group apply-form__prog-group--samples">
                    <span
                      className="apply-form__sample-label"
                      aria-label="Sample programmes for demonstration"
                    >
                      Sample data
                    </span>
                    {samples.map((p) => {
                      const isSelected = p.id === effectiveSelection;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`programme-option${isSelected ? ' programme-option--selected' : ''}`}
                          onClick={() => setSelectedProgrammeId(p.id)}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {/* Amount */}
          <div className="apply-form__field">
            <label htmlFor={amountFieldId} className="apply-form__label">
              How much do you need?
            </label>
            <div
              className={`apply-form__input-wrap${amountError ? ' apply-form__input-wrap--invalid' : ''}`}
            >
              <input
                id={amountFieldId}
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0"
                aria-describedby={helpId}
                className="apply-form__input"
              />
              <span className="apply-form__currency">USDC</span>
            </div>
            <span id={helpId} className="apply-form__help">
              Ask for what you actually need. Reviewers can approve up to this
              amount, not more. Your award is the middle of their votes.
            </span>
            <span role="alert" className="apply-form__error" aria-live="polite">
              {amountError}
            </span>
          </div>

          {/* Notes — hashed to produce metadata_hash */}
          <div className="apply-form__field">
            <label htmlFor={notesFieldId} className="apply-form__label">
              Application notes
            </label>
            <textarea
              id={notesFieldId}
              className="apply-form__notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what the funds are for and how they will be used."
              rows={4}
              aria-required="true"
            />
            <span className="apply-form__help">
              Your notes are hashed in the browser. The hash is stored on-chain
              as your application&rsquo;s commitment. Keep this text — you may
              need it later to prove what you submitted.
            </span>
            {notes.trim().length === 0 && amountInput.trim().length > 0 && (
              <span role="alert" className="apply-form__error" aria-live="polite">
                Notes are required.
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid}
            className="apply-form__submit-btn"
          >
            Submit application
          </button>

          {/* Inline error from a previous attempt */}
          {tx.phase === 'error' && tx.error && (
            <div className="apply-form__tx-error">
              <TransactionOutcome
                phase={tx.phase}
                error={tx.error}
                successTitle=""
                onRetry={() => tx.reset()}
              />
            </div>
          )}
        </form>
      )}

      {/* ── Pending ── */}
      {tx.busy && (
        <div role="status" className="apply-pending" aria-live="polite">
          <PendingPulse label="Submitting application" />
          <span className="apply-pending__label">
            Submitting your application…
          </span>
        </div>
      )}

      {/* ── Receipt ── */}
      {showReceipt && receipt && (
        <div className="apply-done" role="status">
          <span className="apply-done__badge">
            {receipt.sample ? 'Sample · ' : ''}✓ Application submitted
          </span>

          <span className="apply-done__summary">
            {receipt.amountFormatted} requested from {receipt.programmeName}
          </span>

          <dl className="apply-done__details">
            {receipt.txHash && (
              <div className="apply-done__detail">
                <dt>Transaction</dt>
                <dd className="numeric apply-done__hash" title={receipt.txHash}>
                  {shortHash(receipt.txHash)}
                </dd>
              </div>
            )}
            <div className="apply-done__detail">
              <dt>Application hash</dt>
              <dd
                className="numeric apply-done__hash"
                title={receipt.metadataHashHex}
              >
                {shortHash(receipt.metadataHashHex)}
              </dd>
            </div>
          </dl>

          <p className="apply-done__desc">
            The hash above is the SHA-256 of the notes you submitted. Keep your
            notes — they let you prove the commitment on-chain.
          </p>

          <p className="apply-done__desc">
            When applications close, reviewers each approve an amount. Follow
            it under Applications.
          </p>

          <div className="apply-done__actions">
            <Link
              to="/recipients/application-timeline"
              className="apply-done__timeline-link"
            >
              Follow application
            </Link>
            <button
              type="button"
              className="apply-done__reset-btn"
              onClick={handleReset}
            >
              Apply to another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
