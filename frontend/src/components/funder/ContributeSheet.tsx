import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { phaseLabel, useTransaction } from '../../hooks/useTransaction';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useProgrammePaused } from '../../hooks/useProgrammePaused';
import { useProgrammeBalance, type ProgrammeBalanceStatus } from '../../hooks/useProgrammeBalance';
import { NETWORK } from '../../config/network';
import { samplesEnabled } from '../../lib/samples';
import { useBalances } from '../../hooks/useBalances';
import { formatAmount, STROOPS_PER_UNIT, validateAmount } from '../../lib/amount';
import { explain, explainCode, isFailure, type Explained } from '../../lib/errors';
import {
  BPS_DENOMINATOR,
  contributeBlockedReason,
  feeBpsOf,
  formatBps,
  formatIn,
  formatShare,
  splitContribution,
} from '../../lib/funding';
import {
  readPhase,
  receiptOf,
  SAMPLE_TX_DELAY_MS,
  sampleOutcome,
  sampleSendable,
  type TxReceipt,
} from '../../lib/fundingTx';
import type { Phase } from '../../lib/phaseGate';
import { PAUSED_REASON } from '../../lib/paused';
import { shortId, type DirectoryProgramme } from '../../lib/programmeView';
import { useProgrammeAsset } from '../../hooks/useProgrammeAsset';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';
import { AmountField, Button, CopyButton, DisabledReason, Modal, Notice, Receipt, SampleTag, Select, TxExplorerLink } from '../ui';
import { restoreFromAssembled } from '../../lib/restore';
import './ContributeSheet.css';

const PRESETS = ['50', '100', '250', '500', '1,000'];
const MIN_XLM_RESERVE = STROOPS_PER_UNIT;

type Step = 'amount' | 'confirm' | 'outcome';
type View = 'amount' | 'confirm' | 'pending' | 'done' | 'error';
/** The bars across the top of the sheet: amount, confirm, sending, receipt. */
const PROGRESS: Record<View, number> = { amount: 0, confirm: 1, pending: 2, error: 2, done: 3 };

type PhaseCheck =
  | { status: 'checking' }
  | { status: 'read'; phase: Phase }
  | { status: 'failed'; error: Explained };

export interface ContributeSheetProps {
  open: boolean;
  onClose: () => void;
  /** Every known programme. Only Open ones are offered. */
  programmes: DirectoryProgramme[];
  /** From `?programme=` or the button that opened the sheet: preselected, or shown as unavailable when not Open. */
  linkedProgrammeId?: string | null;
  /** Stand-in transaction duration, overridable for tests. */
  sampleDelayMs?: number;
}

/** "Nothing was transferred" only when the contract refused it, which reverts everything. */
function failureAnnouncement(error: Explained): string {
  const transfer = error.code !== undefined ? ' Nothing was transferred.' : '';
  return `Contribution didn't go through. ${error.message}${transfer}`;
}

/** What to say about the balance while it is not known. `undefined` lets `AmountField` show the figure. */
function balanceHint(status: ProgrammeBalanceStatus): string | undefined {
  if (status === 'unavailable') return 'Balance unavailable';
  if (status === 'reading') return 'Checking your balance…';
  return undefined;
}

/**
 * The terms a contribution is worked out against. A sample programme has its
 * stand-in figures; a deployed one is read from its contract, because the
 * directory's figures for it are stand-ins too. Null while unknown.
 */
function useProgrammeTerms(programme: DirectoryProgramme | undefined) {
  const { programmeAt } = useSoroban();
  const client = useMemo(
    () => (programme && !programme.sample ? programmeAt(programme.id) : null),
    [programme, programmeAt],
  );
  const config = useContractResult(() => client!.get_config(), [client], { enabled: Boolean(client) });
  const total = useContractRead(() => client!.total_contributed(), [client], { enabled: Boolean(client) });

  if (!programme) return { feeBps: null, contributed: null };
  if (programme.sample) {
    return { feeBps: feeBpsOf(programme.chain), contributed: BigInt(programme.chain.contributed || '0') };
  }
  return {
    feeBps: config.data ? BigInt(config.data.fee_bps) : null,
    contributed: total.data ?? null,
  };
}

