import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { phaseLabel, useTransaction } from '../../hooks/useTransaction';
import { validateAmount } from '../../lib/amount';
import { explain, explainCode, isFailure, type Explained } from '../../lib/errors';
import { contributeBlockedReason, feeBpsOf, formatBps, splitContribution } from '../../lib/funding';
import {
  readPhase,
  receiptOf,
  SAMPLE_TX_DELAY_MS,
  sampleOutcome,
  sampleSendable,
  type TxReceipt,
} from '../../lib/fundingTx';
import type { Phase } from '../../lib/phaseGate';
import { formatUsdc, type DirectoryProgramme } from '../../lib/programmeView';
import { ErrorPanel, PendingState } from '../state/AsyncStates';
import { AmountField, RadioGroup } from '../ui';
import { ContributeReceipt } from './ContributeReceipt';
import './Funding.css';

const PRESETS = ['100', '500', '1,000'];
const STEPS = ['Amount', 'Confirm', 'Receipt'] as const;

type Step = 'amount' | 'confirm' | 'outcome';

type PhaseCheck =
  | { status: 'checking' }
  | { status: 'read'; phase: Phase }
  | { status: 'failed'; error: Explained };

export interface ContributeFlowProps {
  /** Every known programme. Only Open ones are offered. */
  programmes: DirectoryProgramme[];
  /** From `?programme=`: preselected, or shown as unavailable when not Open. */
  linkedProgrammeId?: string | null;
  /** Wallet balance in stroops. */
  balance: bigint;
  /** Stand-in transaction duration, overridable for tests. */
  sampleDelayMs?: number;
}

/** "Nothing was transferred" only when the contract refused it, which reverts everything. */
function failureAnnouncement(error: Explained): string {
  const transfer = error.code !== undefined ? ' Nothing was transferred.' : '';
  return `Contribution didn't go through. ${error.message}${transfer}`;
}

/**
 * Contribute: amount, confirm, then the receipt or the failure.
 *
 * An amount above the balance is refused inline and Continue stays disabled,
 * so it never reaches a signature. The phase is read again on entering
 * Confirm and once more immediately before signing: a programme that has left
 * Open is refused with `WrongPhase` rather than sent to fail on-chain.
 */
