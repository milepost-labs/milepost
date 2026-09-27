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
import { PausedBanner } from "../components/programme/PausedBanner";
import { ProgrammeParamNotice } from "../components/programme/ProgrammeParamNotice";

interface BudgetBreakdown {
  budget: bigint;
  fee: bigint;
  totalContributed: bigint;
  totalGranted: bigint;
  totalReleased: bigint;
  totalRefunded: bigint;
  totalSwept: bigint;
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
  const { client: programme, linkedProgramme, readsEnabled } = useProgramme();

  const config = useContractResult(() => programme.get_config(), [programme], { enabled: readsEnabled });
  const budget = useContractResult(() => programme.budget(), [programme], { enabled: readsEnabled });
  const fee = useContractResult(() => programme.fee(), [programme], { enabled: readsEnabled });
  const contributed = useContractRead(
    () => programme.total_contributed(),
    [programme],
    { enabled: readsEnabled },
  );
  const granted = useContractRead(() => programme.total_granted(), [programme], { enabled: readsEnabled });
  const released = useContractRead(
    () => programme.total_released(),
    [programme],
    { enabled: readsEnabled },
  );
  const refunded = useContractRead(
    () => programme.total_refunded(),
    [programme],
    { enabled: readsEnabled },
  );
  const swept = useContractRead(
    () => programme.total_swept(),
    [programme],
    { enabled: readsEnabled },
  );
  const phase = useContractResult(() => programme.get_phase(), [programme], { enabled: readsEnabled });

  const cancelTx = useTransaction({ contract: "program" });
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const paused = useContractRead(() => programme.is_paused(), [programme], { enabled: readsEnabled });
  const pauseTx = useTransaction({ contract: "program" });

  const isCreator = Boolean(
    walletAddress && config.data && walletAddress === config.data.creator,
  );
  const isCancelled = phase.data?.tag === "Cancelled";

  const breakdown: BudgetBreakdown | null =
    budget.data !== null &&
    fee.data !== null &&
    contributed.data !== null &&
    granted.data !== null &&
    released.data !== null &&
    refunded.data !== null &&
    swept.data !== null
      ? {
          budget: budget.data,
          fee: fee.data,
          totalContributed: contributed.data,
          totalGranted: granted.data,
          totalReleased: released.data,
          totalRefunded: refunded.data,
          totalSwept: swept.data,
        }
      : null;

  const breakdownLoading =
    budget.loading ||
    fee.loading ||
    contributed.loading ||
    granted.loading ||
    released.loading ||
    refunded.loading ||
    swept.loading;
  const breakdownError =
    budget.error ||
    fee.error ||
    contributed.error ||
    granted.error ||
    released.error ||
    refunded.error ||
    swept.error;
  const refetchBreakdown = () => {
    budget.refetch();
    fee.refetch();
    contributed.refetch();
    granted.refetch();
    released.refetch();
    refunded.refetch();
    swept.refetch();
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
  const stillHeld = breakdown
    ? maxBigint(
        breakdown.totalContributed -
          breakdown.totalReleased -
          breakdown.totalRefunded -
          breakdown.totalSwept,
        ZERO,
      )
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

  const handleTogglePause = async () => {
    const result = await pauseTx.send(async () => {
      const tx = paused.data ? await programme.unpause() : await programme.pause();
      return {
        signAndSend: async (options: Parameters<typeof tx.signAndSend>[0]) => {
          const sent = await tx.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });

    if (result !== null) {
      paused.refetch();
    }
  };

  const pauseErrorExplained = pauseTx.error ? explain(pauseTx.error, "program") : null;

  if (linkedProgramme.blocksProgramme) {
    return (
      <div className="dashboard-container">
        <ProgrammeParamNotice state={linkedProgramme} />
      </div>
    );
  }

  return (
    <div className="funding">
      <header className="funding__intro">
        <h1 className="funding__title">Funding</h1>
        <p className="funding__lede">
          Put money into a programme and follow it. It only moves when a verifier confirms a condition, and
          whatever isn’t awarded comes back to you.
        </p>
      </header>

      {!address ? (
        <section className="funding-signin" aria-labelledby="funding-signin-heading">
          <div className="funding-signin__copy">
            <h2 id="funding-signin-heading" className="funding-signin__title">
              Sign in to see your funding
            </h2>
            <p className="funding-signin__text">
              Sign in with the Freighter browser extension. Browsing programmes never needs it.
            </p>
            <div className="fund-actions">
              <button type="button" className="fund-button fund-button--primary" onClick={() => setSignInOpen(true)}>
                Sign in
              </button>
              <Link to="/directory" className="fund-button">
                Browse programmes
              </Link>
            </div>
          </div>
          <ul className="funding-signin__list" aria-label="What signing in shows">
            {SIGNED_OUT_PREVIEW.map((item) => (
              <li key={item.title} className="funding-signin__item">
                <span className="funding-signin__item-title">{item.title}</span>
                <span className="funding-signin__item-note">{item.note}</span>
              </li>
            ))}
          </ul>
          <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
        </section>
      ) : (
        <>
          <section className="funding-stats" aria-label="Your funding">
            <div className="funding-stat">
              <span className="funding-stat__label">You’ve contributed</span>
              <span className="funding-stat__value numeric">{formatUsdc(totals.contributed)}</span>
            </div>
            <div className="funding-stat">
              <span className="funding-stat__label">Programmes</span>
              <span className="funding-stat__value numeric">{totals.programmes}</span>
            </div>
            <div className="funding-stat">
              <span className="funding-stat__label">Refundable now</span>
              <span className="funding-stat__value funding-stat__value--refund numeric">
                {formatUsdc(totals.refundableNow)}
              </span>
            </div>
          </section>

          <div className="funding-grid">
            <ContributionList cards={cards} sampleIds={sampleIds} onRefunded={markRefunded} />
            <ContributeFlow
              programmes={programmes}
              linkedProgrammeId={params.get('programme')}
              balance={BigInt(FIXTURE_BALANCE)}
            />
          </div>

          <SeededProgrammeTools />
        </>
      )}
    </div>
  );
};
