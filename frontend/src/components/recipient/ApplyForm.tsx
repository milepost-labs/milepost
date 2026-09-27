import { useState, useId } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FIXTURE_PROGRAMMES, FIXTURE_CHAIN } from '../../fixtures/programmes';
import { explain } from '../../lib/errors';
import { formatAmount } from '../../lib/amount';
import { useAnnouncer } from '../../context/useAnnouncer';
import { PendingPulse } from '../state/AsyncStates';
import './ApplyForm.css';

interface ApplyFormProps {
  preselectedProgrammeId?: string;
  onSubmitted?: (programmeId: string, amount: string) => void;
}

export function ApplyForm({ preselectedProgrammeId, onSubmitted }: ApplyFormProps) {
  const [searchParams] = useSearchParams();
  const announce = useAnnouncer();
  const amountFieldId = useId();
  const helpId = useId();

  // Filter ONLY Open programmes
  const openProgrammes = FIXTURE_PROGRAMMES.filter(
    (p) => FIXTURE_CHAIN[p.id]?.phase === 'Open'
  );

  const queryProgId = preselectedProgrammeId || searchParams.get('programme') || '';
  const initialProgId =
    openProgrammes.some((p) => p.id === queryProgId)
      ? queryProgId
      : openProgrammes[0]?.id || '';

  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>(initialProgId);
  const [amountInput, setAmountInput] = useState<string>('');
  const [step, setStep] = useState<'form' | 'pending' | 'done'>('form');
  const [submittedData, setSubmittedData] = useState<{ progName: string; amountFormatted: string } | null>(null);

  // Validate amount
  const cleanedAmount = amountInput.replace(/,/g, '').trim();
  const parsedNum = Number(cleanedAmount);
  const hasTyped = amountInput.length > 0;
  const isPositive = !Number.isNaN(parsedNum) && parsedNum > 0;
  const amountError = hasTyped && !isPositive ? explain(3, 'program').message : '';
  const isValid = isPositive && Boolean(selectedProgrammeId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setStep('pending');
    announce('Submitting your application…');

    const selectedProg = openProgrammes.find((p) => p.id === selectedProgrammeId);
    const progName = selectedProg?.name || 'Selected Programme';
    const stroops = BigInt(Math.floor(parsedNum * 10_000_000));
    const amountFormatted = formatAmount(stroops, { asset: 'USDC' });

    setTimeout(() => {
      setSubmittedData({ progName, amountFormatted });
      setStep('done');
      announce('Application submitted.');
      onSubmitted?.(selectedProgrammeId, cleanedAmount);
    }, 1200);
  };

  const handleReset = () => {
    setAmountInput('');
    setStep('form');
    setSubmittedData(null);
  };

  return (
    <div className="apply-form-card">
      {step === 'form' && (
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="apply-form__title">Apply for an award</h2>

          {/* Programme selection */}
          <fieldset className="apply-form__fieldset">
            <legend className="apply-form__legend">
              Programme · applications are only accepted while Open
            </legend>
            <div className="apply-form__programmes" role="radiogroup" aria-label="Open programmes">
              {openProgrammes.map((p) => {
                const isSelected = p.id === selectedProgrammeId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`programme-option ${isSelected ? 'programme-option--selected' : ''}`}
                    onClick={() => setSelectedProgrammeId(p.id)}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Amount input & explanation */}
          <div className="apply-form__field">
            <label htmlFor={amountFieldId} className="apply-form__label">
              How much do you need?
            </label>
            <div
              className={`apply-form__input-wrap ${amountError ? 'apply-form__input-wrap--invalid' : ''}`}
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
              Ask for what you actually need. Reviewers can approve up to this amount, not more. Your award is the middle of their votes.
            </span>

            <span role="alert" className="apply-form__error" aria-live="polite">
              {amountError}
            </span>
          </div>

          <button
            type="submit"
            disabled={!isValid}
            className="apply-form__submit-btn"
          >
            Submit application
          </button>
        </form>
      )}

      {step === 'pending' && (
        <div role="status" className="apply-pending" aria-live="polite">
          <PendingPulse label="Submitting application" />
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)' }}>
            Submitting your application…
          </span>
        </div>
      )}

      {step === 'done' && submittedData && (
        <div className="apply-done" role="status">
          <span className="apply-done__badge">✓ Application submitted</span>
          <span className="apply-done__summary">
            {submittedData.amountFormatted} requested from {submittedData.progName}
          </span>
          <p className="apply-done__desc">
            When applications close, reviewers each approve an amount. Follow it under Applications.
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
