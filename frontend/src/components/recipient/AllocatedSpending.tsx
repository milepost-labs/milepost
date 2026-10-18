import { useMemo, useState } from 'react';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useContractRead, useTransaction } from '../../hooks';
import { formatAmount, validateAmount } from '../../lib/amount';
import { explain, explainCode, type Explained } from '../../lib/errors';
import { looksLikeContractId, truncateAddress } from '../../lib/format';
import { isPhase, phaseRequirement, type Phase } from '../../lib/phaseGate';
import { sampleSendable, SAMPLE_TX_DELAY_MS } from '../../lib/fundingTx';
import { AmountField, Button, Field } from '../ui';
import { ErrorPanel, PendingPulse, TransactionOutcome } from '../state/AsyncStates';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import './AllocatedSpending.css';

/** A payee is a Stellar account — a `G` address. */
const PAYEE_ADDRESS = /^G[A-Z2-7]{55}$/;
const ASSET = 'USDC';

type PayeeCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'verified' }
  | { status: 'unverified' }
  | { status: 'error'; explained: Explained };

type View =
  | { kind: 'role-gate' }
  | { kind: 'phase-error' }
  | { kind: 'phase-loading' }
  | { kind: 'phase-blocked'; phase: Phase }
  | { kind: 'allocation-error' }
  | { kind: 'empty' }
  | { kind: 'form' };

export interface AllocatedSpendingProps {
  award: RecipientAwardFixture;
  /** Stand-in transaction delay for sample programmes, overridable for tests. */
  sampleDelayMs?: number;
}

/**
 * The Allocated spending section: directing escrowed funds to a verified payee.
 *
 * In Allocated mode the money waits in escrow until the recipient chooses a
 * payee. `program` keeps no payee list, so the recipient enters or pastes an
 * address and we check it with `is_payee` before anything is signed. The
 * available amount is `allocation_of(recipient)`, read on-chain and re-read
 * after a successful `spend`. Everything is gated on phase (Settled) and role
 * (a connected wallet), and every failure renders through `explain()`.
 *
 * Sample programmes — those whose id is not a real contract address — fall
 * back to the fixture escrow and a stand-in send, so the layout is still
 * demonstrable without a contract behind it.
 */
