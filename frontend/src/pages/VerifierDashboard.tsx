import { useEffect, useState, type FormEvent } from 'react';
import { Buffer } from 'buffer';
import './VerifierDashboard.css';
import { ShieldCheck, Clock, FileSignature } from 'lucide-react';
import type { Application } from '@milepost/program';
import type { Client as AttestClient } from '@milepost/attest';
import { useContractRead, useContractResult, useProgramme, useTransaction, phaseLabel } from '../hooks';
import { useWallet } from '../context/useWallet';
import { useSoroban } from '../context/useSoroban';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { formatAmount, tryParseAmount } from '../lib/amount';
import { truncateAddress } from '../lib/format';
import { explain } from '../lib/errors';
import { AsyncView, Empty, ErrorState, Loading, Success } from '../components/state/AsyncStates';
import { Badge, Button, DateField, Field, Modal, Table, type Column } from '../components/ui';

const DEMO_APPLICANT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * There is no on-chain list of awards — see docs/frontend-integration.md. Until
 * an indexer queries the `Awarded` events, the queue is built from known
 * recipient addresses, pre-seeded on the demo/testnet programme the way the
 * recipient picker seeds its payees.
 */
const KNOWN_RECIPIENTS: Record<string, string[]> = {
  [DEMO_PROGRAMME_ID]: ['GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA'],
};

interface Milestone {
  recipient: string;
  granted: bigint;
  released: bigint;
  tranches: number;
  tranchesReleased: number;
}

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const shorten = (address: string) => truncateAddress(address, 4, 4);

/**
 * Sign an attestation that releases a recipient's next tranche.
 *
 * This is the highest-consequence write in the system — a signature here lets
 * money move — so the flow confirms what and who before any signing, and after
 * attesting offers to run the (permissionless) release the same account could
 * otherwise leave the recipient waiting on.
 */
