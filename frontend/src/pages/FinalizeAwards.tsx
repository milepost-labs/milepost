import { useMemo, useState, type FormEvent } from 'react';
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
import {
  useAnnounceTransaction,
  useContractRead,
  useContractResult,
  useProgramme,
  useProgrammeParam,
  useTransaction,
} from '../hooks';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { AsyncView, Loading } from '../components/state/AsyncStates';
import { PausedBanner } from '../components/programme/PausedBanner';
import { Badge, Button, Card, Field, PhaseBadge, Select } from '../components/ui';
import { formatAmount } from '../lib/amount';
import { explainCode } from '../lib/errors';
import { FIXTURE_PROGRAMMES, chainFor } from '../fixtures/programmes';
import { FIXTURE_REVIEW_APPLICATIONS, medianForQuorum } from '../fixtures/finalizeFixtures';
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

/** Programme whose review applications stand in for the unwired list. */
const REVIEW_PROGRAMME_ID = 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC';

/**
 * Finalize board (Screen 10, Finalize).
 *
 * Finalisation is permissionless on purpose: anyone may call it once quorum is
 * reached, so no privileged party can strand an applicant. When a programme is
 * oversubscribed the order finalisations arrive in decides who is funded — the
 * contract guarantees the budget is never exceeded (`InsufficientBudget`, 14)
 * but not fairness of ordering. Both facts belong on this screen, before acting.
 *
 * The application rows below are `FIXTURE_REVIEW_APPLICATIONS` — the contracts
 * keep no "all applications" list, so a real list would come from an indexer
 * handler that does not exist yet. The median shown per row uses the same
 * lookup the contract performs at `finalize` (sorted votes at `(quorum-1)/2`,
 * the lower middle for an even count). The single-applicant flow further down
 * this page performs the real on-chain finalization with mode and payee choice.
 */
