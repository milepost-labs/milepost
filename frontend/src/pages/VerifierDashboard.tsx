import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import type { Application } from '@milepost/program';
import './VerifierDashboard.css';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { useContractRead, useContractResult } from '../hooks/useContractRead';
import { useTransaction } from '../hooks/useTransaction';
import { looksLikeAddress, truncateAddress } from '../lib/format';
import { explain } from '../lib/errors';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatAmount, validateAmount } from '../lib/amount';
import { AmountField, Badge, Button, Field } from '../components/ui';
import { ErrorPanel, PendingState, TransactionOutcome } from '../components/state/AsyncStates';
import { FIXTURE_REVIEW_APPLICANTS } from '../fixtures/reviewFixtures';
import {
  FIXTURE_MY_ATTESTATIONS,
  FIXTURE_VERIFIER_QUEUE,
  type VerifierAttestation,
  type VerifierQueueItem,
} from '../fixtures/verifierFixtures';

type ItemStatus = 'idle' | 'pending' | 'error' | 'done' | 'declined';

/**
 * Verifier queue — the verifier's home screen.
 *
 * Signing an attestation releases someone's money and cannot be undone, so the
 * card slows the decision down: expanding shows exactly what is being signed
 * (schema, recipient, ledger), an optional reference note, and a required
 * checkbox that gates the sign button. "Can't confirm" dismisses with no
 * transaction at all.
 *
 * The queue is a stand-in; the indexer does not publish it yet. Every entry is
 * tagged as sample data.
 */
