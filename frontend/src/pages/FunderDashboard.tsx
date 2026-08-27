import { useState } from "react";
import "./FunderDashboard.css";
import {
  TrendingUp,
  CheckCircle,
  Activity,
  WalletCards,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  useContractRead,
  useContractResult,
  useProgramme,
  useTransaction,
  phaseLabel,
} from "../hooks";
import { useWallet } from "../context/useWallet";
import { AsyncView } from "../components/state/AsyncStates";
import { Button, Card, Modal, PhaseBadge } from "../components/ui";
import { formatAmount, percentOf } from "../lib/amount";
import { explain } from "../lib/errors";
import { RefundsAndSweepsSection } from "../components/funder/RefundsAndSweepsSection";
import { DonorContributionReceipt } from "../components/funder/DonorContributionReceipt";

interface BudgetBreakdown {
  budget: bigint;
  fee: bigint;
  totalContributed: bigint;
  totalGranted: bigint;
  totalReleased: bigint;
}

const ZERO = 0n;

const maxBigint = (value: bigint, minimum: bigint) =>
  value > minimum ? value : minimum;
const minBigint = (value: bigint, maximum: bigint) =>
  value < maximum ? value : maximum;
const formatXlm = (amount: bigint) => formatAmount(amount, { asset: "XLM" });
const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export const FunderDashboard = () => {
  const { address: walletAddress } = useWallet();
  const { client: programme } = useProgramme();

  const config = useContractResult(() => programme.get_config(), [programme]);
  const budget = useContractResult(() => programme.budget(), [programme]);
  const fee = useContractResult(() => programme.fee(), [programme]);
  const contributed = useContractRead(
    () => programme.total_contributed(),
    [programme],
  );
  const granted = useContractRead(() => programme.total_granted(), [programme]);
  const released = useContractRead(
    () => programme.total_released(),
    [programme],
  );
  const phase = useContractResult(() => programme.get_phase(), [programme]);

  const cancelTx = useTransaction({ contract: "program" });
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const isCreator = Boolean(
    walletAddress && config.data && walletAddress === config.data.creator,
  );
  const isCancelled = phase.data?.tag === "Cancelled";

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

  const breakdownLoading =
    budget.loading ||
    fee.loading ||
    contributed.loading ||
    granted.loading ||
    released.loading;
  const breakdownError =
    budget.error ||
    fee.error ||
    contributed.error ||
    granted.error ||
    released.error;
  const refetchBreakdown = () => {
    budget.refetch();
    fee.refetch();
    contributed.refetch();
    granted.refetch();
    released.refetch();
  };

  const feePercent = breakdown
    ? percentOf(breakdown.fee, breakdown.totalContributed)
    : 0;
  const committedUnreleased = breakdown
    ? maxBigint(breakdown.totalGranted - breakdown.totalReleased, ZERO)
    : ZERO;
  const unallocatedBudget = breakdown
    ? maxBigint(breakdown.budget - breakdown.totalGranted, ZERO)
    : ZERO;

  const releasedSegment = breakdown
    ? minBigint(maxBigint(breakdown.totalReleased, ZERO), breakdown.budget)
    : ZERO;
  const committedSegment = breakdown
    ? minBigint(
        committedUnreleased,
        maxBigint(breakdown.budget - releasedSegment, ZERO),
      )
    : ZERO;
  const unallocatedSegment = breakdown
    ? maxBigint(breakdown.budget - releasedSegment - committedSegment, ZERO)
    : ZERO;

  const handleCancelConfirm = async () => {
    const result = await cancelTx.send(async () => {
      const tx = await programme.cancel();
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      setCancelModalOpen(false);
      phase.refetch();
      config.refetch();
    }
  };

  const cancelErrorExplained = cancelTx.error
    ? explain(cancelTx.error, "program")
    : null;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header animate-fade-up">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1>Funder Dashboard</h1>
            <p className="typo-text text-muted">
              Manage your committed funds and track disbursement milestones.
            </p>
          </div>
          {isCreator && !isCancelled && (
            <Button
              variant="secondary"
              style={{
                color: "var(--color-error)",
                borderColor: "var(--color-error)",
              }}
              onClick={() => setCancelModalOpen(true)}
            >
              Cancel programme
            </Button>
          )}
        </div>
      </header>

      {isCancelled && (
        <Card className="cancelled-banner">
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <AlertTriangle style={{ color: "var(--color-error)" }} size={24} />
            <div>
              <h3 style={{ margin: 0, color: "var(--color-error)" }}>
                Programme Cancelled
              </h3>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
                This programme has been cancelled by its creator. No further
                contributions or awards can be made. Donors can claim refunds
                below.
              </p>
            </div>
          </div>
        </Card>
      )}

      <section
        className="stats-grid animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        <div className="stat-card glass-panel">
          <div className="stat-icon">
            <TrendingUp size={24} />
          </div>
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
          <div className="stat-icon">
            <Activity size={24} />
          </div>
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
          <div className="stat-icon">
            <CheckCircle size={24} />
          </div>
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

      <section
        className="budget-panel glass-panel animate-fade-up"
        style={{ animationDelay: "200ms" }}
      >
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
              <div
                className="budget-equation"
                aria-label="Budget equals total contributed minus fee"
              >
                <div>
                  <span className="budget-equation-label">Contributed</span>
                  <strong className="numeric">
                    {formatXlm(figures.totalContributed)}
                  </strong>
                </div>
                <span className="budget-equation-symbol">-</span>
                <div>
                  <span className="budget-equation-label">Fee</span>
                  <strong className="numeric">{formatXlm(figures.fee)}</strong>
                </div>
                <span className="budget-equation-symbol">=</span>
                <div>
                  <span className="budget-equation-label">Budget</span>
                  <strong className="numeric">
                    {formatXlm(figures.budget)}
                  </strong>
                </div>
              </div>

              <div className="budget-meter" aria-label="Budget allocation">
                <div
                  className="budget-meter-segment budget-meter-released"
                  style={{
                    width: `${percentOf(releasedSegment, figures.budget)}%`,
                  }}
                  title="Released"
                />
                <div
                  className="budget-meter-segment budget-meter-committed"
                  style={{
                    width: `${percentOf(committedSegment, figures.budget)}%`,
                  }}
                  title="Committed but unreleased"
                />
                <div
                  className="budget-meter-segment budget-meter-unallocated"
                  style={{
                    width: `${percentOf(unallocatedSegment, figures.budget)}%`,
                  }}
                  title="Unallocated budget"
                />
              </div>

              <div className="budget-breakdown-grid">
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-fee" />
                  <span className="budget-breakdown-label">Protocol fee</span>
                  <strong className="numeric">
                    {formatXlm(figures.fee)} ({formatPercent(feePercent)})
                  </strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-granted" />
                  <span className="budget-breakdown-label">Total granted</span>
                  <strong className="numeric">
                    {formatXlm(figures.totalGranted)}
                  </strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-released" />
                  <span className="budget-breakdown-label">Released</span>
                  <strong className="numeric">
                    {formatXlm(figures.totalReleased)}
                  </strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-committed" />
                  <span className="budget-breakdown-label">
                    Committed, unpaid
                  </span>
                  <strong className="numeric">
                    {formatXlm(committedUnreleased)}
                  </strong>
                </div>
                <div className="budget-breakdown-item">
                  <span className="budget-swatch budget-swatch-unallocated" />
                  <span className="budget-breakdown-label">
                    Unallocated budget
                  </span>
                  <strong className="numeric">
                    {formatXlm(unallocatedBudget)}
                  </strong>
                </div>
              </div>
            </>
          )}
        </AsyncView>
      </section>

      <section
        className="programs-section animate-fade-up"
        style={{ animationDelay: "300ms" }}
      >
        <h2>Active Programs</h2>
        <div className="programs-grid">
          <div className="program-card glass-panel">
            <div className="program-header">
              <h3>CS Scholarship 2026 (Seeded)</h3>
              <AsyncView {...phase} onRetry={phase.refetch}>
                {(value) => <PhaseBadge phase={value.tag} />}
              </AsyncView>
            </div>
            <p className="typo-text text-muted">
              Supporting 50 undergraduate computer science students across
              Lagos.
            </p>

            <div className="progress-container">
              <div className="progress-labels">
                <span>Disbursement Progress</span>
                <span>40%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: "40%" }}></div>
              </div>
            </div>

            <div className="program-actions">
              <Link to="/programme" className="btn-secondary">
                View Details
              </Link>
              {!isCancelled && (
                <button type="button" className="btn-primary">
                  Commit More Funds
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div
        style={{
          marginTop: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <DonorContributionReceipt />
        <RefundsAndSweepsSection />
      </div>

      <Modal
        open={cancelModalOpen}
        onClose={() => !cancelTx.busy && setCancelModalOpen(false)}
        title="Cancel programme"
        busy={cancelTx.busy}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCancelModalOpen(false)}
              disabled={cancelTx.busy}
            >
              Back
            </Button>
            <Button
              style={{ backgroundColor: "var(--color-error)", color: "#fff" }}
              onClick={handleCancelConfirm}
              loading={cancelTx.busy}
              loadingLabel={phaseLabel(cancelTx.phase) || "Cancelling…"}
            >
              Confirm cancel programme
            </Button>
          </>
        }
      >
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <p
            style={{ margin: 0, fontWeight: 600, color: "var(--color-error)" }}
          >
            Are you sure you want to cancel this programme?
          </p>
          <p className="typo-text text-muted" style={{ margin: 0 }}>
            Cancelling is permanent. Contributed funds will be available for
            donors to reclaim via the refund path. Submitted applications will
            not be reviewed or awarded. A programme can only be cancelled while
            no funds are contributed and no awards have been granted.
          </p>

          {cancelErrorExplained && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--color-error)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  color: "var(--color-error)",
                }}
              >
                {cancelErrorExplained.message}
              </p>
              {cancelErrorExplained.action && (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.875rem",
                    color: "var(--color-muted)",
                  }}
                >
                  {cancelErrorExplained.action}
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
