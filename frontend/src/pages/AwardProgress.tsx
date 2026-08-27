import { useState } from 'react';
import { Buffer } from 'buffer';
import { useContractRead, useContractResult, useProgramme, useTransaction, phaseLabel } from '../hooks';
import { AsyncView } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field, Stat, Table, type BadgeTone, type Column } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { formatAmount } from '../lib/amount';
import { explain } from '../lib/errors';
import './AwardProgress.css';

/** Seeded testnet recipient (Ada) — one tranche in, more to come. */
const DEMO_RECIPIENT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';
const DEMO_VERIFIER = 'GB4CCGYQ27CQR45FGZYVVXKTRM4GTBSML7U7GHLLLDK7CFEZ4JKLBZFP';
const DEMO_ATTESTATION = '7648441cc4224ab7f6956fbce0502020c9583bc62611626ba833e37e8d3e18cd';

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

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

  const [attestationInput, setAttestationInput] = useState('');
  const [attesterInput, setAttesterInput] = useState('');
  const [attestationError, setAttestationError] = useState<string | null>(null);

  const award = useContractResult(() => programme.get_award({ recipient: subject }), [programme, subject]);
  const releaseTx = useTransaction<bigint>({ contract: 'program' });

  const cleanUid = attestationInput.trim().replace(/^0x/i, '');
  const isValidUid = HEX_32_BYTES.test(attestationInput.trim());
  const cleanAttester = attesterInput.trim();
  const isValidAttester = STELLAR_ADDRESS.test(cleanAttester);

  const spentCheck = useContractRead(
    async () => {
      if (!isValidUid) return { result: false };
      const res = await programme.is_spent({ attestation: Buffer.from(cleanUid, 'hex') });
      return { result: res.result };
    },
    [programme, cleanUid, isValidUid],
    { enabled: isValidUid },
  );

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

  const fillDemoProof = () => {
    setAttestationInput(DEMO_ATTESTATION);
    setAttesterInput(DEMO_VERIFIER);
    setAttestationError(null);
  };

  const handleRelease = async () => {
    if (!isValidUid) {
      setAttestationError('Enter a 32-byte hex attestation UID (64 characters).');
      return;
    }
    if (!isValidAttester) {
      setAttestationError('Enter a valid verifier Stellar address.');
      return;
    }
    setAttestationError(null);

    const uidBuffer = Buffer.from(cleanUid, 'hex');
    const result = await releaseTx.send(async () => {
      const tx = await programme.release({
        recipient: subject,
        attestation: uidBuffer,
        attester: cleanAttester,
      });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      award.refetch();
      spentCheck.refetch();
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Award progress</h1>
        <p className="typo-text text-muted">
          What has been paid, what remains, and release a tranche against a verified attestation.
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

          const isSpent = spentCheck.data === true;
          const explainedError = releaseTx.error ? explain(releaseTx.error, 'program') : null;

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
                    Releasing is permissionless — anyone may submit a signed attestation from a trusted verifier to unlock the next tranche.
                  </p>
                )}

                <Table
                  caption="Tranche schedule"
                  columns={columns}
                  rows={rows}
                  keyOf={(row) => String(row.index)}
                />
              </Card>

              {!fullyReleased && (
                <Card title="Release a tranche against an attestation">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p className="typo-text text-muted">
                      Provide a valid 32-byte attestation UID signed by a trusted verifier for this recipient under this programme&rsquo;s schema.
                    </p>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button variant="secondary" size="sm" onClick={fillDemoProof}>
                        Use demo verifier &amp; attestation
                      </Button>
                    </div>

                    <Field
                      label="Attestation UID (Hex)"
                      placeholder="7648441cc4224ab7f6956fbce..."
                      value={attestationInput}
                      onChange={(e) => {
                        setAttestationInput(e.target.value);
                        setAttestationError(null);
                      }}
                      error={attestationError}
                      hint="32-byte hex hash issued by the verifier."
                    />

                    <Field
                      label="Verifier address (Attester)"
                      placeholder="G..."
                      value={attesterInput}
                      onChange={(e) => {
                        setAttesterInput(e.target.value);
                        setAttestationError(null);
                      }}
                      hint="Must be a trusted verifier registered on this programme."
                    />

                    {isValidUid && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--surface-hover)', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontSize: '0.875rem' }}>Proof status:</span>
                        {spentCheck.loading ? (
                          <Badge tone="neutral">Checking…</Badge>
                        ) : isSpent ? (
                          <Badge tone="neutral">Already spent</Badge>
                        ) : (
                          <Badge tone="success">Unspent &amp; Valid shape</Badge>
                        )}
                        {isSpent && (
                          <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                            This proof has already released a tranche and cannot be used again.
                          </span>
                        )}
                      </div>
                    )}

                    {explainedError && (
                      <div style={{ padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-error)' }}>{explainedError.message}</p>
                        {explainedError.action && (
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-muted)' }}>{explainedError.action}</p>
                        )}
                      </div>
                    )}

                    {releaseTx.result !== null && (
                      <div style={{ padding: '0.75rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-md)' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-success)' }}>
                          Tranche released! {formatAmount(releaseTx.result)} XLM moved.
                        </p>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                          {data.mode.tag === 'Direct' && `Paid directly to fixed payee ${shorten(data.payee)}.`}
                          {data.mode.tag === 'Allocated' && `Moved to escrow allocation for ${shorten(subject)} to direct.`}
                          {data.mode.tag === 'Restricted' && `Paid into recipient's smart wallet with spend policy.`}
                          {data.mode.tag === 'Open' && `Paid directly to recipient ${shorten(subject)}.`}
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={handleRelease}
                      loading={releaseTx.busy}
                      disabled={!isValidUid || !isValidAttester || isSpent || releaseTx.busy || fullyReleased}
                      fullWidth
                    >
                      {releaseTx.busy ? phaseLabel(releaseTx.phase) : 'Release tranche'}
                    </Button>
                  </div>
                </Card>
              )}

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