function FinalizeBoard() {
  const { address } = useWallet();
  const announce = useAnnouncer();

  // Review-phase programmes first: only they can be finalized.
  const ordered = useMemo(
    () =>
      [...FIXTURE_PROGRAMMES].sort((a, b) => {
        const rank = (id: string) => (chainFor(id).phase === 'Review' ? 0 : 1);
        return rank(a.id) - rank(b.id);
      }),
    [],
  );
  const programmeParam = useProgrammeParam();
  const [finPid, setFinPid] = useState<string>(() =>
    programmeParam.status === 'valid' && programmeParam.programmeId ? programmeParam.programmeId : REVIEW_PROGRAMME_ID,
  );
  const [finState, setFinState] = useState<Record<string, 'pending' | 'done' | 'error'>>({});

  const selected = ordered.find((p) => p.id === finPid) ?? ordered[0];
  const chain = chainFor(selected.id);
  const quorum = chain.quorum;
  const isReview = chain.phase === 'Review';
  const apps = useMemo(
    () => (selected.id === REVIEW_PROGRAMME_ID && isReview ? FIXTURE_REVIEW_APPLICATIONS : []),
    [selected.id, isReview],
  );

  const medians = useMemo(() => {
    const map = new Map<string, bigint | null>();
    for (const app of apps) {
      map.set(app.applicant, medianForQuorum(app.votes.map((v) => BigInt(v)), quorum));
    }
    return map;
  }, [apps, quorum]);

  const budget = BigInt(chain.contributed) - BigInt(chain.fee);
  const finalizedSum = apps.reduce(
    (sum, app) =>
      sum + (finState[app.applicant] === 'done' ? (medians.get(app.applicant) ?? 0n) : 0n),
    0n,
  );
  const awarded = BigInt(chain.awarded) + finalizedSum;
  const remaining = budget - awarded;
  const wanted = apps.reduce((sum, app) => {
    const median = medians.get(app.applicant) ?? null;
    return sum + (median !== null && finState[app.applicant] !== 'done' ? median : 0n);
  }, 0n);
  const oversubscribed = wanted > remaining;

  const finalizeRow = (applicant: string, median: bigint) => {
    if (!address || finState[applicant] === 'pending' || finState[applicant] === 'done') return;
    if (median > remaining) {
      setFinState((prev) => ({ ...prev, [applicant]: 'error' }));
      const explained = explainCode('program', 14);
      announce(`Finalize failed. ${explained.message}`, 'alert');
      return;
    }
    setFinState((prev) => ({ ...prev, [applicant]: 'pending' }));
    window.setTimeout(() => {
      setFinState((prev) => ({ ...prev, [applicant]: 'done' }));
      announce(`Award finalized at ${formatAmount(median, { asset: 'XLM' })}.`);
    }, 1300);
  };

  return (
    <section className="finalize-board" aria-label="Finalize awards">
      <ProgrammeParamNotice state={programmeParam} />
      <p className="finalize-board__note">
        Anyone can finalize, so no one can strand an applicant by not pressing a button. You
        don&rsquo;t need an admin account.
      </p>

      <Select
        label="Programme"
        value={selected.id}
        onChange={(event) => setFinPid(event.target.value)}
        options={ordered.map((p) => ({
          value: p.id,
          label: `${p.name ?? p.id} · ${chainFor(p.id).phase}`,
        }))}
      />

      {!isReview ? (
        <p className="finalize-board__phase" role="status">
          Finalizing is available only during Review. This programme is {chain.phase}.
        </p>
      ) : (
        <>
          <div className="finalize-budget">
            <div className="finalize-budget__line">
              <span>
                <strong>Budget</strong>{' '}
                <span className="numeric">{formatAmount(budget, { asset: 'XLM' })}</span>
              </span>
              <span className="finalize-budget__split">
                Awarded <span className="numeric">{formatAmount(awarded, { asset: 'XLM' })}</span>
                {' · '}Left <span className="numeric">{formatAmount(remaining, { asset: 'XLM' })}</span>
              </span>
            </div>
            <div className="finalize-budget__bar" aria-hidden="true">
              <span
                className="finalize-budget__awarded"
                style={{ width: `${budget > 0n ? Number((awarded * 100n) / budget) : 0}%` }}
              />
              <span
                className="finalize-budget__left"
                style={{
                  width: `${budget > 0n && remaining > 0n ? Number((remaining * 100n) / budget) : 0}%`,
                }}
              />
            </div>
            {oversubscribed && (
              <p className="finalize-board__oversub" role="status">
                <AlertTriangle size={16} aria-hidden="true" />
                Awards ready to finalize total {formatAmount(wanted, { asset: 'XLM' })}, but only{' '}
                {formatAmount(remaining, { asset: 'XLM' })} is left. Whoever finalizes first is
                funded first. The budget is protected; the order is not.
              </p>
            )}
          </div>

          {apps.length === 0 ? (
            <p className="finalize-board__phase" role="status">
              No applications to finalize.
            </p>
          ) : (
            <ul className="finalize-rows">
              {apps.map((app) => {
                const votes = app.votes.map((v) => BigInt(v));
                const median = medians.get(app.applicant) ?? null;
                const ready = median !== null;
                const state = finState[app.applicant];
                const needs = quorum - votes.length;
                const gated = !ready || state === 'pending' || state === 'done' || !address;
                const reason = state === 'done'
                  ? 'Finalized. The award is fixed.'
                  : state === 'error'
                    ? explainCode('program', 14).message
                    : median === null
                      ? `Needs ${needs} more vote${needs === 1 ? '' : 's'} before anyone can finalize.`
                      : !address
                        ? 'Sign in to finalize. Anyone can.'
                        : `Award will be ${formatAmount(median, { asset: 'XLM' })}, the median of reviewer votes.`;
                return (
                  <li key={app.applicant} className="finalize-row">
                    <span className="finalize-row__who">
                      <span className="numeric finalize-row__applicant" title={app.applicant}>
                        {truncate(app.applicant)}
                      </span>
                      <span className="finalize-row__asked">
                        Asked {formatAmount(BigInt(app.requested), { asset: 'XLM' })}
                      </span>
                    </span>
                    <span className="finalize-row__votes">
                      <span className="finalize-row__votes-count">
                        {votes.length} of {quorum} votes
                      </span>
                      <span className="numeric finalize-row__votes-list">
                        {votes.map((v) => formatAmount(v, { asset: 'XLM' }).replace(' XLM', '')).join(' · ')}
                      </span>
                    </span>
                    <span className="finalize-row__median">
                      <span className="detail-label">Median</span>
                      <span className="numeric finalize-row__median-value">
                        {median !== null ? formatAmount(median, { asset: 'XLM' }) : '—'}
                      </span>
                    </span>
                    <Button
                      disabled={gated}
                      loading={state === 'pending'}
                      loadingLabel="Finalizing…"
                      onClick={() => {
                        if (median !== null) finalizeRow(app.applicant, median);
                      }}
                    >
                      {state === 'done' ? 'Finalized' : 'Finalize'}
                    </Button>
                    <span
                      className={`finalize-row__reason${state === 'error' ? ' finalize-row__reason--error' : ''}`}
                      role={state === 'error' ? 'alert' : undefined}
                    >
                      {reason}
                      {state === 'error' && (
                        <> Nothing was transferred · program error 14.</>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="finalize-board__sample">Sample applications for the design phase.</p>
        </>
      )}
    </section>
  );
}

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
  useAnnounceTransaction({
    phase: finalizeTx.phase,
    error: finalizeTx.error,
    pending: 'Finalizing the award…',
    success: settledAward
      ? `Award finalized at ${formatAmount(settledAward.granted, { asset: 'XLM' })}.`
      : 'Award finalized.',
  });

  const quorum = config.data?.quorum ?? 0;
  const votes = application.data?.votes ?? [];
  const quorumReached = application.data != null && votes.length >= quorum;
  const granted = quorumReached ? votes[Math.floor((quorum - 1) / 2)] : null;
  const remainingAfter = budget.data != null && granted != null ? budget.data - granted : null;
  const insufficient = remainingAfter != null && remainingAfter < 0n;

  // Minimum award from config — 0n means no minimum is set.
  const minimumAward = config.data?.minimum_award ?? 0n;
  const belowMinimum =
    minimumAward > 0n && granted !== null && granted < minimumAward;

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
      <PausedBanner client={programme} />

      <header className="dashboard-header animate-fade-up">
        <h1>Finalize Awards</h1>
        <p className="typo-text text-muted">
          Settle quorum-reached applications into awards. The mode you pick decides whether the money can reach anyone unverified.
        </p>
      </header>

      <FinalizeBoard />

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
        <div className="stat-card glass-panel">
          <div className="stat-icon"><Coins size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Minimum Award</span>
            <span className="stat-value">
              <AsyncView {...config} onRetry={config.refetch}>
                {(value) =>
                  value.minimum_award > 0n
                    ? formatAmount(value.minimum_award, { asset: 'XLM' })
                    : 'None'
                }
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
                        <div className={`budget-note ${insufficient || belowMinimum ? 'budget-note--error' : 'budget-note--ok'}`}>
                          <div>
                            <span className="detail-label">Computed award (median)</span>
                            <span className="detail-value">{formatAmount(granted, { asset: 'XLM' })}</span>
                          </div>
                          <div>
                            <span className="detail-label">Remaining budget after award</span>
                            <span className="detail-value">{formatAmount(remainingAfter!, { asset: 'XLM' })}</span>
                          </div>
                          {minimumAward > 0n && (
                            <div>
                              <span className="detail-label">Programme minimum award</span>
                              <span className="detail-value">{formatAmount(minimumAward, { asset: 'XLM' })}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {insufficient && (
                        <p className="notice notice--blocked">
                          <AlertTriangle size={16} /> This award exceeds the remaining budget. Awards settle in the order they are finalised — first finalised, first funded.
                        </p>
                      )}

                      {belowMinimum && granted !== null && (
                        <div className="notice notice--blocked" role="alert">
                          <p style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={16} />
                            <strong>Award is below the programme minimum and cannot be finalised.</strong>
                          </p>
                          <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem' }}>
                            Median: <strong>{formatAmount(granted, { asset: 'XLM' })}</strong>
                            {' '}&mdash; Minimum: <strong>{formatAmount(minimumAward, { asset: 'XLM' })}</strong>
                            {' '}&mdash; Shortfall: <strong>{formatAmount(minimumAward - granted, { asset: 'XLM' })}</strong>
                          </p>
                          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                            The application is unchanged and stays finalisable — if reviewers add higher votes and the median rises above the minimum, this call will succeed.
                          </p>
                        </div>
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
                          disabled={!payeeReady || insufficient || belowMinimum || wallet.status !== 'connected'}
                          onClick={finalize}
                        >
                          Finalize award
                        </Button>
                        {!payeeReady && needsVerifiedPayee && (
                          <span className="hint">Select and verify a payee first.</span>
                        )}
                      </div>

                      {finalizeTx.error && (() => {
                        const err = finalizeTx.error;
                        // BelowMinimumAward (38) gets its own breakdown — the generic
                        // message is enough for every other error.
                        const isBelowMin = err.code === 38;
                        return (
                          <div
                            className={`notice ${err.kind === 'none' ? '' : 'notice--blocked'}`}
                          >
                            <p style={{ margin: 0, fontWeight: 600 }}>
                              {err.message}
                            </p>
                            {isBelowMin && granted !== null && minimumAward > 0n && (
                              <p style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.875rem' }}>
                                Median: <strong>{formatAmount(granted, { asset: 'XLM' })}</strong>
                                {' '}&mdash; Minimum: <strong>{formatAmount(minimumAward, { asset: 'XLM' })}</strong>
                                {' '}&mdash; Shortfall: <strong>{formatAmount(minimumAward - granted, { asset: 'XLM' })}</strong>
                              </p>
                            )}
                            {err.action && (
                              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                                {err.action}
                              </p>
                            )}
                          </div>
                        );
                      })()}

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
