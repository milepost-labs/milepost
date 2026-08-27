import { useState } from 'react';
import { useContractResult, useProgramme, useTransaction, phaseLabel } from '../hooks';
import { AsyncView, ErrorState } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field, Modal, type BadgeTone } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { formatAmount } from '../lib/amount';
import { explain } from '../lib/errors';
import './ApplicationTimeline.css';

/** Seeded testnet applicant (Ada) — carries an application through every real state. */
const DEMO_APPLICANT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

type StepStatus = 'done' | 'current' | 'pending' | 'blocked';

interface Step {
  key: string;
  label: string;
  status: StepStatus;
  detail: string;
  deadline?: string;
}

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const formatDate = (seconds: bigint) => new Date(Number(seconds) * 1000).toLocaleString();
const shorten = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

const STATUS_TONE: Record<StepStatus, BadgeTone> = {
  done: 'success',
  current: 'accent',
  pending: 'neutral',
  blocked: 'danger',
};

const STATUS_LABEL: Record<StepStatus, string> = {
  done: 'Done',
  current: 'In progress',
  pending: 'Not started',
  blocked: 'Will not happen',
};

export const ApplicationTimeline = () => {
  const { address: walletAddress } = useWallet();
  const { client: programme } = useProgramme();

  const [subjectInput, setSubjectInput] = useState(walletAddress ?? DEMO_APPLICANT);
  const [subject, setSubject] = useState(walletAddress ?? DEMO_APPLICANT);
  const [inputError, setInputError] = useState<string | null>(null);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);

  const application = useContractResult(
    () => programme.get_application({ applicant: subject }),
    [programme, subject],
  );
  const config = useContractResult(() => programme.get_config(), [programme]);
  const award = useContractResult(
    () => programme.get_award({ recipient: subject }),
    [programme, subject],
    { enabled: application.data?.finalized === true },
  );

  const withdrawTx = useTransaction({ contract: 'program' });

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

  const handleWithdrawConfirm = async () => {
    const result = await withdrawTx.send(async () => {
      const tx = await programme.withdraw({ applicant: subject });
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      setWithdrawModalOpen(false);
      application.refetch();
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Application timeline</h1>
        <p className="typo-text text-muted">
          Where an application stands between submitting and being paid, and what it is waiting on next.
        </p>
      </header>

      <Card title="Look up an application">
        <div className="timeline-search">
          <Field
            label="Applicant address"
            placeholder="G..."
            value={subjectInput}
            onChange={(event) => {
              setSubjectInput(event.target.value);
              setInputError(null);
            }}
            error={inputError}
          />
          <div className="timeline-search__actions">
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
        {...application}
        onRetry={application.refetch}
        empty={{
          title: 'No application yet',
          description: 'This address has not applied to this programme.',
        }}
      >
        {(app) => (
          <AsyncView data={config.data} loading={config.loading} error={config.error} onRetry={config.refetch}>
            {(cfg) => {
              const now = BigInt(Math.floor(Date.now() / 1000));
              const quorumMet = app.votes.length >= cfg.quorum;
              const reviewClosed = now >= cfg.review_deadline;
              const isWithdrawn = app.withdrawn;
              const notAwarded = !isWithdrawn && !app.finalized && reviewClosed && !quorumMet;

              const canWithdraw = !app.finalized && !app.withdrawn;

              const steps: Step[] = [
                {
                  key: 'submitted',
                  label: 'Submitted',
                  status: 'done',
                  detail: `Applied on ${formatDate(app.submitted_at)}, requesting ${formatXlm(app.requested)}.`,
                },
                {
                  key: 'review',
                  label: 'Under review',
                  status: isWithdrawn ? 'blocked' : app.finalized ? 'done' : notAwarded ? 'blocked' : 'current',
                  detail: isWithdrawn
                    ? 'Application was withdrawn by the applicant.'
                    : app.finalized
                      ? `Reviewed by ${app.votes.length} reviewer${app.votes.length === 1 ? '' : 's'}; settled at the median vote.`
                      : notAwarded
                        ? `Only ${app.votes.length} of ${cfg.quorum} required reviewer votes came in before the review window closed.`
                        : quorumMet
                          ? `Quorum reached (${app.votes.length}/${cfg.quorum}) — waiting on anyone to trigger finalization.`
                          : `${app.votes.length} of ${cfg.quorum} required reviewer votes in.`,
                  deadline: isWithdrawn || app.finalized ? undefined : `Review closes ${formatDate(cfg.review_deadline)}`,
                },
                {
                  key: 'awarded',
                  label: 'Awarded',
                  status: isWithdrawn || notAwarded ? 'blocked' : app.finalized ? 'done' : 'pending',
                  detail: isWithdrawn
                    ? 'Withdrawn applications will not receive an award.'
                    : notAwarded
                      ? 'This application will not be awarded — quorum was not reached before reviewing closed.'
                      : app.finalized && award.data
                        ? `Granted ${formatXlm(award.data.granted)} of the ${formatXlm(app.requested)} requested, paid via ${award.data.mode.tag} mode.`
                        : app.finalized
                          ? 'Finalized — award details are loading.'
                          : 'Waiting on quorum, then anyone to finalize.',
                },
                {
                  key: 'releasing',
                  label: 'Releasing',
                  status: isWithdrawn || notAwarded
                    ? 'blocked'
                    : !app.finalized
                      ? 'pending'
                      : award.data && award.data.tranches_released >= award.data.tranches
                        ? 'done'
                        : 'current',
                  detail: isWithdrawn || notAwarded
                    ? 'No award, so nothing to release.'
                    : !app.finalized
                      ? 'Starts once the application is finalized into an award.'
                      : award.data
                        ? `${award.data.tranches_released} of ${award.data.tranches} tranches released — ${formatXlm(award.data.released)} of ${formatXlm(award.data.granted)} paid so far.`
                        : 'Award details are loading.',
                  deadline:
                    !isWithdrawn && !notAwarded && app.finalized
                      ? `Releases close ${formatDate(cfg.release_deadline)} — anything unreleased after that becomes refundable to donors`
                      : undefined,
                },
              ];

              const withdrawError = withdrawTx.error ? explain(withdrawTx.error, 'program') : null;

              return (
                <>
                  {isWithdrawn && (
                    <Card className="timeline-outcome">
                      <Badge tone="danger">Withdrawn</Badge>
                      <p className="typo-text" style={{ marginTop: '0.5rem' }}>
                        This application has been withdrawn by the applicant. Withdrawal is final and re-application to this programme is rejected.
                      </p>
                    </Card>
                  )}

                  {notAwarded && (
                    <Card className="timeline-outcome">
                      <Badge tone="danger">Not awarded</Badge>
                      <p className="typo-text">
                        The review window closed on {formatDate(cfg.review_deadline)} with only {app.votes.length} of{' '}
                        {cfg.quorum} required reviewer votes in. Since reviewers can only vote during the review
                        window, this application cannot be finalized and will not receive an award.
                      </p>
                    </Card>
                  )}

                  <Card
                    title="Timeline"
                    aside={
                      canWithdraw ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: 'var(--color-error)' }}
                          onClick={() => setWithdrawModalOpen(true)}
                        >
                          Withdraw application
                        </Button>
                      ) : null
                    }
                  >
                    <ol className="timeline">
                      {steps.map((step) => (
                        <li key={step.key} className={`timeline-step timeline-step--${step.status}`}>
                          <span className="timeline-step__marker" aria-hidden="true" />
                          <div className="timeline-step__body">
                            <div className="timeline-step__header">
                              <h3>{step.label}</h3>
                              <Badge tone={STATUS_TONE[step.status]}>{STATUS_LABEL[step.status]}</Badge>
                            </div>
                            <p className="typo-text text-muted">{step.detail}</p>
                            {step.deadline && <p className="timeline-step__deadline">{step.deadline}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Card>

                  {app.finalized && !award.data && award.error && (
                    <Card title="Award details">
                      <ErrorState error={award.error} contract="program" onRetry={award.refetch} />
                    </Card>
                  )}

                  <Modal
                    open={withdrawModalOpen}
                    onClose={() => !withdrawTx.busy && setWithdrawModalOpen(false)}
                    title="Withdraw application"
                    busy={withdrawTx.busy}
                    footer={
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => setWithdrawModalOpen(false)}
                          disabled={withdrawTx.busy}
                        >
                          Cancel
                        </Button>
                        <Button
                          style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
                          onClick={handleWithdrawConfirm}
                          loading={withdrawTx.busy}
                          loadingLabel={phaseLabel(withdrawTx.phase) || 'Withdrawing…'}
                        >
                          Confirm withdrawal
                        </Button>
                      </>
                    }
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <p style={{ margin: 0 }}>
                        Are you sure you want to withdraw your application ({shorten(subject)})?
                      </p>
                      <p className="typo-text text-muted" style={{ margin: 0 }}>
                        Withdrawal is final and cannot be undone. You will not be able to re-apply to this programme, and reviewers will no longer be able to review or finalize this application.
                      </p>
                      {withdrawError && (
                        <div style={{ padding: '0.5rem', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)' }}>
                          {withdrawError.message} {withdrawError.action}
                        </div>
                      )}
                    </div>
                  </Modal>
                </>
              );
            }}
          </AsyncView>
        )}
      </AsyncView>
    </div>
  );
};

