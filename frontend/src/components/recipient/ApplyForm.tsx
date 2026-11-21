import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import type { ProgrammeConfig } from '@milepost/program';
import { useOpenProgrammes } from '../../hooks/useOpenProgrammes';
import { useTransaction } from '../../hooks/useTransaction';
import { useWallet } from '../../context/useWallet';
import { useSoroban } from '../../context/useSoroban';
import { validateAmount, formatAmount } from '../../lib/amount';
import { formatIn } from '../../lib/funding';
import { isSampleProgrammeId, programmeAsset } from '../../lib/programmeView';
import { samplesEnabled } from '../../lib/samples';
import { SAMPLE_TX_DELAY_MS, sampleSendable, sampleOutcome } from '../../lib/fundingTx';
import { useAnnouncer } from '../../context/useAnnouncer';
import { Empty, ErrorPanel, ErrorState, Loading } from '../state/AsyncStates';
import { TxDone, TxPending } from '../state/TxStatus';
import { AmountField, Button, CopyButton, Notice, SampleTag, Select, TextArea, TxExplorerLink } from '../ui';
import { useContractResult } from '../../hooks/useContractRead';
import { restoreFromAssembled } from '../../lib/restore';
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

  const { address } = useWallet();
  const { programmeAt } = useSoroban();

  const { real, samples, loading, error, refetch } = useOpenProgrammes();

  // All Open programmes: real first, then samples.
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

  const selected = allOpen.find((p) => p.id === effectiveSelection);
  const asset = selected ? programmeAsset(selected) : 'USDC';
  const isSampleSelection = selected ? isSampleProgrammeId(selected.id) || selected.sample : false;

  // Read the selected programme's minimum award from the chain.
  // Sample programmes have no contract — skip the read for them.
  const selectedClient = !isSampleSelection && effectiveSelection
    ? programmeAt(effectiveSelection)
    : null;
  const configRead = useContractResult<ProgrammeConfig>(
    () => selectedClient!.get_config(),
    [selectedClient],
    { enabled: selectedClient !== null },
  );
  const minimumAward: bigint = configRead.data?.minimum_award ?? 0n;

  const amountResult = amountInput.trim() ? validateAmount(amountInput, { asset }) : null;
  const isValid = amountResult?.ok === true && Boolean(effectiveSelection) && notes.trim().length > 0;

  // Warn when the entered amount is below the programme's minimum award.
  // The submit button stays enabled — apply itself does not enforce the minimum;
  // finalize does (BelowMinimumAward, error 38).
  const enteredStroops = amountResult?.ok ? amountResult.value : null;
  const belowMinimum =
    minimumAward > 0n && enteredStroops !== null && enteredStroops < minimumAward;

  const tx = useTransaction<ApplyReceipt>({ contract: 'program' });

  const handleSubmit = async (e: React.FormEvent) => {
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
      const amountFormatted = formatIn(stroops, programmeAsset(selectedProg));
      const progName = selectedProg.name;
      const progId = selectedProg.id;

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
        restore: restoreFromAssembled(assembled),
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
  // A declined signature is a choice: useTransaction returns to idle rather
  // than error, so the form would otherwise reset with no explanation.
  const declined = tx.error !== null && tx.phase === 'idle';

  const programmeOptions = [
    ...real.map((p) => ({ value: p.id, label: p.name })),
    ...samples.map((p) => ({ value: p.id, label: `${p.name} (sample)` })),
  ];

  return (
    <div className="apply">
      <section className="apply__panel" aria-labelledby="apply-title">
        {showReceipt && receipt ? (
          <TxDone
            title="Application submitted"
            rows={[
              { label: 'Asked for', value: receipt.amountFormatted },
              { label: 'Programme', value: receipt.programmeName, text: true },
              ...(receipt.txHash
                ? [
                    {
                      label: 'Transaction',
                      value: (
                        <span className="apply__hash">
                          <span title={receipt.txHash}>{shortHash(receipt.txHash)}</span>
                          <CopyButton value={receipt.txHash} label="Copy transaction hash" />
                          {/* A sample hash is a fixture the explorer has never seen. */}
                          {!receipt.sample && <TxExplorerLink hash={receipt.txHash} />}
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                label: 'Application hash',
                value: <span title={receipt.metadataHashHex}>{shortHash(receipt.metadataHashHex)}</span>,
              },
            ]}
            actions={
              <>
                <Link to="/recipients/application-timeline" className="ui-button ui-button--ghost ui-button--md">
                  Follow application
                </Link>
                <Button onClick={handleReset}>Apply to another</Button>
              </>
            }
          >
            <p>
              {receipt.amountFormatted} requested from {receipt.programmeName}. The application hash is the
              SHA-256 of your notes: keep the notes, they prove what you submitted.
            </p>
            {receipt.sample && samplesEnabled() && (
              <p className="apply__sample">
                <SampleTag>Sample receipt</SampleTag>
              </p>
            )}
          </TxDone>
        ) : tx.busy ? (
          <TxPending title="Submitting your application" phase={tx.phase} />
        ) : (
          <form className="apply__form" onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div>
              <h2 id="apply-title" className="apply__title">
                Apply for what you need
              </h2>
              <p className="apply__lead">Open programmes only. Reviewers can approve up to what you ask.</p>
            </div>

            {loading && <Loading label="Reading open programmes" rows={2} />}
            {!loading && Boolean(error) && <ErrorState error={error} contract="program" onRetry={refetch} />}
            {!loading && !error && allOpen.length === 0 && (
              <Empty
                title="No programme is taking applications"
                description="Applications are accepted only while a programme is Open. Check the directory for one that is."
              />
            )}

            {!loading && !error && allOpen.length > 0 && (
              <>
                <Select
                  label="Programme"
                  hint={samples.length > 0 ? 'Programmes marked (sample) are stand-ins for the design phase.' : undefined}
                  value={effectiveSelection}
                  options={programmeOptions}
                  onChange={(event) => setSelectedProgrammeId(event.target.value)}
                />

                <AmountField
                  label="How much do you need?"
                  value={amountInput}
                  onChange={setAmountInput}
                  asset={asset}
                  placeholder="0"
                  hint="Ask for what you actually need. Reviewers can approve up to this amount, not more."
                />

                {belowMinimum && (
                  <Notice tone="warn" role="status">
                    Your request is below the programme&rsquo;s minimum award of{' '}
                    <strong>{formatAmount(minimumAward, { asset })}</strong>. An award below this
                    amount cannot be finalised.
                  </Notice>
                )}

                <TextArea
                  label="Application notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe what the funds are for and how they will be used."
                  rows={4}
                  aria-required="true"
                  hint="Your notes are hashed in the browser, and the hash is stored on-chain as your application's commitment. Keep this text: you may need it later to prove what you submitted."
                  error={notes.trim().length === 0 && amountInput.trim().length > 0 ? 'Notes are required.' : undefined}
                />

                <Notice tone="info">
                  <strong>How your award is set:</strong> each reviewer approves an amount up to what you asked.
                  Your award is the <strong>middle vote</strong> once enough have voted, so one very low or very
                  high vote can&rsquo;t decide it alone. It is never an average, and votes beyond the quorum can
                  only lower it.
                </Notice>

                <Button type="submit" disabled={!isValid}>
                  Submit application
                </Button>

                {declined && tx.error && (
                  <Notice tone="info">
                    {tx.error.message} {tx.error.action}
                  </Notice>
                )}

                {tx.phase === 'error' && tx.error && <ErrorPanel explained={tx.error} onRetry={() => tx.reset()} />}
              </>
            )}
          </form>
        )}
      </section>

      <aside className="apply__aside">
        <h3>After you apply</h3>
        <ol className="apply__steps">
          <li>
            <b>Review.</b> When applications close, each reviewer approves an amount up to what you asked.
          </li>
          <li>
            <b>Award.</b> Once enough reviewers have voted, anyone can finalize it at the middle vote.
          </li>
          <li>
            <b>Tranches.</b> Each is released once a verifier confirms its condition.
          </li>
        </ol>
        <p className="apply__aside-note">
          You can withdraw an application while it has not been finalized. Follow it, or withdraw it, under{' '}
          <Link to="/recipients/application-timeline">Applications</Link>.
        </p>
      </aside>
    </div>
  );
}