export function AllocatedSpending({ award, sampleDelayMs = SAMPLE_TX_DELAY_MS }: AllocatedSpendingProps) {
  const wallet = useWallet();
  const { programmeAt } = useSoroban();

  const isReal = looksLikeContractId(award.programmeId);
  const recipient = wallet.address;

  const client = useMemo(
    () => (isReal ? programmeAt(award.programmeId) : null),
    [isReal, programmeAt, award.programmeId],
  );

  // Escrow this recipient may still direct. Infallible on the contract, so a
  // plain read; the fixture escrow stands in for samples.
  const allocationRead = useContractRead<bigint>(
    () => client!.allocation_of({ recipient: recipient! }),
    [client, recipient],
    { enabled: isReal && Boolean(recipient), contract: 'program' },
  );

  // Programme phase, for gating. `spend` is only available once Settled, before
  // the sweep window opens; the sweep-window error (35) still surfaces through
  // the transaction and `explain()`.
  const phaseRead = useContractRead<{ tag: string }>(
    async () => {
      const response = await client!.get_phase();
      return { result: response.result.unwrap() };
    },
    [client],
    { enabled: isReal, contract: 'program' },
  );

  const sampleAllocation = award.escrow ? BigInt(award.escrow) : 0n;
  const allocation = isReal ? allocationRead.data ?? 0n : sampleAllocation;

  const phaseTag = isReal ? phaseRead.data?.tag : 'Settled';
  const phase: Phase | null = phaseTag && isPhase(phaseTag) ? phaseTag : null;

  const [payeeAddress, setPayeeAddress] = useState('');
  const [payeeCheck, setPayeeCheck] = useState<PayeeCheck>({ status: 'idle' });
  const [amount, setAmount] = useState('');
  const [sentInfo, setSentInfo] = useState<{ payee: string; amount: bigint } | null>(null);

  const tx = useTransaction<bigint>({
    contract: 'program',
    onSuccess: () => {
      if (isReal) allocationRead.refetch();
      setPayeeAddress('');
      setAmount('');
      setPayeeCheck({ status: 'idle' });
    },
  });

  const amountResult = validateAmount(amount, { balance: allocation, asset: ASSET });
  const amountValue = amountResult.ok ? amountResult.value : null;

  const trimmedPayee = payeeAddress.trim();
  const payeeFieldError =
    trimmedPayee === '' || PAYEE_ADDRESS.test(trimmedPayee)
      ? null
      : 'Enter a valid Stellar address (starts with G).';
  const canCheckPayee = PAYEE_ADDRESS.test(trimmedPayee) && payeeCheck.status !== 'checking';
  const canSend =
    payeeCheck.status === 'verified' && amountValue !== null && !tx.busy && Boolean(recipient);

  const receipt = sentInfo
    ? `${formatAmount(sentInfo.amount, { asset: ASSET })} to ${truncateAddress(sentInfo.payee)}`
    : undefined;

  // Decide which state the section is in, so the gates take precedence over
  // the form and the reasons are shown rather than letting the transaction fail.
  let view: View;
  if (!recipient) {
    view = { kind: 'role-gate' };
  } else if (isReal && phaseRead.error && phase === null) {
    view = { kind: 'phase-error' };
  } else if (phase === null) {
    view = { kind: 'phase-loading' };
  } else if (phase !== 'Settled') {
    view = { kind: 'phase-blocked', phase };
  } else if (isReal && allocationRead.error && allocation === 0n) {
    view = { kind: 'allocation-error' };
  } else if (allocation === 0n) {
    view = { kind: 'empty' };
  } else {
    view = { kind: 'form' };
  }

  const handlePayeeChange = (value: string) => {
    setPayeeAddress(value);
    setPayeeCheck({ status: 'idle' });
  };

  const handleCheckPayee = async () => {
    const addr = payeeAddress.trim();
    if (!PAYEE_ADDRESS.test(addr)) return;
    setPayeeCheck({ status: 'checking' });
    try {
      if (isReal) {
        const { result } = await client!.is_payee({ payee: addr });
        setPayeeCheck(result ? { status: 'verified' } : { status: 'unverified' });
      } else {
        // Sample stand-in: a valid address reads as verified for the demo.
        setPayeeCheck({ status: 'verified' });
      }
    } catch (caught) {
      setPayeeCheck({ status: 'error', explained: explain(caught, 'program') });
    }
  };

  const handleSend = async () => {
    if (payeeCheck.status !== 'verified' || amountValue === null || !recipient) return;
    const payee = payeeAddress.trim();
    setSentInfo({ payee, amount: amountValue });
    tx.reset();
    await tx.send(async () => {
      if (!isReal) {
        return sampleSendable(() => allocation - amountValue, sampleDelayMs);
      }
      const assembled = await client!.spend({ recipient, payee, amount: amountValue });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          const remaining = sent.result.unwrap();
          return { result: remaining };
        },
      };
    });
  };

  return (
    <div className="allocated-spending">
      <div className="allocated-spending__header">
        <span className="allocated-spending__title">Held for you in escrow</span>
        <span className="allocated-spending__amount">
          {isReal && allocationRead.data === null && allocationRead.fetching ? (
            <PendingPulse label="Reading escrow balance" />
          ) : (
            formatAmount(allocation, { asset: ASSET })
          )}
        </span>
      </div>

      {!isReal && <span className="allocated-spending__sample">Sample data</span>}

      {view.kind === 'role-gate' && (
        <div className="allocated-spending__gate">
          <p className="allocated-spending__gate-reason">
            Connect a wallet to direct your escrow to a verified payee.
          </p>
          <Button variant="secondary" onClick={() => void wallet.connect()}>
            Sign in
          </Button>
        </div>
      )}

      {view.kind === 'phase-error' && (
        <ErrorPanel explained={explain(phaseRead.error, 'program')} onRetry={phaseRead.refetch} />
      )}

      {view.kind === 'phase-loading' && (
        <p className="allocated-spending__gate" role="status" aria-live="polite">
          Checking the programme phase…
        </p>
      )}

      {view.kind === 'phase-blocked' && (
        <div className="allocated-spending__gate">
          <p className="allocated-spending__gate-reason">{phaseRequirement('Settled', view.phase)}</p>
        </div>
      )}

      {view.kind === 'allocation-error' && (
        <ErrorPanel
          explained={explain(allocationRead.error, 'program')}
          onRetry={allocationRead.refetch}
        />
      )}

      {view.kind === 'empty' && (
        <p className="allocated-spending__empty">Nothing held in escrow right now.</p>
      )}

      {view.kind === 'form' && (
        <div className="allocated-spending__form">
          <p className="allocated-spending__note">
            Enter or paste a payee address. Escrow can only go to a payee the programme&rsquo;s
            creator verified — check it before signing.
          </p>

          <Field
            label="Payee address"
            placeholder="G…"
            value={payeeAddress}
            onChange={(event) => handlePayeeChange(event.target.value)}
            error={payeeFieldError}
            autoComplete="off"
            spellCheck={false}
          />

          <Button
            variant="secondary"
            className="allocated-spending__action"
            onClick={() => void handleCheckPayee()}
            loading={payeeCheck.status === 'checking'}
            disabled={!canCheckPayee}
          >
            Check payee
          </Button>

          {payeeCheck.status === 'verified' && (
            <p className="allocated-spending__verified" role="status">
              Verified — this payee can receive escrow.
            </p>
          )}
          {payeeCheck.status === 'unverified' && (
            <ErrorPanel explained={explainCode('program', 30)} live={false} />
          )}
          {payeeCheck.status === 'error' && (
            <ErrorPanel explained={payeeCheck.explained} live={false} />
          )}

          <AmountField
            label="Amount"
            value={amount}
            onChange={setAmount}
            asset={ASSET}
            balance={allocation}
          />

          <Button
            className="allocated-spending__action"
            onClick={() => void handleSend()}
            disabled={!canSend}
            loading={tx.busy}
          >
            Send to payee
          </Button>

          <TransactionOutcome
            phase={tx.phase}
            error={tx.error}
            successTitle="Sent to payee"
            successDescription={receipt}
            onDismiss={() => tx.reset()}
            onRetry={() => void handleSend()}
          />
        </div>
      )}
    </div>
  );
}
