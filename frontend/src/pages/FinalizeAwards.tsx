import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award as AwardIcon,
  CheckCircle,
  Coins,
  Globe,
  Landmark,
  Lock,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { contract, type Award, type Mode } from '@milepost/program';
import { useContractRead, useContractResult, useProgramme, useTransaction } from '../hooks';
import { useWallet } from '../context/useWallet';
import { AsyncView, Loading } from '../components/state/AsyncStates';
import { Badge, Button, Card, Field, PhaseBadge } from '../components/ui';
import { formatAmount } from '../lib/amount';
import './FinalizeAwards.css';

interface ModeOption {
  tag: Mode['tag'];
  icon: typeof Landmark;
  label: string;
  summary: string;
  consequence: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    tag: 'Direct',
    icon: Landmark,
    label: 'Direct',
    summary: 'Paid straight to a verified payee you choose now — a school, clinic or supplier.',
    consequence:
      'The recipient never holds the money and never chooses who receives it. Equally unbypassable as Allocated; the difference is the recipient loses choice.',
  },
  {
    tag: 'Allocated',
    icon: ShieldCheck,
    label: 'Allocated',
    summary: 'Held in escrow; the recipient directs it to a verified payee later.',
    consequence:
      'The strongest guarantee available: funds can never reach anyone unverified because they never leave escrow until directed. Equally unbypassable as Direct, but the recipient keeps choice.',
  },
  {
    tag: 'Restricted',
    icon: Lock,
    label: 'Restricted',
    summary: 'Paid into the recipient’s smart wallet, gated by a spend policy.',
    consequence:
      'Weaker than it looks: the policy constrains one signer, not the wallet. This screen only checks the policy is installed — at release, not now.',
  },
  {
    tag: 'Open',
    icon: Globe,
    label: 'Open',
    summary: 'Paid to the recipient with no restriction on onward spending.',
    consequence: 'No guardrails at all. The recipient can spend the award however they like.',
  },
];

const truncate = (addr: string) => `${addr.slice(0, 5)}…${addr.slice(-4)}`;

