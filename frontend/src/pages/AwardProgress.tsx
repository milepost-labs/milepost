import { useState } from 'react';
import { useContractResult, useProgramme } from '../hooks';
import { AsyncView } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field, Stat, Table, type BadgeTone, type Column } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { formatAmount } from '../lib/amount';
import './AwardProgress.css';

/** Seeded testnet recipient (Ada) — one tranche in, more to come. */
const DEMO_RECIPIENT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

type TrancheStatus = 'released' | 'next' | 'pending';

interface TrancheRow {
  index: number;
  amount: bigint;
  status: TrancheStatus;
}

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const shorten = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

const STATUS_TONE: Record<TrancheStatus, BadgeTone> = {
  released: 'success',
  next: 'accent',
  pending: 'neutral',
};

const STATUS_LABEL: Record<TrancheStatus, string> = {
  released: 'Released',
  next: 'Next up',
  pending: 'Pending',
};

const MODE_EXPLANATION: Record<string, string> = {
  Direct: 'Paid straight to a verified payee fixed at award time. You never hold the funds and never choose where they go.',
  Allocated:
    'Held in escrow as it releases. You choose which verified payee is paid, when, and how much, from your allocation.',
  Restricted:
    'Paid into your smart wallet, where a spend policy limits onward spending to verified destinations.',
  Open: 'Paid to you directly, with no restriction on how you use it.',
};

/**
 * The contract splits a grant into equal integer tranches and folds whatever
 * integer division truncates into the last one — see `release` in
 * contracts/program/src/lib.rs. Recomputed here rather than trusting anything
 * cached, so the schedule always matches what the contract will actually pay.
 */
function trancheSchedule(granted: bigint, tranches: number): bigint[] {
  if (tranches <= 0) return [];
  const base = granted / BigInt(tranches);
  const amounts: bigint[] = [];
  let allocated = 0n;
  for (let index = 0; index < tranches; index += 1) {
    if (index === tranches - 1) {
      amounts.push(granted - allocated);
    } else {
      amounts.push(base);
      allocated += base;
    }
  }
  return amounts;
}

export const AwardProgress = () => {
  const { address: walletAddress } = useWallet();
  const { client: programme } = useProgramme();

  const [subjectInput, setSubjectInput] = useState(walletAddress ?? DEMO_RECIPIENT);
  const [subject, setSubject] = useState(walletAddress ?? DEMO_RECIPIENT);
  const [inputError, setInputError] = useState<string | null>(null);

  const award = useContractResult(() => programme.get_award({ recipient: subject }), [programme, subject]);

  const handleLookup = () => {
    const address = subjectInput.trim();
    if (!STELLAR_ADDRESS.test(address)) {
      setInputError('Enter a valid Stellar address.');
      return;
    }
    setInputError(null);
    setSubject(address);
  };

  const useMyAddress = () => {
    if (!walletAddress) return;
    setSubjectInput(walletAddress);
    setInputError(null);
    setSubject(walletAddress);
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Award progress</h1>
        <p className="typo-text text-muted">
          What has been paid, what remains, and what has to happen before the next tranche.
        </p>
      </header>

      <Card title="Look up an award">
        <div className="award-search">
          <Field
            label="Recipient address"
            placeholder="G..."
            value={subjectInput}
            onChange={(event) => {
              setSubjectInput(event.target.value);
              setInputError(null);
            }}
            error={inputError}
          />
          <div className="award-search__actions">
            <Button onClick={handleLookup}>Look up</Button>
            {walletAddress && (
              <Button variant="ghost" onClick={useMyAddress}>
                Use my address
              </Button>
            )}
          </div>
        </div>
      </Card>

      <AsyncView
        {...award}
        onRetry={award.refetch}
        empty={{
          title: 'No award yet',
          description: 'This address has not been awarded a grant on this programme.',
        }}
      >
        {(data) => {
          const remaining = data.granted - data.released;
          const fullyReleased = data.tranches_released >= data.tranches;
          const schedule = trancheSchedule(data.granted, data.tranches);
          const rows: TrancheRow[] = schedule.map((amount, i) => ({
            index: i + 1,
            amount,
            status: i < data.tranches_released ? 'released' : i === data.tranches_released ? 'next' : 'pending',
          }));

          const columns: Column<TrancheRow>[] = [
            { key: 'tranche', header: 'Tranche', render: (row) => `#${row.index}` },
            { key: 'amount', header: 'Amount', render: (row) => formatXlm(row.amount), numeric: true },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
            },
          ];

          return (
            <>
              <section className="stats-grid">
                <Card>
                  <Stat label="Granted" value={formatXlm(data.granted)} numeric />
                </Card>
                <Card>
                  <Stat label="Released" value={formatXlm(data.released)} numeric />
                </Card>
                <Card>
                  <Stat label="Remaining" value={formatXlm(remaining)} numeric />
                </Card>
              </section>

              <Card title="Tranche progress">
                <div className="tranche-progress">
                  <div className="tranche-progress__bar" role="presentation">
                    {schedule.map((amount, i) => (
                      <div
                        key={i}
                        className={`tranche-progress__segment${i < data.tranches_released ? ' tranche-progress__segment--released' : ''}`}
                        // Only the relative width matters here, so converting through Number is
                        // safe even though it isn't for a displayed amount — whole XLM units keep
                        // it well inside the safe integer range for any realistic grant size.
                        style={{ flexGrow: Math.max(1, Number(amount / 10_000_000n)) }}
                        title={`Tranche ${i + 1}: ${formatXlm(amount)}`}
                      />
                    ))}
                  </div>
                  <p className="typo-text text-muted tranche-progress__label">
                    {data.tranches_released} of {data.tranches} tranches released
                  </p>
                </div>

                {fullyReleased ? (
                  <p className="typo-text award-complete">This award has been fully released.</p>
                ) : (
                  <p className="typo-text award-next-step">
                    The next tranche unlocks only when a trusted verifier submits an attestation that its
                    milestone was met — that is not something you can trigger yourself. Once one arrives, anyone
                    can call release to pay it out.
                  </p>
                )}

                <Table
                  caption="Tranche schedule"
                  columns={columns}
                  rows={rows}
                  keyOf={(row) => String(row.index)}
                />
              </Card>

              <Card title="Payment mode">
                <div className="mode-panel">
                  <Badge tone="accent">{data.mode.tag}</Badge>
                  <p className="typo-text text-muted">
                    {MODE_EXPLANATION[data.mode.tag] ?? 'Where funds go once released.'}
                  </p>
                  {data.mode.tag !== 'Allocated' && (
                    <p className="typo-text mode-panel__payee">
                      Pays to <span className="numeric" title={data.payee}>{shorten(data.payee)}</span>
                    </p>
                  )}
                </div>
              </Card>
            </>
          );
        }}
      </AsyncView>
    </div>
  );
};