export function ContributeFlow({
  programmes,
  linkedProgrammeId = null,
  balance,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: ContributeFlowProps) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<TxReceipt>({ contract: 'program' });

  const open = programmes.filter((p) => p.chain.phase === 'Open');
  const linked = linkedProgrammeId ? programmes.find((p) => p.id === linkedProgrammeId) : undefined;

  const [picked, setPicked] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('amount');
  const [check, setCheck] = useState<PhaseCheck>({ status: 'checking' });
  // A refusal made here, before anything was signed.
  const [refusal, setRefusal] = useState<Explained | null>(null);

  const selectedId = picked ?? linked?.id ?? open[0]?.id ?? null;
  const programme = programmes.find((p) => p.id === selectedId);
  const blocked = programme ? contributeBlockedReason(programme.chain.phase) : null;

  const parsed = validateAmount(amount, { balance, asset: 'USDC' });
  const value = parsed.ok ? parsed.value : null;
  const feeBps = programme ? feeBpsOf(programme.chain) : 0n;
  const split = value !== null ? splitContribution(value, feeBps) : null;
  const canContinue = Boolean(programme && !blocked && value !== null);

  // A declined signature is a choice, not a failure: it returns to Confirm.
  const declined = tx.error !== null && !isFailure(tx.error);
  const failed = refusal ?? (tx.phase === 'error' ? tx.error : null);
  let view: 'amount' | 'confirm' | 'pending' | 'done' | 'error';
  if (step === 'amount') view = 'amount';
  else if (refusal) view = 'error';
  else if (step === 'confirm' || declined) view = 'confirm';
  else if (failed) view = 'error';
  else if (tx.phase === 'success') view = 'done';
  else view = 'pending';
  const stepIndex = view === 'amount' ? 0 : view === 'confirm' ? 1 : 2;

  useEffect(() => {
    if (step !== 'outcome' || refusal) return;
    if (tx.busy) announce(phaseLabel(tx.phase));
    else if (tx.phase === 'success' && programme && value !== null) {
      announce(`Contribution of ${formatUsdc(value)} to ${programme.name} confirmed.`);
    } else if (tx.phase === 'error' && tx.error) announce(failureAnnouncement(tx.error), 'alert');
  }, [announce, programme, refusal, step, tx.busy, tx.error, tx.phase, value]);

  const client = () => programmeAt(programme!.id);

  const checkPhase = () => {
    if (!programme) return;
    setCheck({ status: 'checking' });
    readPhase(programme, client).then(
      (phase) => setCheck({ status: 'read', phase }),
      (error) => setCheck({ status: 'failed', error: explain(error, 'program') }),
    );
  };

  const toConfirm = () => {
    if (!canContinue) return;
    tx.reset();
    setRefusal(null);
    setStep('confirm');
    checkPhase();
  };

  const refuse = (explained: Explained) => {
    setRefusal(explained);
    setStep('outcome');
    announce(failureAnnouncement(explained), 'alert');
  };

  const sign = async () => {
    if (!programme || value === null || !address) return;
    tx.reset();
    setRefusal(null);

    let phase: Phase;
    try {
      phase = await readPhase(programme, client);
    } catch (error) {
      refuse(explain(error, 'program'));
      return;
    }
    if (phase !== 'Open') {
      refuse(explainCode('program', 2));
      return;
    }

    setStep('outcome');
    await tx.send(async () => {
      if (programme.sample) return sampleSendable(() => sampleOutcome(programme.id), sampleDelayMs);
      const assembled = await client().contribute({ donor: address, amount: value });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          sent.result.unwrap();
          return { result: receiptOf(sent) };
        },
      };
    });
  };

  const retry = () => {
    tx.reset();
    setRefusal(null);
    setStep('confirm');
    checkPhase();
  };

  const startOver = () => {
    tx.reset();
    setRefusal(null);
    setAmount('');
    setStep('amount');
  };

  const programmeHref = programme ? `/programme/${encodeURIComponent(programme.id)}` : '/directory';
  const phaseOk = check.status === 'read' && check.phase === 'Open';

  return (
    <section className="fund-panel" aria-labelledby="contribute-heading">
      <div className="fund-panel__head">
        <h2 id="contribute-heading" className="fund-panel__title">
          Contribute
        </h2>
        <ol className="fund-steps" aria-label="Steps">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`fund-step${index === stepIndex ? ' fund-step--current' : ''}`}
              aria-current={index === stepIndex ? 'step' : undefined}
            >
              {index < stepIndex && <span aria-hidden="true">✓ </span>}
              {label}
            </li>
          ))}
        </ol>
      </div>

      {view === 'amount' && (
        <>
          {open.length > 0 ? (
            <RadioGroup
              label="Programme · only Open programmes accept contributions"
              name="contribute-programme"
              value={programme && !blocked ? programme.id : null}
              options={open.map((p) => ({ value: p.id, label: p.name }))}
              onChange={setPicked}
            />
          ) : (
            <p className="fund-note">No programme is Open right now.</p>
          )}

          {linked && blocked && picked === null && (
            <p className="fund-blocked" role="note">
              <strong>{linked.name}</strong>. {blocked}
            </p>
          )}

          <AmountField
            label="Amount"
            value={amount}
            onChange={setAmount}
            asset="USDC"
            presets={PRESETS}
            balance={balance}
          />

          <dl className="fund-breakdown">
            <div>
              <dt>Protocol fee ({formatBps(feeBps)}), taken from your contribution</dt>
              <dd className="numeric">{split ? `− ${formatUsdc(split.fee)}` : '—'}</dd>
            </div>
            <div>
              <dt>Added to the budget</dt>
              <dd className="numeric fund-breakdown__strong">{split ? formatUsdc(split.budget) : '—'}</dd>
            </div>
            <div>
              <dt>Network fee</dt>
              <dd>Shown by your wallet before you sign</dd>
            </div>
          </dl>

          <button type="button" className="fund-button fund-button--primary" disabled={!canContinue} onClick={toConfirm}>
            Continue
          </button>
        </>
      )}

      {view === 'confirm' && programme && value !== null && split && (
        <>
          <div className="fund-summary">
            <span className="fund-summary__label">You're contributing</span>
            <span className="fund-summary__amount numeric">{formatUsdc(value)}</span>
            <span className="fund-summary__to">to {programme.name}</span>
          </div>

          <dl className="fund-breakdown">
            <div>
              <dt>Added to the budget</dt>
              <dd className="numeric fund-breakdown__strong">{formatUsdc(split.budget)}</dd>
            </div>
            <div>
              <dt>Protocol fee, taken from the {formatUsdc(value)}</dt>
              <dd className="numeric">− {formatUsdc(split.fee)}</dd>
            </div>
            <div>
              <dt>If it isn't all awarded</dt>
              <dd>You get your share back</dd>
            </div>
          </dl>

          <p className={`fund-check fund-check--${check.status === 'read' ? (phaseOk ? 'ok' : 'blocked') : check.status}`}>
            {check.status === 'checking' && 'Checking the phase on-chain…'}
            {check.status === 'read' &&
              (phaseOk ? (
                <>
                  <span aria-hidden="true">✓ </span>
                  {programme.sample
                    ? 'Sample chain read: the programme is Open.'
                    : 'Checked on-chain just now: the programme is Open.'}
                </>
              ) : (
                contributeBlockedReason(check.phase)
              ))}
            {check.status === 'failed' && `Couldn't read the phase on-chain. ${check.error.message}`}
          </p>

          {declined && tx.error && (
            <p className="fund-note">
              {tx.error.message} {tx.error.action}
            </p>
          )}

          <div className="fund-actions">
            <button type="button" className="fund-button" onClick={() => setStep('amount')}>
              Back
            </button>
            {check.status === 'failed' ? (
              <button type="button" className="fund-button fund-button--primary fund-button--grow" onClick={checkPhase}>
                Check again
              </button>
            ) : (
              <button
                type="button"
                className="fund-button fund-button--primary fund-button--grow"
                disabled={!phaseOk}
                onClick={sign}
              >
                Confirm and sign
              </button>
            )}
          </div>
        </>
      )}

      {view === 'pending' && (
        <PendingState
          title={tx.busy && !programme?.sample ? phaseLabel(tx.phase) : 'Waiting for the network…'}
          note="Usually a few seconds. Keep this page open until it confirms."
          live={false}
        />
      )}

      {view === 'done' && programme && value !== null && tx.result && (
        <ContributeReceipt
          amount={value}
          programmeName={programme.name}
          programmeHref={programmeHref}
          receipt={tx.result}
          sample={programme.sample}
          onAgain={startOver}
        />
      )}

      {view === 'error' && failed && (
        <>
          <div className="fund-failure">
            <p className="fund-failure__title">Contribution didn't go through</p>
            <ErrorPanel explained={failed} onRetry={retry} live={false} />
          </div>
          <div className="fund-actions">
            <Link to={programmeHref} className="fund-button">
              View programme
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
