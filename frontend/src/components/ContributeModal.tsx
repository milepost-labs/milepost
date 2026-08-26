import { useState, useCallback } from 'react';
import { useWallet } from '../context/useWallet';
import { useSoroban } from '../context/useSoroban';
import { useContractResult, useTransaction, phaseLabel } from '../hooks';
import { Button, Field, Modal } from '../components/ui';
import { parseAmount, formatAmount } from '../lib/amount';

const ZERO = 0n;

interface ContributeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  programmeId: string;
}

export function ContributeModal({ open, onClose, onSuccess, programmeId }: ContributeModalProps) {
  const wallet = useWallet();
  const { programmeAt } = useSoroban();
  const programme = programmeAt(programmeId);
  const tx = useTransaction({ contract: 'program' });

  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const config = useContractResult(() => programme.get_config(), [programme]);
  const phase = useContractResult(() => programme.get_phase(), [programme]);

  const token = config.data?.token ?? null;

  const tokenBalance = useContractResult(
    useCallback(() => {
      if (!token) {
        return Promise.resolve({ unwrap: () => undefined as unknown as bigint });
      }
      const tokenProgramme = programmeAt(token);
      return tokenProgramme.balance({ id: wallet.address! });
    }, [token, programmeAt, wallet.address]),
    [token, wallet.address],
  );

  const donorBalance = tokenBalance.data ?? null;
  const isOpen = phase.data?.tag === 'Open';
  const feeBps = config.data?.fee_bps ?? 0;

  let parsedAmount = ZERO;
  let parseFailed = false;
  if (amountInput.trim()) {
    try {
      parsedAmount = parseAmount(amountInput.trim());
    } catch {
      parseFailed = true;
    }
  }

  const exceedsBalance = donorBalance !== null && parsedAmount > ZERO && parsedAmount > donorBalance;
  const canSubmit =
    !submitted &&
    isOpen &&
    parsedAmount > ZERO &&
    !parseFailed &&
    !exceedsBalance &&
    !tx.busy;

  const feeAmount = parsedAmount * BigInt(feeBps) / 10_000n;
  const budgetImpact = parsedAmount - feeAmount;

  const handleAmountChange = (value: string) => {
    setAmountInput(value);
    setAmountError(null);
    if (value.trim()) {
      try {
        parseAmount(value.trim());
      } catch (e) {
        setAmountError(e instanceof Error ? e.message : 'Invalid amount');
      }
    }
  };

  const handleSubmit = async () => {
    if (submitted || !wallet.address) return;
    setSubmitted(true);

    const result = await tx.send(() =>
      programme.contribute({
        donor: wallet.address!,
        amount: parsedAmount,
      }),
    );

    if (result) {
      setAmountInput('');
      setAmountError(null);
      onSuccess?.();
      onClose();
    } else {
      setSubmitted(false);
    }
  };

  const handleClose = () => {
    if (tx.busy || submitted) return;
    setAmountInput('');
    setAmountError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Contribute to Programme"
      busy={tx.busy || submitted}
    >
      {submitted && tx.phase === 'success' ? (
        <div className="contribute-success">
          <div className="contribute-success__icon" aria-hidden="true">✓</div>
          <p>Contribution recorded. Thank you!</p>
        </div>
      ) : (
        <>
          {!isOpen && (
            <div className="contribute-phase-warning" role="alert">
              <strong>Programme not accepting contributions.</strong>
              <span>
                Contributions are only accepted during the Open phase.
                {phase.data && ` Current phase: ${phase.data.tag}.`}
              </span>
            </div>
          )}

          <div className="contribute-balance-row">
            <span className="typo-text-sm text-muted">Available balance</span>
            <span className="typo-text-sm numeric">
              {donorBalance !== null
                ? formatAmount(donorBalance, { asset: 'XLM' })
                : token !== null
                  ? 'Loading…'
                  : '—'}
            </span>
          </div>

          <Field
            label="Amount (XLM)"
            hint="Minimum 0.0000001 XLM"
            error={amountError || (exceedsBalance ? 'Amount exceeds available balance.' : undefined)}
          >
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="ui-input"
              disabled={!isOpen}
            />
          </Field>

          {parsedAmount > ZERO && !parseFailed && (
            <div className="contribute-fee-box" aria-label="Fee breakdown">
              <div className="contribute-fee-row">
                <span>Your contribution</span>
                <strong className="numeric">{formatAmount(parsedAmount, { asset: 'XLM' })}</strong>
              </div>
              <div className="contribute-fee-row contribute-fee-row--muted">
                <span>Protocol fee ({feeBps / 100}%)</span>
                <span className="numeric">−{formatAmount(feeAmount, { asset: 'XLM' })}</span>
              </div>
              <div className="contribute-fee-row contribute-fee-row--total">
                <span>Awardable budget</span>
                <strong className="numeric">{formatAmount(budgetImpact, { asset: 'XLM' })}</strong>
              </div>
            </div>
          )}

          <p className="contribute-note">
            The protocol fee is deducted from the pooled funds, not added on top.
            Your full contribution is recorded; the fee reduces the awardable budget.
          </p>

          {tx.error && (
            <div className="wizard-error" role="alert">
              <div className="wizard-error__message">{tx.error.message}</div>
              {tx.error.action && <div className="wizard-error__action">{tx.error.action}</div>}
            </div>
          )}
        </>
      )}

      <div className="contribute-footer" slot="footer">
        <Button type="button" variant="ghost" onClick={handleClose} disabled={tx.busy || submitted}>
          {submitted ? 'Done' : 'Cancel'}
        </Button>
        {!submitted && (
          <Button
            type="button"
            onClick={handleSubmit}
            loading={tx.busy}
            loadingLabel={phaseLabel(tx.phase)}
            disabled={!canSubmit}
          >
            Confirm Contribution
          </Button>
        )}
      </div>
    </Modal>
  );
}