/**
 * Contribute, in a sheet: amount, confirm, then sending, then the receipt or
 * the failure.
 *
 * An amount above the balance is refused inline and Review stays disabled, so
 * it never reaches a signature. The balance is read from the chosen
 * programme's token contract; when that read fails the amount is not capped
 * and the field says the balance is unavailable. The phase is read again on
 * entering Confirm and once more immediately before signing: a programme that
 * has left Open is refused with `WrongPhase` rather than sent to fail
 * on-chain. The sheet cannot be dismissed while a transaction is in flight.
 */
export function ContributeSheet({
  open,
  onClose,
  programmes,
  linkedProgrammeId = null,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: ContributeSheetProps) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<TxReceipt>({ contract: 'program' });

  const openProgrammes = programmes.filter((p) => p.chain.phase === 'Open');
  const linked = linkedProgrammeId ? programmes.find((p) => p.id === linkedProgrammeId) : undefined;

  const [picked, setPicked] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('amount');
  const [check, setCheck] = useState<PhaseCheck>({ status: 'checking' });
  // A refusal made here, before anything was signed.
  const [refusal, setRefusal] = useState<Explained | null>(null);

  // A linked programme that is not Open stays chosen, and blocked with its
  // reason, until the reader picks another: quietly swapping in a different
  // programme would send money somewhere they did not choose.
  const selectedId = picked ?? linked?.id ?? openProgrammes[0]?.id ?? null;
  const programme = programmes.find((p) => p.id === selectedId);
  const blocked = programme ? contributeBlockedReason(programme.chain.phase) : null;
  // The chosen programme's own asset; null (no unit shown) until it is read.
  const asset = useProgrammeAsset(programme?.id);

  // Read from the chosen programme's token contract. `undefined` while it is
  // unknown, so an amount is never refused against a balance we do not have.
  const balanceRead = useProgrammeBalance(programme);
  const xlmBalance = useBalances(address);
  const walletBalance = balanceRead.balance ?? undefined;
  const terms = useProgrammeTerms(programme);

  const parsed = validateAmount(amount, { balance: walletBalance, asset });
  const value = parsed.ok ? parsed.value : null;
  const split = value !== null && terms.feeBps !== null ? splitContribution(value, terms.feeBps) : null;
  const share =
    value !== null && terms.contributed !== null && terms.contributed + value > 0n
      ? (value * BPS_DENOMINATOR) / (terms.contributed + value)
      : null;
  // A paused programme refuses contributions (`Paused`, 39), so say so here
  // instead of letting the signature fail. Refunds are not affected.
  const pausedState = useProgrammePaused(programme && !programme.sample ? programmeAt(programme.id) : null);
  const canReview = Boolean(programme && !blocked && !pausedState.paused && value !== null);

  // A declined signature is a choice, not a failure: it returns to Confirm.
  const declined = tx.error !== null && !isFailure(tx.error);
  const failed = refusal ?? (tx.phase === 'error' ? tx.error : null);
  let view: View;
  if (step === 'amount') view = 'amount';
  else if (refusal) view = 'error';
  else if (step === 'confirm' || declined) view = 'confirm';
  else if (failed) view = 'error';
  else if (tx.phase === 'success') view = 'done';
  else view = 'pending';

  useEffect(() => {
    if (step !== 'outcome' || refusal) return;
    if (tx.busy) announce(phaseLabel(tx.phase));
    else if (tx.phase === 'success' && programme && value !== null) {
      announce(`Contribution of ${formatIn(value, asset)} to ${programme.name} confirmed.`);
    } else if (tx.phase === 'error' && tx.error) announce(failureAnnouncement(tx.error), 'alert');
  }, [announce, asset, programme, refusal, step, tx.busy, tx.error, tx.phase, value]);

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
    if (!canReview) return;
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
    if (pausedState.paused) {
      refuse(explainCode('program', 39));
      return;
    }

    setStep('outcome');
    await tx.send(async () => {
      if (programme.sample) return sampleSendable(() => sampleOutcome(programme.id), sampleDelayMs);
      const assembled = await client().contribute({ donor: address, amount: value });
      return {
        estimatedFee: BigInt(
          (assembled as unknown as { simulationResponse?: { minResourceFee?: string } }).simulationResponse
            ?.minResourceFee ?? 0,
        ),
        restore: restoreFromAssembled(assembled),
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

  // Closing returns the sheet to its first step, so the next opening starts
  // clean. Never while a transaction is in flight.
  const close = () => {
    if (tx.busy) return;
    tx.reset();
    setRefusal(null);
    setAmount('');
    setPicked(null);
    setStep('amount');
    onClose();
  };

  const programmeHref = programme ? `/programme/${encodeURIComponent(programme.id)}` : '/directory';
  const phaseOk = check.status === 'read' && check.phase === 'Open' && !pausedState.paused;
  const title = view === 'done' ? 'Receipt' : view === 'confirm' ? 'Confirm' : 'Fund this programme';

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      eyebrow="Contribute"
      progress={{ current: PROGRESS[view], total: 4 }}
      busy={tx.busy}
    >
      <div className="contribute">
        {view === 'amount' && (
          <>
            {openProgrammes.length > 0 ? (
              <Select
                label="Programme"
                hint="Only Open programmes take contributions."
                value={programme && !blocked ? programme.id : ''}
                placeholder={programme && !blocked ? undefined : 'Choose a programme'}
                options={openProgrammes.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(event) => setPicked(event.target.value || null)}
              />
            ) : (
              <Notice tone="info">No programme is Open right now, so none can take a contribution.</Notice>
            )}

            {linked && linked.chain.phase !== 'Open' && picked === null && (
              <Notice tone="warn" role="note">
                <strong>{linked.name}.</strong> {contributeBlockedReason(linked.chain.phase)}
              </Notice>
            )}

            <AmountField
              label="Amount"
              value={amount}
              onChange={setAmount}
              asset={asset}
              presets={PRESETS}
              offerMax
              balance={walletBalance}
              hint={balanceHint(balanceRead.status)}
            />

            <dl className="contribute__breakdown" aria-live="polite">
              <div>
                <dt>You send</dt>
                <dd className="numeric">{value !== null ? formatIn(value, asset) : '—'}</dd>
              </div>
              <div>
                <dt>
                  Protocol fee{terms.feeBps !== null ? ` (${formatBps(terms.feeBps)})` : ''}, taken from your
                  contribution
                </dt>
                <dd className="numeric">{split ? `− ${formatIn(split.fee, asset)}` : '—'}</dd>
              </div>
              <div className="contribute__total">
                <dt>Added to the budget</dt>
                <dd className="numeric">{split ? formatIn(split.budget, asset) : '—'}</dd>
              </div>
              <div>
                <dt>Your share of contributions</dt>
                <dd className="numeric">{share !== null ? formatShare(share) : '—'}</dd>
              </div>
            </dl>
            <p className="contribute__aside">Network fee: shown by Freighter before you sign, paid by you in XLM.</p>

            <Button
              fullWidth
              disabled={!canReview}
              aria-describedby={pausedState.paused ? 'contribute-paused-why' : undefined}
              onClick={toConfirm}
            >
              Review contribution
            </Button>
            {pausedState.paused && <DisabledReason id="contribute-paused-why">{PAUSED_REASON}</DisabledReason>}
          </>
        )}

        {view === 'confirm' && programme && value !== null && (
          <>
            {check.status === 'checking' && <Notice tone="info">Checking the phase on-chain…</Notice>}
            {check.status === 'read' &&
              (phaseOk ? (
                <Notice tone="ok">
                  <strong>
                    {programme.sample ? 'Sample chain read: the programme is Open.' : 'Checked on-chain just now: the programme is Open.'}
                  </strong>
                </Notice>
              ) : (
                <Notice tone="warn">{contributeBlockedReason(check.phase)}</Notice>
              ))}
            {pausedState.paused && <Notice tone="warn">{PAUSED_REASON}</Notice>}
            {check.status === 'failed' && (
              <Notice tone="warn">Couldn't read the phase on-chain. {check.error.message}</Notice>
            )}

            <Receipt
              className="contribute__receipt"
              rows={[
                { label: 'Programme', value: programme.name, text: true },
                { label: 'You send', value: formatIn(value, asset) },
                { label: 'Protocol fee', value: split ? `− ${formatIn(split.fee, asset)}` : 'Read on-chain when you sign' },
                { label: 'Added to the budget', value: split ? formatIn(split.budget, asset) : '—' },
              ]}
            />
            <p className="contribute__aside">
              If some of the budget isn't paid out by the end of the release window, you can claim your
              proportional share back.
            </p>

            {declined && tx.error && (
              <Notice tone="info">
                {tx.error.message} {tx.error.action}
              </Notice>
            )}

            <div className="contribute__actions">
              <Button variant="ghost" onClick={() => setStep('amount')}>
                Back
              </Button>
              {check.status === 'failed' ? (
                <Button className="contribute__grow" onClick={checkPhase}>
                  Check again
                </Button>
              ) : (
                <Button className="contribute__grow" icon={<Wallet size={18} aria-hidden="true" />} disabled={!phaseOk} onClick={sign}>
                  Confirm in Freighter
                </Button>
              )}
            </div>
          </>
        )}

        {view === 'pending' && value !== null && (
          <TxPending
            title={tx.slow ? 'Still waiting for confirmation' : `Sending ${formatIn(value, asset)}`}
            note={
              tx.slow
                ? 'Do not send again. The outcome is unknown until the network responds.'
                : 'Approve the transaction in Freighter, then we wait for the network.'
            }
            phase={tx.phase}
          >
            {tx.estimatedFee !== null && (
              <p className="contribute__aside numeric">
                Estimated network fee: {formatAmount(tx.estimatedFee, { asset: 'XLM' })}
              </p>
            )}
            {tx.estimatedFee !== null &&
              xlmBalance.xlm !== null &&
              xlmBalance.xlm < tx.estimatedFee + MIN_XLM_RESERVE && (
                <Notice tone="warn" role="alert">
                  Your XLM balance cannot cover this fee while keeping the minimum reserve.{' '}
                  {NETWORK.friendbot
                    ? 'Fund the wallet on testnet with Friendbot before signing.'
                    : 'Add XLM to the wallet before signing.'}
                </Notice>
              )}
          </TxPending>
        )}

        {view === 'done' && programme && value !== null && tx.result && (
          <TxDone
            title="Contribution confirmed"
            rows={[
              { label: 'Sent', value: formatIn(value, asset) },
              ...(split ? [{ label: 'Protocol fee', value: formatIn(split.fee, asset) }] : []),
              {
                label: 'Ledger',
                value: tx.result.ledger !== null ? tx.result.ledger.toLocaleString() : 'Not reported',
              },
              {
                label: 'Transaction',
                value: tx.result.hash ? (
                  <span className="contribute__hash">
                    <span title={tx.result.hash}>{shortId(tx.result.hash)}</span>
                    <CopyButton value={tx.result.hash} label="Copy transaction hash" />
                    {/* A sample hash is a fixture the explorer has never seen. */}
                    {!programme.sample && <TxExplorerLink hash={tx.result.hash} />}
                  </span>
                ) : (
                  'Not reported'
                ),
              },
            ]}
            actions={
              <>
                <Link to={programmeHref} className="ui-button ui-button--ghost ui-button--md" onClick={close}>
                  See programme
                </Link>
                <Button onClick={close}>Done</Button>
              </>
            }
          >
            <p>
              {split ? formatIn(split.budget, asset) : formatIn(value, asset)} added to {programme.name}. Your
              money stays locked in the programme until a verifier confirms each milepost, and whatever isn't
              paid out comes back to you in proportion.
            </p>
            {programme.sample && samplesEnabled() && (
              <p className="contribute__sample">
                <SampleTag>Sample receipt</SampleTag>
              </p>
            )}
            {!programme.sample && tx.result.hash && (
              <p className="contribute__aside">
                Keep the hash. This receipt can be rebuilt later from{' '}
                <Link to={`/funders/receipt?hash=${tx.result.hash}`} onClick={close}>
                  Receipt lookup
                </Link>
                .
              </p>
            )}
          </TxDone>
        )}

        {view === 'error' && failed && (
          <TxFailed
            title="Contribution didn't go through"
            explained={failed}
            onRetry={retry}
            actions={
              <Link to={programmeHref} className="ui-button ui-button--ghost ui-button--md" onClick={close}>
                View programme
              </Link>
            }
          />
        )}
      </div>
    </Modal>
  );
}