export const VerifierDashboard = () => {
  usePageTitle('Verifier Dashboard');
  const { address, connect } = useWallet();
  const { attest, demoProgramme } = useSoroban();
  const announce = useAnnouncer();

  const [statusById, setStatusById] = useState<Record<string, ItemStatus>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [reference, setReference] = useState('');
  const [newlySigned, setNewlySigned] = useState<VerifierAttestation[]>([]);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [applicantInput, setApplicantInput] = useState('');
  const [selectedApplicant, setSelectedApplicant] = useState('');
  const [approvedInput, setApprovedInput] = useState('');
  const [rememberedApplicants, setRememberedApplicants] = useState(
    () => FIXTURE_REVIEW_APPLICANTS[demoProgramme.options.contractId] ?? [],
  );
  const [reviewFormError, setReviewFormError] = useState<string | null>(null);

  const signTx = useTransaction<Buffer>({ contract: 'attest' });
  const reviewTx = useTransaction<void>({
    contract: 'program',
    onSuccess: () => {
      applicationRead.refetch();
      setApprovedInput('');
    },
  });

  const queue = useMemo(
    () => FIXTURE_VERIFIER_QUEUE.filter((item) => (statusById[item.id] ?? 'idle') !== 'declined' && (statusById[item.id] ?? 'idle') !== 'done'),
    [statusById],
  );
  const mine = useMemo(() => [...newlySigned, ...FIXTURE_MY_ATTESTATIONS], [newlySigned]);
  const applicantValid = looksLikeAddress(selectedApplicant);
  const isReviewerRead = useContractRead(
    () => demoProgramme.is_reviewer({ addr: address ?? '' }),
    [demoProgramme, address],
    { contract: 'program', enabled: Boolean(address) },
  );
  const applicationRead = useContractResult<Application>(
    () => demoProgramme.get_application({ applicant: selectedApplicant }),
    [demoProgramme, selectedApplicant],
    { contract: 'program', enabled: applicantValid },
  );

  const programmes = useMemo(() => {
    const ids = new Set<string>();
    for (const item of queue) ids.add(item.programmeId);
    for (const item of mine) ids.add(item.programmeId);
    return ids;
  }, [queue, mine]);

  const stats = [
    { k: 'Waiting for you', v: String(queue.length) },
    { k: 'Signed', v: String(mine.length) },
    { k: 'Programmes', v: String(programmes.size) },
  ];

  const openItem = openId ? (queue.find((item) => item.id === openId) ?? null) : null;

  const openClaim = (item: VerifierQueueItem) => {
    setOpenId(item.id);
    setChecked(false);
    setReference('');
    signTx.reset();
  };

  const closeClaim = () => {
    setOpenId(null);
    setChecked(false);
    setReference('');
    signTx.reset();
  };

  /** Dismiss with no transaction at all — the tranche stays locked. */
  const declineClaim = (item: VerifierQueueItem) => {
    setStatusById((prev) => ({ ...prev, [item.id]: 'declined' }));
    if (openId === item.id) closeClaim();
    announce('Marked as not confirmed. Nothing was sent; the tranche stays locked.');
  };

  const signClaim = async (item: VerifierQueueItem) => {
    if (!address || !checked || signTx.busy) return;
    setSigningId(item.id);
    setStatusById((prev) => ({ ...prev, [item.id]: 'pending' }));
    announce('Signing attestation.');

    // Stand-in queue rows carry human schema names, not on-chain UIDs, so the
    // sign attempt below carries a placeholder hash: the contract rejects it
    // with SchemaNotFound and the error panel explains it. Swapping in the real
    // queue (with real schema UIDs) is a change of source, not of flow.
    const result = await signTx.send(async () => {
      const tx = await attest.attest({
        attester: address,
        schema_uid: Buffer.alloc(32),
        subject: item.subject,
        data_hash: Buffer.alloc(32),
        expires_at: undefined,
      });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      const uid = `att_${result.toString('hex').slice(0, 12)}…${result.toString('hex').slice(-4)}`;
      setNewlySigned((prev) => [
        {
          uid,
          programmeId: item.programmeId,
          programme: item.programme,
          subject: item.subject,
          schema: item.schema,
          ledger: item.requestedLedger + 1,
          used: false,
        },
        ...prev,
      ]);
      setStatusById((prev) => ({ ...prev, [item.id]: 'done' }));
      setOpenId(null);
      setChecked(false);
      setReference('');
      announce(`Attestation signed. ${item.subject} can now release tranche ${item.tranche}.`);
    } else {
      setStatusById((prev) => ({ ...prev, [item.id]: 'error' }));
      const explained = signTx.error ? explain(signTx.error, 'attest') : null;
      announce(explained ? `Attestation not signed. ${explained.message}` : 'Attestation not signed.', 'alert');
    }
    setSigningId(null);
  };

  const rememberApplicant = () => {
    const applicant = applicantInput.trim();
    setReviewFormError(null);
    if (!looksLikeAddress(applicant)) {
      setReviewFormError('Enter a valid applicant address.');
      return;
    }
    setSelectedApplicant(applicant);
    setRememberedApplicants((existing) =>
      existing.some((item) => item.address === applicant)
        ? existing
        : [{ address: applicant, label: 'Manual applicant' }, ...existing],
    );
    setApplicantInput('');
  };

  const selectApplicant = (applicant: string) => {
    setSelectedApplicant(applicant);
    setApprovedInput('');
    setReviewFormError(null);
    reviewTx.reset();
  };

  const submitReview = async () => {
    setReviewFormError(null);
    if (!address) {
      setReviewFormError('Connect a reviewer wallet first.');
      return;
    }
    if (!applicantValid) {
      setReviewFormError('Choose or enter a valid applicant address.');
      return;
    }
    if (!isReviewerRead.data) {
      setReviewFormError('The connected wallet is not registered as a reviewer for this programme.');
      return;
    }
    const parsed = validateAmount(approvedInput, { asset: 'XLM' });
    if (!parsed.ok) {
      setReviewFormError(parsed.error);
      return;
    }
    const application = applicationRead.data;
    if (application && parsed.value > application.requested) {
      setReviewFormError('The approved amount cannot exceed what the applicant requested.');
      return;
    }

    const result = await reviewTx.send(async () => {
      const tx = await demoProgramme.review({
        reviewer: address,
        applicant: selectedApplicant,
        approved: parsed.value,
      });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (result !== null) {
      announce(`Review vote submitted for ${truncateAddress(selectedApplicant)}.`);
    }
  };

  const signIn = async () => {
    setConnecting(true);
    try {
      await connect();
    } finally {
      setConnecting(false);
    }
  };

  const signError = signTx.error ? explain(signTx.error, 'attest') : null;
  const application = applicationRead.data;
  const reviewError = reviewTx.error ? explain(reviewTx.error, 'program') : null;

  return (
    <div className="dashboard-container verifier-page">
      <header className="verifier-page__head">
        <div className="verifier-page__titles">
          <h1 id="h-ver">Verify conditions</h1>
          <p className="typo-text text-muted">
            When you confirm a condition, you sign an attestation. Each one unlocks exactly one
            tranche for one recipient, and can&apos;t be used twice.
          </p>
        </div>
        <Link className="verifier-page__lookup" to="/attestations">
          Look up an attestation →
        </Link>
      </header>

      {!address ? (
        <section className="verifier-page__signin" aria-labelledby="verifier-signin">
          <div className="verifier-page__signin-copy">
            <h2 id="verifier-signin">Sign in with your verifier account</h2>
            <p className="typo-text text-muted">
              Use the account the programme registered as its verifier, in Freighter.
            </p>
            <Button onClick={signIn} loading={connecting} loadingLabel="Signing in…">
              Sign in
            </Button>
          </div>
          <ul className="verifier-page__signin-list">
            <li>
              <span className="verifier-page__signin-name">Claims waiting for you</span>
              <span className="verifier-page__signin-hint">
                Recipients whose next tranche needs your confirmation
              </span>
            </li>
            <li>
              <span className="verifier-page__signin-name">Attestations you&apos;ve signed</span>
              <span className="verifier-page__signin-hint">
                And whether each has released a tranche yet
              </span>
            </li>
            <li>
              <span className="verifier-page__signin-name">Programmes you verify for</span>
              <span className="verifier-page__signin-hint">
                With the condition each one asks you to check
              </span>
            </li>
          </ul>
        </section>
      ) : (
        <>
          <div className="verifier-page__stats" role="list" aria-label="Verification summary">
            {stats.map((s) => (
              <div key={s.k} className="verifier-page__stat" role="listitem">
                <span className="verifier-page__stat-label">{s.k}</span>
                <span className="verifier-page__stat-value numeric">{s.v}</span>
              </div>
            ))}
          </div>

          <div className="verifier-page__grid">
            <section aria-labelledby="reviewer-vote">
              <h2 id="reviewer-vote" className="verifier-page__section-title">
                Vote on applications
              </h2>
              <div className="reviewer-panel">
                <p className="reviewer-panel__copy">
                  Reviewers approve an amount up to the applicant&apos;s request. The contract
                  stores one vote per reviewer and lets you amend it before finalisation.
                </p>
                <div className="reviewer-panel__status">
                  <Badge tone={isReviewerRead.loading ? 'neutral' : isReviewerRead.data ? 'success' : 'danger'}>
                    {isReviewerRead.loading ? 'Checking reviewer status' : isReviewerRead.data ? 'Reviewer wallet' : 'Not a reviewer'}
                  </Badge>
                  <span className="numeric" title={demoProgramme.options.contractId}>
                    Programme {truncateAddress(demoProgramme.options.contractId, 6, 4)}
                  </span>
                </div>

                <div className="reviewer-panel__add">
                  <Field
                    label="Applicant address"
                    hint="Paste an applicant to load its current application and vote."
                    value={applicantInput}
                    onChange={(event) => setApplicantInput(event.target.value.trim())}
                    placeholder="G…"
                  />
                  <Button variant="secondary" onClick={rememberApplicant}>
                    Load applicant
                  </Button>
                </div>

                {rememberedApplicants.length > 0 && (
                  <ul className="reviewer-panel__queue" aria-label="Known applicants">
                    {rememberedApplicants.map((applicant) => (
                      <li key={applicant.address}>
                        <button
                          type="button"
                          className={selectedApplicant === applicant.address ? 'reviewer-panel__applicant reviewer-panel__applicant--selected' : 'reviewer-panel__applicant'}
                          onClick={() => selectApplicant(applicant.address)}
                        >
                          <span>{applicant.label}</span>
                          <span className="numeric">{truncateAddress(applicant.address, 6, 4)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedApplicant && (
                  <div className="reviewer-panel__application">
                    <div className="reviewer-panel__application-head">
                      <span className="numeric" title={selectedApplicant}>
                        {selectedApplicant}
                      </span>
                      <Button variant="secondary" size="sm" onClick={applicationRead.refetch} loading={applicationRead.fetching}>
                        Refresh
                      </Button>
                    </div>
                    {applicationRead.loading ? (
                      <PendingState title="Loading application…" note="Reading the programme contract." />
                    ) : applicationRead.error ? (
                      <ErrorPanel explained={explain(applicationRead.error, 'program')} />
                    ) : application ? (
                      <>
                        <dl className="reviewer-panel__facts">
                          <div>
                            <dt>Requested</dt>
                            <dd className="numeric">{formatAmount(application.requested, { asset: 'XLM' })}</dd>
                          </div>
                          <div>
                            <dt>Votes</dt>
                            <dd className="numeric">{application.votes.length}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{application.finalized ? 'Finalized' : application.withdrawn ? 'Withdrawn' : 'Open for review'}</dd>
                          </div>
                        </dl>
                        <AmountField
                          label="Approved amount"
                          value={approvedInput}
                          onChange={setApprovedInput}
                          asset="XLM"
                          balance={application.requested}
                          hint="Cannot exceed the applicant's requested amount."
                          disabled={application.finalized || application.withdrawn}
                        />
                        {reviewFormError && (
                          <p className="reviewer-panel__error" role="alert">
                            {reviewFormError}
                          </p>
                        )}
                        {reviewError && <ErrorPanel explained={reviewError} live />}
                        <Button
                          onClick={() => void submitReview()}
                          loading={reviewTx.busy}
                          disabled={application.finalized || application.withdrawn || !isReviewerRead.data}
                        >
                          Submit review vote
                        </Button>
                        <TransactionOutcome phase={reviewTx.phase} error={reviewTx.error} successTitle="Review vote submitted" />
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="verifier-page__sample-note">
                <Badge tone="neutral">Sample data</Badge> Applicant shortcuts are sample until an
                indexer supplies a reviewer queue.
              </p>
            </section>

            <section aria-labelledby="verifier-queue">
              <h2 id="verifier-queue" className="verifier-page__section-title">
                Waiting for your confirmation
              </h2>
              {queue.length === 0 ? (
                <div className="verifier-page__empty">
                  <p className="typo-text">
                    <strong>All done.</strong> Nothing waiting — new claims appear here when a
                    recipient&apos;s next tranche needs you.
                  </p>
                </div>
              ) : (
                <ul className="verifier-page__queue">
                  {queue.map((item) => {
                    const isOpen = openId === item.id;
                    const status = statusById[item.id] ?? 'idle';
                    const pending = status === 'pending' && signingId === item.id;
                    return (
                      <li key={item.id}>
                        <article
                          className={`verifier-card${isOpen ? ' verifier-card--open' : ''}`}
                          aria-label={`${item.condition}, ${item.programme}`}
                        >
                          <div className="verifier-card__top">
                            <span className="verifier-card__titles">
                              <span className="verifier-card__condition">{item.condition}</span>
                              <span className="verifier-card__meta">
                                {item.programme} · Tranche {item.tranche} of {item.tranches}
                              </span>
                            </span>
                            <span className="verifier-card__subject numeric" title={item.subject}>
                              {truncateAddress(item.subject, 6, 4)}
                            </span>
                          </div>

                          {!isOpen ? (
                            <div className="verifier-card__actions">
                              <Button size="sm" onClick={() => openClaim(item)}>
                                Review claim
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => declineClaim(item)}>
                                Can&apos;t confirm
                              </Button>
                            </div>
                          ) : (
                            <div className="verifier-card__review">
                              <dl className="verifier-card__facts">
                                <div>
                                  <dt>Schema</dt>
                                  <dd className="numeric">{item.schema}</dd>
                                </div>
                                <div>
                                  <dt>Recipient</dt>
                                  <dd className="numeric" title={item.subject}>
                                    {item.subject}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Requested at ledger</dt>
                                  <dd className="numeric">
                                    {item.requestedLedger.toLocaleString()}
                                  </dd>
                                </div>
                              </dl>

                              <Field
                                label="Reference (optional)"
                                placeholder="e.g. register page, invoice number"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                              />

                              <label className="verifier-card__gate">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => setChecked(event.target.checked)}
                                />
                                <span className="verifier-card__box" aria-hidden="true">
                                  {checked ? '✓' : ''}
                                </span>
                                <span>
                                  I checked this myself and the condition is met. Signing releases
                                  money and can&apos;t be undone.
                                </span>
                              </label>

                              {status === 'error' && signError && openItem?.id === item.id && (
                                <ErrorPanel explained={signError} live />
                              )}
                              {pending && (
                                <PendingState title="Signing…" note="Check your wallet to approve." />
                              )}

                              <div className="verifier-card__actions">
                                <Button variant="secondary" size="sm" onClick={closeClaim}>
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={!checked || pending}
                                  loading={pending}
                                  loadingLabel="Signing…"
                                  onClick={() => signClaim(item)}
                                >
                                  Confirm and sign
                                </Button>
                              </div>
                            </div>
                          )}
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="verifier-page__sample-note">
                <Badge tone="neutral">Sample data</Badge> Sample queue for the design phase.
              </p>
            </section>

            <section aria-labelledby="verifier-signed">
              <h2 id="verifier-signed" className="verifier-page__section-title">
                Signed by you
              </h2>
              {mine.length === 0 ? (
                <div className="verifier-page__empty">
                  <p className="typo-text text-muted">
                    No attestations yet. Claims you confirm appear here.
                  </p>
                </div>
              ) : (
                <ul className="verifier-page__signed">
                  {mine.map((m) => (
                    <li key={m.uid} className="verifier-signed">
                      <div className="verifier-signed__row">
                        <span className="verifier-signed__uid numeric" title={m.uid}>
                          {truncateAddress(m.uid, 8, 6)}
                        </span>
                        <Badge tone={m.used ? 'accent' : 'neutral'}>
                          {m.used ? 'Used to release a tranche' : 'Not used yet'}
                        </Badge>
                      </div>
                      <span className="verifier-signed__meta">
                        {m.programme} · {truncateAddress(m.subject, 6, 4)} · {m.schema} · ledger{' '}
                        {m.ledger.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="verifier-page__sample-note">
                <Badge tone="neutral">Sample data</Badge> Sample queue and attestations for the
                design phase.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
};
