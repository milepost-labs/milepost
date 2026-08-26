import './FunderDashboard.css';
import { TrendingUp, CheckCircle, Activity, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useContractRead, useContractResult, useProgramme } from '../hooks';
import { AsyncView } from '../components/state/AsyncStates';
import { PhaseBadge } from '../components/ui';
import { formatAmount, percentOf } from '../lib/amount';
import { RefundsAndSweepsSection } from '../components/funder/RefundsAndSweepsSection';

interface BudgetBreakdown {
  budget: bigint;
  fee: bigint;
  totalContributed: bigint;
  totalGranted: bigint;
  totalReleased: bigint;
}

const ZERO = 0n;

const maxBigint = (value: bigint, minimum: bigint) => value > minimum ? value : minimum;
const minBigint = (value: bigint, maximum: bigint) => value < maximum ? value : maximum;
const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });
const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export const FunderDashboard = () => {
  const { client: programme } = useProgramme();

  const budget = useContractResult(() => programme.budget(), [programme]);
  const fee = useContractResult(() => programme.fee(), [programme]);
  const contributed = useContractRead(() => programme.total_contributed(), [programme]);
  const granted = useContractRead(() => programme.total_granted(), [programme]);
  const released = useContractRead(() => programme.total_released(), [programme]);
  const phase = useContractResult(() => programme.get_phase(), [programme]);

  const breakdown: BudgetBreakdown | null =
    budget.data !== null &&
    fee.data !== null &&
    contributed.data !== null &&
    granted.data !== null &&
    released.data !== null
      ? {
          budget: budget.data,
          fee: fee.data,
          totalContributed: contributed.data,
          totalGranted: granted.data,
          totalReleased: released.data,
        }
      : null;

  const breakdownLoading = budget.loading || fee.loading || contributed.loading || granted.loading || released.loading;
  const breakdownError = budget.error || fee.error || contributed.error || granted.error || released.error;
  const refetchBreakdown = () => {
    budget.refetch();
    fee.refetch();
    contributed.refetch();
    granted.refetch();
    released.refetch();
  };

  const feePercent = breakdown ? percentOf(breakdown.fee, breakdown.totalContributed) : 0;
  const committedUnreleased = breakdown ? maxBigint(breakdown.totalGranted - breakdown.totalReleased, ZERO) : ZERO;
  const unallocatedBudget = breakdown ? maxBigint(breakdown.budget - breakdown.totalGranted, ZERO) : ZERO;

  const releasedSegment = breakdown ? minBigint(maxBigint(breakdown.totalReleased, ZERO), breakdown.budget) : ZERO;
  const committedSegment = breakdown ? minBigint(committedUnreleased, maxBigint(breakdown.budget - releasedSegment, ZERO)) : ZERO;
  const unallocatedSegment = breakdown ? maxBigint(breakdown.budget - releasedSegment - committedSegment, ZERO) : ZERO;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header animate-fade-up">
        <h1>Funder Dashboard</h1>
        <p className="typo-text text-muted">Manage your committed funds and track disbursement milestones.</p>
      </header>

      <section className="stats-grid animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><TrendingUp size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Net Budget (After Fees)</span>
            <span className="stat-value numeric">
              <AsyncView {...budget} onRetry={budget.refetch}>
                {(value) => formatXlm(value)}
              </AsyncView>
            </span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><Activity size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Contributed</span>
            <span className="stat-value numeric">
              <AsyncView {...contributed} onRetry={contributed.refetch}>
                {(value) => formatXlm(value)}
              </AsyncView>
            </span>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon"><CheckCircle size={24} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Released</span>
            <span className="stat-value numeric">
              <AsyncView {...released} onRetry={released.refetch}>
                {(value) => formatXlm(value)}
              </AsyncView>
            </span>
          </div>
        </div>
      </section>

      <section className="budget-panel glass-panel animate-fade-up" style={{ animationDelay: '200ms' }}>
        <div className="budget-panel-header">
          <div>
            <span className="stat-label">Programme funds</span>
            <h2>Budget and fee breakdown</h2>
          </div>
          <div className="budget-panel-icon">
            <WalletCards size={24} />
          </div>
        </div>

        <AsyncView
          data={breakdown}
          loading={breakdownLoading}
          error={breakdownError}
          onRetry={refetchBreakdown}
          contract="program"
        >
          {(figures) => (
            <>
              <div className="budget-equation" aria-label="Budget equals total contributed minus fee">
                <div>
                  <span className="budget-equation-label">Contributed</span>
                  <strong className="numeric">{formatXlm(figures.totalContributed)}</strong>
                </div>
                <span className="budget-equation-symbol">-</span>
                <div>
                  <span className="budget-equation-label">Fee</span>
                  <strong className="numeric">{formatXlm(figures.fee)}</strong>
                </div>
                <span className="budget-equation-symbol">=</span>
                <div>
                  <span className="budget-equation-label">Budget</span>
                  <strong className="numeric">{formatXlm(figures.budget)}</strong>
                </div>
              </div>

              <div className="budget-meter" aria-label="Budget allocation">
                <div
                  className="budget-meter-segment budget-meter-released"
                  style={{ width: `${percentOf(releasedSegment, figures.budget)}%` }}
                  title="Released"
                />
                <div
                  className="budget-meter-segment budget-meter-committed"
                  style={{ width: `${percentOf(committedSegment, figures.budget)}%` }}
                  title="Committed but unreleased"
                />
                <div
                  className="budget-meter-segment budget-meter-unallocated"
                  style={{ width: `${percentOf(unallocatedSegment, figures.budget)}%` }}
                  title="Unallocated budget"
                />
              </div>

              <div className="budget-breakdown-grid">
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-fee" />
                  <span className="budget-breakdown-label">Protocol fee</span>
                  <strong className="numeric">{formatXlm(figures.fee)} ({formatPercent(feePercent)})</strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-granted" />
                  <span className="budget-breakdown-label">Total granted</span>
                  <strong className="numeric">{formatXlm(figures.totalGranted)}</strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-released" />
                  <span className="budget-breakdown-label">Released</span>
                  <strong className="numeric">{formatXlm(figures.totalReleased)}</strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-committed" />
                  <span className="budget-breakdown-label">Committed, unpaid</span>
                  <strong className="numeric">{formatXlm(committedUnreleased)}</strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-unallocated" />
                  <span className="budget-breakdown-label">Unallocated budget</span>
                  <strong className="numeric">{formatXlm(unallocatedBudget)}</strong>
                </div>
              </div>
            </>
          )}
        </AsyncView>
      </section>

      <section className="programs-section animate-fade-up" style={{ animationDelay: '300ms' }}>
        <h2>Active Programs</h2>
        <div className="programs-grid">
          <div className="program-card glass-panel">
            <div className="program-header">
              <h3>CS Scholarship 2026 (Seeded)</h3>
              <AsyncView {...phase} onRetry={phase.refetch}>
                {(value) => <PhaseBadge phase={value.tag} />}
              </AsyncView>
            </div>
            <p className="typo-text text-muted">Supporting 50 undergraduate computer science students across Lagos.</p>

            <div className="progress-container">
              <div className="progress-labels">
                <span>Disbursement Progress</span>
                <span>40%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: '40%' }}></div>
              </div>
            </div>

            <div className="program-actions">
              <Link to="/programme" className="btn-secondary">View Details</Link>
              <button type="button" className="btn-primary">Commit More Funds</button>
            </div>
          </div>
        </div>
      </section>
      <div style={{ marginTop: '2rem' }}>
        <RefundsAndSweepsSection />
      </div>
    </div>
  );
};