function AttestationModal({
  open,
  recipient,
  nextTranche,
  trancheCount,
  programme,
  attest,
  verifier,
  onClose,
  onReleased,
}: {
  open: boolean;
  recipient: string | null;
  nextTranche: number;
  trancheCount: number;
  programme: ReturnType<typeof useProgramme>['client'];
  attest: AttestClient;
  verifier: string | null;
  onClose: () => void;
  onReleased: () => void;
}) {
  const [schemaInput, setSchemaInput] = useState('');
  const [hashInput, setHashInput] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
  const [expiry, setExpiry] = useState<bigint | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [attestedUid, setAttestedUid] = useState<Buffer | null>(null);

  const attestTx = useTransaction<Buffer>({ contract: 'attest' });
  const releaseTx = useTransaction<bigint>({ contract: 'program' });

  const cleanSchema = schemaInput.trim().replace(/^0x/i, '');
  const cleanHash = hashInput.trim().replace(/^0x/i, '');
  const validSchema = HEX_32_BYTES.test(schemaInput.trim());
  const validHash = HEX_32_BYTES.test(hashInput.trim());

  const resetLocal = () => {
    setSchemaInput('');
    setHashInput('');
    setNoExpiry(true);
    setExpiry(undefined);
    setFormError(null);
    setAttestedUid(null);
    attestTx.reset();
    releaseTx.reset();
  };

  const closeDisabled = attestTx.busy || releaseTx.busy;

  const handleClose = () => {
    if (closeDisabled) return;
    resetLocal();
    onClose();
  };

  const handleAttest = async () => {
    if (!recipient || !verifier) return;
    if (!HEX_32_BYTES.test(schemaInput.trim())) {
      setFormError('Enter the schema UID as a 32-byte hex string (64 characters).');
      return;
    }
    if (!HEX_32_BYTES.test(hashInput.trim())) {
      setFormError('Enter the evidence hash as a 32-byte hex string (64 characters).');
      return;
    }
    if (!noExpiry && expiry !== undefined) {
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      if (expiry <= nowSeconds) {
        setFormError('The expiry must be in the future — a past expiry is rejected on-chain.');
        return;
      }
    }
    setFormError(null);

    const result = await attestTx.send(async () => {
      const tx = await attest.attest({
        attester: verifier,
        schema_uid: Buffer.from(cleanSchema, 'hex'),
        subject: recipient,
        data_hash: Buffer.from(cleanHash, 'hex'),
        expires_at: noExpiry ? undefined : expiry,
      });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) setAttestedUid(result);
  };

  const handleRelease = async () => {
    if (!recipient || !verifier || !attestedUid) return;
    const result = await releaseTx.send(async () => {
      const tx = await programme.release({
        recipient,
        attestation: attestedUid,
        attester: verifier,
      });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (result !== null) {
      onReleased();
      resetLocal();
      onClose();
    }
  };

  const attestError = attestTx.error ? explain(attestTx.error, 'attest') : null;
  const releaseError = releaseTx.error ? explain(releaseTx.error, 'program') : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={recipient ? `Sign attestation for ${shorten(recipient)}` : 'Sign attestation'}
      busy={closeDisabled}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={closeDisabled}>
            {attestedUid ? 'Close' : 'Cancel'}
          </Button>
          {!attestedUid ? (
            <Button
              onClick={handleAttest}
              loading={attestTx.busy}
              disabled={!validSchema || !validHash || (noExpiry ? false : expiry === undefined) || attestTx.busy}
              loadingLabel={phaseLabel(attestTx.phase) || 'Signing…'}
            >
              Sign attestation
            </Button>
          ) : (
            <Button
              onClick={handleRelease}
              loading={releaseTx.busy}
              disabled={releaseTx.busy}
              loadingLabel={phaseLabel(releaseTx.phase) || 'Releasing…'}
            >
              Release the tranche now
            </Button>
          )}
        </>
      }
    >
      <div className="attest-modal">
        {!attestedUid ? (
          <>
            <div className="attest-modal__notice" role="note">
              <ShieldCheck size={18} />
              <p className="typo-text">
                This signs an attestation about <strong className="numeric">{recipient ? shorten(recipient) : ''}</strong>,
                unlocking tranche {nextTranche} of {trancheCount} — <strong>it releases funds</strong> once a release is
                submitted.
              </p>
            </div>

            <Field
              label="Schema UID"
              placeholder="32-byte hex (64 characters)"
              value={schemaInput}
              onChange={(event) => {
                setSchemaInput(event.target.value);
                setFormError(null);
              }}
              error={schemaInput && !validSchema ? 'Enter a 32-byte hex schema UID.' : undefined}
              hint="The claim template this attestation is made under."
            />

            <Field
              label="Evidence hash"
              placeholder="32-byte hex (64 characters)"
              value={hashInput}
              onChange={(event) => {
                setHashInput(event.target.value);
                setFormError(null);
              }}
              error={hashInput && !validHash ? 'Enter a 32-byte hex hash.' : undefined}
              hint="Hash of the evidence attesting to this recipient’s milestone. The contract records the hash, not the evidence itself."
            />

            <div className="attest-modal__expiry">
              <label className="attest-modal__check">
                <input
                  type="checkbox"
                  checked={noExpiry}
                  onChange={(event) => setNoExpiry(event.target.checked)}
                />
                No expiry
              </label>
              {!noExpiry && (
                <DateField
                  label="Expiry"
                  value={expiry === undefined ? null : Number(expiry)}
                  onChange={(value) => {
                    setExpiry(value === null ? undefined : BigInt(value));
                    setFormError(null);
                  }}
                  hint="After this time the attestation no longer counts as valid. A past expiry is rejected."
                />
              )}
            </div>

            {formError && <p className="ui-field__message ui-field__message--error" role="alert">{formError}</p>}
            {attestError && (
              <p className="ui-field__message ui-field__message--error" role="alert">
                {attestError.message}
                {attestError.action ? ` ${attestError.action}` : ''}
              </p>
            )}

            {attestTx.result !== null && !attestedUid && (
              <p role="status" className="attest-modal__pending">Signed — preparing…</p>
            )}
          </>
        ) : (
          <>
            <Success
              title="Attestation signed"
              description={
                <>
                  <p className="typo-text">Attestation UID:</p>
                  <p className="numeric attest-modal__uid">{attestedUid.toString('hex')}</p>
                </>
              }
            />
            <p className="typo-text text-muted">
              Release is permissionless — anyone may submit it. Trigger it now so the recipient doesn’t keep waiting, or close and leave it for later.
            </p>
            {releaseTx.result !== null && (
              <p role="status" className="attest-modal__released">
                Tranche released — {formatXlm(releaseTx.result)} moved.
              </p>
            )}
            {releaseError && (
              <p className="ui-field__message ui-field__message--error" role="alert">
                {releaseError.message}
                {releaseError.action ? ` ${releaseError.action}` : ''}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ProgrammeQueue({
  client,
  programmeId,
  verifier,
  attest,
}: {
  client: ReturnType<typeof useProgramme>['client'];
  programmeId: string;
  verifier: string | null;
  attest: AttestClient;
}) {
  const recipients = KNOWN_RECIPIENTS[programmeId] ?? [];
  const [tick, setTick] = useState(0);

  const isVerifier = useContractRead(
    () => client.is_verifier({ addr: verifier ?? '' }),
    [client, verifier],
    { enabled: Boolean(verifier) },
  );

  // Fetched only for the account that is verified, in one pass so the whole
  // list can be sorted by how long each recipient has been waiting.
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  useEffect(() => {
    if (isVerifier.data !== true || recipients.length === 0) return;
    let cancelled = false;
    (async () => {
      setMilestones(null);
      const entries = await Promise.all(
        recipients.map(
          async (recipient): Promise<Milestone | null> => {
            try {
              const { result } = await client.get_award({ recipient });
              const award = result.unwrap();
              return award.tranches_released < award.tranches
                ? { recipient, granted: award.granted, released: award.released, tranches: award.tranches, tranchesReleased: award.tranches_released }
                : null;
            } catch {
              // No award, or the award is fully released — both are normal
              // answers, not failures. The award-raising row simply does not
              // appear in the queue.
              return null;
            }
          },
        ),
      );
      if (cancelled) return;
      // Fewest attested tranches first: a recipient still waiting on their
      // first milestone has been waiting longest. Where there is no
      // per-tranche timestamp on-chain, this is the best proxy for the number
      // that matters to the person waiting.
      const awaiting = entries.filter((entry): entry is Milestone => entry !== null);
      awaiting.sort((a, b) => a.tranchesReleased - b.tranchesReleased || a.recipient.localeCompare(b.recipient));
      setMilestones(awaiting);
    })();
    return () => {
      cancelled = true;
    };
    // `recipients` is a module-constant list per programme, so the dependency
    // stays on the programme id and the effect only refetches when the
    // programme or verifier actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isVerifier.data, programmeId, tick]);

  const [selected, setSelected] = useState<Milestone | null>(null);

  if (!verifier) {
    return (
      <Empty
        title="Connect a wallet"
        description="Verification is per account — connect the wallet you verify with to see who is waiting on you."
      />
    );
  }

  if (isVerifier.loading) return <Loading label="Checking verifier status" rows={2} />;
  if (isVerifier.error) {
    return <ErrorState error={isVerifier.error} contract="program" onRetry={isVerifier.refetch} />;
  }
  if (isVerifier.data !== true) {
    return (
      <Empty
        title="You are not a verifier on this programme"
        description="Only accounts the programme trusts as verifiers can sign the attestations that release tranches. Verifier onboarding is handled off-chain by the programme."
      />
    );
  }

  if (recipients.length === 0) {
    return (
      <Empty
        title="No known recipients"
        description="The queue is built from known recipient addresses until an indexer can list awards on-chain."
      />
    );
  }

  if (milestones === null) return <Loading label="Checking recipients" rows={2} />;

  if (milestones.length === 0) {
    return (
      <Empty
        title="Nothing waiting on you"
        description="Every known award has had all its tranches released. New awards or recipients will appear here once there is a milestone to attest."
      />
    );
  }

  const columns: Column<Milestone>[] = [
    { key: 'recipient', header: 'Recipient', render: (row) => <span className="numeric" title={row.recipient}>{shorten(row.recipient)}</span> },
    { key: 'progress', header: 'Tranches', render: (row) => `${row.tranchesReleased} / ${row.tranches}` },
    { key: 'released', header: 'Released', render: (row) => formatXlm(row.released), numeric: true },
    { key: 'remaining', header: 'Remaining', render: (row) => formatXlm(row.granted - row.released), numeric: true },
    {
      key: 'status',
      header: 'Waiting on',
      render: (row) => (
        <Badge tone={row.tranchesReleased === 0 ? 'warning' : 'accent'}>
          {row.tranchesReleased === 0 ? 'First tranche' : `Tranche ${row.tranchesReleased + 1}`}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: '',
      render: (row) => (
        <Button variant="secondary" size="sm" onClick={() => setSelected(row)} disabled={!verifier}>
          Sign attestation
        </Button>
      ),
    },
  ];

  return (
    <>
      <Table
        caption={`Recipients awaiting attestation on ${programmeId}`}
        columns={columns}
        rows={milestones}
        keyOf={(row) => row.recipient}
      />
      <AttestationModal
        open={selected !== null}
        recipient={selected?.recipient ?? null}
        nextTranche={selected ? selected.tranchesReleased + 1 : 0}
        trancheCount={selected?.tranches ?? 0}
        programme={client}
        attest={attest}
        verifier={verifier}
        onClose={() => setSelected(null)}
        onReleased={() => setTick((t) => t + 1)}
      />
    </>
  );
}

export const VerifierDashboard = () => {
  const { address } = useWallet();
  const { client: programme } = useProgramme();
  const { programmeAt, attest } = useSoroban();
  const [approved, setApproved] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);

  const application = useContractResult<Application>(
    () => programme.get_application({ applicant: DEMO_APPLICANT }),
    [programme],
  );
  const config = useContractResult(() => programme.config(), [programme]);
  const reviewer = useContractRead(
    () => programme.is_reviewer({ addr: address as string }),
    [programme, address],
    { enabled: Boolean(address) },
  );
  const review = useTransaction({ onSuccess: () => application.refetch() });

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!address || !application.data) return;

    const parsed = tryParseAmount(approved);
    if (!parsed.ok) {
      setAmountError(parsed.error);
      return;
    }
    if (parsed.value > application.data.requested) {
      setAmountError(`Approval cannot exceed ${formatAmount(application.data.requested)} XLM`);
      return;
    }

    setAmountError(null);
    const result = await review.send(() =>
      programme.review({ reviewer: address, applicant: DEMO_APPLICANT, approved: parsed.value }),
    );
    if (result !== null) setApproved('');
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header animate-fade-up">
        <h1>Verifier Dashboard</h1>
        <p className="typo-text text-muted">See who is waiting on your attestation to unlock their next tranche.</p>
      </header>

      <section className="attestation-section animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="attestation-section__header">
          <h2>Recipients awaiting attestation</h2>
          <Badge tone={address ? 'neutral' : 'warning'}>{address ? truncateAddress(address) : 'No wallet connected'}</Badge>
        </div>
        <div className="attestation-section__intro">
          <ShieldCheck size={18} />
          <p className="typo-text text-muted">
            No tranche is released until a trusted verifier signs it. These recipients&rsquo; next milestone is sitting
            on you.
          </p>
        </div>
        <ProgrammeQueue client={programmeAt(DEMO_PROGRAMME_ID)} programmeId={DEMO_PROGRAMME_ID} verifier={address ?? null} attest={attest} />
      </section>

      <section className="stats-grid animate-fade-up" style={{ animationDelay: '200ms' }}>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><Clock size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Attestations needed</span>
            <span className="stat-value">1 per awaiting tranche</span>
          </div>
        </div>
      </section>

      <section className="queue-section animate-fade-up" style={{ animationDelay: '300ms' }}>
        <h2>Application review</h2>
        <div className="queue-list">
          <AsyncView {...application} onRetry={application.refetch} contract="program">
            {(currentApplication) => {
              const quorum = config.data?.quorum ?? 0;
              const medianIndex = quorum > 0 ? (quorum - 1) / 2 : 0;
              const median = currentApplication.votes.length > medianIndex
                ? currentApplication.votes[medianIndex]
                : null;
              const isWithdrawn = currentApplication.withdrawn;
              const canReview = reviewer.data === true && !currentApplication.finalized && !isWithdrawn;

              return (
                <div className="queue-item glass-panel reviewer-console">
                  <div className="queue-item-icon"><FileSignature size={24} /></div>
                  <div className="queue-item-content">
                    <div className="queue-item-header">
                      <h3>Application review</h3>
                      {isWithdrawn ? (
                        <span className="badge badge-pending" style={{ backgroundColor: 'var(--color-error)' }}>
                          Withdrawn
                        </span>
                      ) : (
                        <span className="badge badge-pending">
                          {currentApplication.votes.length} / {quorum} votes
                        </span>
                      )}
                    </div>
                    <p className="typo-text text-muted">
                      Requested: <strong>{formatAmount(currentApplication.requested)} XLM</strong>
                    </p>
                    {isWithdrawn ? (
                      <p className="text-warning" style={{ color: 'var(--color-error)' }}>
                        This application has been withdrawn by the applicant and cannot be reviewed or finalized.
                      </p>
                    ) : (
                      <>
                        <div className="vote-spread" aria-label="Sorted reviewer approvals">
                          {currentApplication.votes.map((vote, index) => (
                            <span key={`${vote}-${index}`} className={`badge${index === medianIndex ? ' vote-median' : ''}`}>
                              {formatAmount(vote)} XLM{index === medianIndex ? ' · median' : ''}
                            </span>
                          ))}
                        </div>
                        {median !== null && <p className="median-result">Settling award: <strong>{formatAmount(median)} XLM</strong></p>}
                        {!address && <p className="text-warning">Connect a wallet to review.</p>}
                        {address && reviewer.data === false && <p className="text-warning">This wallet is not a registered reviewer.</p>}
                        {canReview && (
                          <form className="review-form" onSubmit={submitReview}>
                            <Field
                              label="Your approval"
                              value={approved}
                              onChange={(event) => setApproved(event.target.value)}
                              onBlur={() => approved && setAmountError(tryParseAmount(approved).ok ? null : 'Enter a valid amount')}
                              placeholder="300"
                              inputMode="decimal"
                              suffix="XLM"
                              error={amountError}
                              hint={`Up to ${formatAmount(currentApplication.requested)} XLM`}
                            />
                            <Button loading={review.busy} type="submit">Submit review</Button>
                            {review.error && <p className="ui-field__message ui-field__message--error" role="alert">{review.error.message}</p>}
                          </form>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            }}
          </AsyncView>
        </div>
      </section>
    </div>
  );
};
