import { useState } from 'react';
import { useContractResult, useProgramme } from '../hooks';
import { AsyncView, ErrorState } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field, type BadgeTone } from '../components/ui';
import { useWallet } from '../context/useWallet';
import { formatAmount } from '../lib/amount';
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
              const notAwarded = !app.finalized && reviewClosed && !quorumMet;

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
                  status: app.finalized ? 'done' : notAwarded ? 'blocked' : 'current',
                  detail: app.finalized
                    ? `Reviewed by ${app.votes.length} reviewer${app.votes.length === 1 ? '' : 's'}; settled at the median vote.`
                    : notAwarded
                      ? `Only ${app.votes.length} of ${cfg.quorum} required reviewer votes came in before the review window closed.`
                      : quorumMet
                        ? `Quorum reached (${app.votes.length}/${cfg.quorum}) — waiting on anyone to trigger finalization.`
                        : `${app.votes.length} of ${cfg.quorum} required reviewer votes in.`,
                  deadline: app.finalized ? undefined : `Review closes ${formatDate(cfg.review_deadline)}`,
                },
                {
                  key: 'awarded',
                  label: 'Awarded',
                  status: notAwarded ? 'blocked' : app.finalized ? 'done' : 'pending',
                  detail: notAwarded
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
                  status: notAwarded
                    ? 'blocked'
                    : !app.finalized
                      ? 'pending'
                      : award.data && award.data.tranches_released >= award.data.tranches
                        ? 'done'
                        : 'current',
                  detail: notAwarded
                    ? 'No award, so nothing to release.'
                    : !app.finalized
                      ? 'Starts once the application is finalized into an award.'
                      : award.data
                        ? `${award.data.tranches_released} of ${award.data.tranches} tranches released — ${formatXlm(award.data.released)} of ${formatXlm(award.data.granted)} paid so far.`
                        : 'Award details are loading.',
                  deadline:
                    !notAwarded && app.finalized
                      ? `Releases close ${formatDate(cfg.release_deadline)} — anything unreleased after that becomes refundable to donors`
                      : undefined,
                },
              ];

              return (
                <>
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

                  <Card title="Timeline">
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
                </>
              );
            }}
          </AsyncView>
        )}
      </AsyncView>
    </div>
  );
};
