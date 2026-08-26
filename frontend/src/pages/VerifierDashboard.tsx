import { useState, type FormEvent } from 'react';
import './VerifierDashboard.css';
import { ShieldCheck, Clock, FileSignature } from 'lucide-react';
import type { Application } from '@milepost/program';
import { useContractRead, useContractResult, useProgramme, useTransaction } from '../hooks';
import { useWallet } from '../context/useWallet';
import { formatAmount, tryParseAmount } from '../lib/amount';
import { AsyncView } from '../components/state/AsyncStates';
import { Button, Field } from '../components/ui';

const DEMO_APPLICANT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

export const VerifierDashboard = () => {
  const { address } = useWallet();
  const { client: programme } = useProgramme();
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
        <p className="typo-text text-muted">Review conditions and sign on-chain attestations to unlock funds.</p>
      </header>

      <section className="stats-grid animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><Clock size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Pending Reviews</span>
            <span className="stat-value">12</span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><ShieldCheck size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Attested</span>
            <span className="stat-value">458</span>
          </div>
        </div>
      </section>

      <section className="queue-section animate-fade-up" style={{ animationDelay: '200ms' }}>
        <h2>Attestation Queue</h2>
        <div className="queue-list">
          <div className="queue-item glass-panel">
            <div className="queue-item-icon">
              <FileSignature size={24} />
            </div>
            <div className="queue-item-content">
              <div className="queue-item-header">
                <h3>Semester Completion</h3>
                <span className="badge badge-pending">Pending</span>
              </div>
              <p className="typo-text text-muted">
                <strong>Recipient:</strong> GCS-2026-042 <br/>
                <strong>Program:</strong> CS Scholarship 2026 <br/>
                <strong>Tranche Unlock:</strong> $1,000 Stipend
              </p>
            </div>
            <div className="queue-item-actions">
              <button type="button" className="btn-secondary">View Proof</button>
              <button type="button" className="btn-primary">Sign Attestation</button>
            </div>
          </div>

          <div className="queue-item glass-panel">
            <div className="queue-item-icon">
              <FileSignature size={24} />
            </div>
            <div className="queue-item-content">
              <div className="queue-item-header">
                <h3>Enrollment Verification</h3>
                <span className="badge badge-pending">Pending</span>
              </div>
              <p className="typo-text text-muted">
                <strong>Recipient:</strong> GCS-2026-089 <br/>
                <strong>Program:</strong> CS Scholarship 2026 <br/>
                <strong>Tranche Unlock:</strong> $1,500 Tuition
              </p>
            </div>
            <div className="queue-item-actions">
              <button type="button" className="btn-secondary">View Proof</button>
              <button type="button" className="btn-primary">Sign Attestation</button>
            </div>
          </div>

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