export const FinalizeAwards = () => {
  const { client: programme } = useProgramme();
  const wallet = useWallet();

  // Overview reads — always enabled, so `loading` covers the initial fetch.
  const budget = useContractResult(() => programme.budget(), [programme]);
  const config = useContractResult(() => programme.get_config(), [programme]);
  const phase = useContractResult(() => programme.get_phase(), [programme]);

  // Application and its award, keyed on the address the user submitted. Both
  // start disabled, so their first load is driven by `applicant` becoming
  // non-empty.
  const [applicantInput, setApplicantInput] = useState('');
  const [applicant, setApplicant] = useState('');
  const application = useContractResult(
    () => programme.get_application({ applicant }),
    [programme, applicant],
    { enabled: applicant !== '' },
  );
  const award = useContractResult(
    () => programme.get_award({ recipient: applicant }),
    [programme, applicant],
    { enabled: applicant !== '' && application.data?.finalized === true },
  );

  const [modeTag, setModeTag] = useState<Mode['tag'] | null>(null);
  const [payeeInput, setPayeeInput] = useState('');
  // The address whose payee status the contract was last asked about. Kept
  // separate from the input so an edit does not silently re-check.
  const [payeeToVerify, setPayeeToVerify] = useState('');
  const payeeCheck = useContractRead(
    () => programme.is_payee({ payee: payeeToVerify }),
    [programme, payeeToVerify],
    { enabled: payeeToVerify !== '' },
  );

  const [settledAward, setSettledAward] = useState<Award | null>(null);

  const finalizeTx = useTransaction<contract.Result<Award>>({
    contract: 'program',
    onSuccess: (result) => {
      setSettledAward(result.unwrap());
      application.refetch();
    },
  });

  const quorum = config.data?.quorum ?? 0;
  const votes = application.data?.votes ?? [];
  const quorumReached = application.data != null && votes.length >= quorum;
  const granted = quorumReached ? votes[Math.floor((quorum - 1) / 2)] : null;
  const remainingAfter = budget.data != null && granted != null ? budget.data - granted : null;
  const insufficient = remainingAfter != null && remainingAfter < 0n;

  const selectedMode = modeTag ? ({ tag: modeTag, values: undefined } satisfies Mode) : null;
  const needsVerifiedPayee = selectedMode?.tag === 'Direct';
  const payee = needsVerifiedPayee ? payeeToVerify : applicant;
  const payeeReady = !needsVerifiedPayee || payeeCheck.data === true;

  // The applicant and payee reads start disabled, and the hook's `loading` flag
  // only covers the initial mount. A read that just became enabled is in flight
  // with neither data nor error yet — treat that as loading.
  const applicationPending =
    applicant !== '' && application.data === null && application.error === null;
  const payeePending = payeeToVerify !== '' && payeeCheck.data === null && payeeCheck.error === null;

  const submitApplicant = (event: FormEvent) => {
    event.preventDefault();
    const address = applicantInput.trim();
    if (!address) return;
    setApplicant(address);
    setModeTag(null);
    setPayeeInput('');
    setPayeeToVerify('');
    setSettledAward(null);
  };

  const finalize = () => {
    if (!selectedMode || !application.data || !payeeReady) return;
    void finalizeTx.send(() => programme.finalize({ applicant, payee, mode: selectedMode }));
  };

  return (
    <div className="dashboard-container finalize-page">
      <header className="dashboard-header animate-fade-up">
        <h1>Finalize Awards</h1>
        <p className="typo-text text-muted">
          Settle quorum-reached applications into awards. The mode you pick decides whether the money can reach anyone unverified.
        </p>
      </header>

      <section className="stats-grid animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><Coins size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Remaining Budget</span>
            <span className="stat-value">
              <AsyncView {...budget} onRetry={budget.refetch}>
                {(value) => formatAmount(value, { asset: 'XLM' })}
              </AsyncView>
            </span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><AwardIcon size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Programme Phase</span>
            <span className="stat-value">
              <AsyncView {...phase} onRetry={phase.refetch}>
                {(value) => <PhaseBadge phase={value.tag} />}
              </AsyncView>
            </span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><CheckCircle size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Reviewer Quorum</span>
            <span className="stat-value">
              <AsyncView {...config} onRetry={config.refetch}>
                {(value) => `${value.quorum} votes`}
              </AsyncView>
            </span>
          </div>
        </div>
      </section>

      <section className="finalize-panel glass-panel animate-fade-up" style={{ animationDelay: '200ms' }}>
        <Card>
          <div className="finalize-panel__heading">
            <h2>Find an application</h2>
            <p className="typo-text text-muted">
              Only applications with enough reviewer votes can be finalised. Paste an applicant address to load it.
            </p>
          </div>

          <form className="lookup-form" onSubmit={submitApplicant}>
            <div className="lookup-form__field">
              <Field
                label="Applicant address"
                value={applicantInput}
                onChange={(event) => setApplicantInput(event.target.value)}
                placeholder="G…"
                spellCheck={false}
              />
            </div>
            <Button
              type="submit"
              icon={<Search size={18} />}
              loading={applicationPending || application.fetching}
              loadingLabel="Loading…"
              disabled={!applicantInput.trim()}
            >
              Load application
            </Button>
          </form>

          {applicationPending ? (
            <Loading rows={2} />
          ) : (
            <AsyncView
              {...application}
              onRetry={application.refetch}
              empty={{
                title: 'No application loaded yet',
                description: 'Paste an applicant address above and press Load.',
              }}
            >
              {(app) => (
                <>
                  <div className="application-card">
                    <div className="application-card__header">
                      <h3>Application</h3>
                      <Badge tone={app.finalized ? 'success' : quorumReached ? 'warning' : 'neutral'}>
                        {app.finalized ? 'Finalized' : quorumReached ? 'Quorum reached' : 'Awaiting votes'}
                      </Badge>
                    </div>
                    <div className="application-card__grid">
                      <div>
                        <span className="detail-label">Applicant</span>
                        <span className="detail-value mono" title={applicant}>{truncate(applicant)}</span>
                      </div>
                      <div>
                        <span className="detail-label">Requested</span>
                        <span className="detail-value">{formatAmount(app.requested, { asset: 'XLM' })}</span>
                      </div>
                      <div>
                        <span className="detail-label">Votes</span>
                        <span className="detail-value">{app.votes.length} / {quorum} needed</span>
                      </div>
                      <div>
                        <span className="detail-label">Computed award</span>
                        <span className="detail-value">{granted !== null ? formatAmount(granted, { asset: 'XLM' }) : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {app.finalized && (
                    <>
                      <p className="notice">
                        This application has already been settled. Load another applicant to finalise more awards.
                      </p>
                      {settledAward ? (
                        <AwardResultCard title="Award finalised" award={settledAward} />
                      ) : (
                        <AsyncView
                          {...award}
                          onRetry={award.refetch}
                          empty={{ title: 'No award recorded for this application.' }}
                        >
                          {(a) => <AwardResultCard title="Already finalised into an award" award={a} />}
                        </AsyncView>
                      )}
                    </>
                  )}

                  {!app.finalized && !quorumReached && (
                    <p className="notice notice--blocked">
                      Not enough reviewers have voted yet — this application needs {quorum} votes before it can be finalised.
                    </p>
                  )}

                  {!app.finalized && quorumReached && (
                    <div className="finalize-flow">
                      <div className="finalize-flow__heading">
                        <h3>Choose how the award is paid</h3>
                        <p className="typo-text text-muted">
                          The mode decides whether the money stays accountable. Allocated and Direct are equally unbypassable — they differ in who chooses the payee.
                        </p>
                      </div>

                      <div className="mode-grid">
                        {MODE_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const active = modeTag === option.tag;
                          return (
                            <button
                              key={option.tag}
                              type="button"
                              className={`mode-card ${active ? 'mode-card--active' : ''}`}
                              onClick={() => {
                                setModeTag(option.tag);
                                setPayeeToVerify('');
                              }}
                            >
                              <div className="mode-card__icon"><Icon size={22} /></div>
                              <div className="mode-card__body">
                                <h4>{option.label}</h4>
                                <p className="mode-card__summary">{option.summary}</p>
                                <p className="mode-card__consequence">{option.consequence}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {selectedMode && needsVerifiedPayee && (
                        <div className="payee-section">
                          <h4>Verified payee</h4>
                          <p className="typo-text text-muted">
                            Direct awards are paid straight to a verified institution. The payee must be one this programme has verified, or the call fails.
                          </p>
                          <div className="payee-row">
                            <Field
                              label="Verified payee address"
                              value={payeeInput}
                              onChange={(event) => {
                                setPayeeInput(event.target.value);
                                setPayeeToVerify('');
                              }}
                              placeholder="G…"
                              spellCheck={false}
                            />
                            <Button
                              variant="secondary"
                              icon={<ShieldCheck size={18} />}
                              loading={payeePending}
                              loadingLabel="Verifying…"
                              disabled={!payeeInput.trim()}
                              onClick={() => setPayeeToVerify(payeeInput.trim())}
                            >
                              Verify payee
                            </Button>
                          </div>
                          {payeeCheck.data === true && (
                            <p className="notice notice--ok">
                              <CheckCircle size={16} /> {truncate(payeeToVerify)} is a verified payee for this programme.
                            </p>
                          )}
                          {payeeToVerify !== '' && payeeCheck.data === false && (
                            <p className="notice notice--blocked">
                              <AlertTriangle size={16} /> This address is not a verified payee. Only the programme creator can verify a payee.
                            </p>
                          )}
                        </div>
                      )}

                      {selectedMode && !needsVerifiedPayee && (
                        <div className="payee-section">
                          <h4>Payee</h4>
                          <p className="typo-text text-muted">
                            With {selectedMode.tag}, the award is paid to the recipient themselves, so the payee is the applicant.
                          </p>
                          <div className="payee-row">
                            <span className="detail-value mono" title={applicant}>{truncate(applicant)}</span>
                          </div>
                        </div>
                      )}

                      {granted !== null && budget.data !== null && (
                        <div className={`budget-note ${insufficient ? 'budget-note--error' : 'budget-note--ok'}`}>
                          <div>
                            <span className="detail-label">Computed award</span>
                            <span className="detail-value">{formatAmount(granted, { asset: 'XLM' })}</span>
                          </div>
                          <div>
                            <span className="detail-label">Remaining budget after award</span>
                            <span className="detail-value">{formatAmount(remainingAfter!, { asset: 'XLM' })}</span>
                          </div>
                        </div>
                      )}

                      {insufficient && (
                        <p className="notice notice--blocked">
                          <AlertTriangle size={16} /> This award exceeds the remaining budget. Awards settle in the order they are finalised — first finalised, first funded.
                        </p>
                      )}

                      {wallet.status !== 'connected' && (
                        <p className="notice">
                          <Wallet size={16} /> Connect a wallet above to sign the finalise transaction.
                        </p>
                      )}

                      <div className="finalize-actions">
                        <Button
                          icon={<ArrowRight size={18} />}
                          loading={finalizeTx.busy}
                          loadingLabel="Finalising…"
                          disabled={!payeeReady || insufficient || wallet.status !== 'connected'}
                          onClick={finalize}
                        >
                          Finalize award
                        </Button>
                        {!payeeReady && needsVerifiedPayee && (
                          <span className="hint">Select and verify a payee first.</span>
                        )}
                      </div>

                      {finalizeTx.error && (
                        <p
                          className={`notice ${finalizeTx.error.kind === 'none' ? '' : 'notice--blocked'}`}
                          role="alert"
                        >
                          {finalizeTx.error.message}
                          {finalizeTx.error.action && <> {finalizeTx.error.action}</>}
                        </p>
                      )}

                      {settledAward && !app.finalized && (
                        <AwardResultCard title="Award finalised" award={settledAward} />
                      )}
                    </div>
                  )}
                </>
              )}
            </AsyncView>
          )}
        </Card>
      </section>
    </div>
  );
};

function AwardResultCard({ title, award }: { title: string; award: Award }) {
  return (
    <div className="award-result">
      <div className="award-result__header">
        <CheckCircle size={20} />
        <h4>{title}</h4>
      </div>
      <div className="application-card__grid">
        <div>
          <span className="detail-label">Recipient</span>
          <span className="detail-value mono" title={award.recipient}>{truncate(award.recipient)}</span>
        </div>
        <div>
          <span className="detail-label">Granted</span>
          <span className="detail-value">{formatAmount(award.granted, { asset: 'XLM' })}</span>
        </div>
        <div>
          <span className="detail-label">Mode</span>
          <span className="detail-value">{award.mode.tag}</span>
        </div>
        <div>
          <span className="detail-label">Payee</span>
          <span className="detail-value mono" title={award.payee}>{truncate(award.payee)}</span>
        </div>
        <div>
          <span className="detail-label">Tranches</span>
          <span className="detail-value">{award.tranches}</span>
        </div>
      </div>
    </div>
  );
}
