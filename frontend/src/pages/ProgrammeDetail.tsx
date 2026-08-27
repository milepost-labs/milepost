import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Phase, ProgrammeConfig } from "@milepost/program";
import { CalendarClock, Landmark, ShieldCheck, UsersRound } from "lucide-react";
import { AsyncView } from "../components/state/AsyncStates";
import { Badge, Card, PhaseBadge, Stat, Table } from "../components/ui";
import { useContractRead, useContractResult, useProgramme } from "../hooks";
import { formatAmount, percentOf } from "../lib/amount";
import "./ProgrammeDetail.css";

const ZERO = 0n;
const REFRESH_INTERVAL_MS = 60_000;

interface ProgrammeFigures {
  budget: bigint;
  fee: bigint;
  totalContributed: bigint;
  totalGranted: bigint;
  totalReleased: bigint;
}

type DeadlineKey =
  | "apply_deadline"
  | "review_deadline"
  | "release_deadline"
  | "sweep_deadline";

interface TimelineStep {
  key: DeadlineKey;
  label: string;
  description: string;
}

const timelineSteps: TimelineStep[] = [
  {
    key: "apply_deadline",
    label: "Applications close",
    description: "Funding requests stop entering the review queue.",
  },
  {
    key: "review_deadline",
    label: "Reviews close",
    description: "Reviewer votes must be settled before this point.",
  },
  {
    key: "release_deadline",
    label: "Releases close",
    description: "Approved tranche releases stop here.",
  },
  {
    key: "sweep_deadline",
    label: "Sweep opens",
    description: "Unclaimed refunds can be swept to the treasury.",
  },
];

const maxBigint = (value: bigint, minimum: bigint) =>
  value > minimum ? value : minimum;
const minBigint = (value: bigint, maximum: bigint) =>
  value < maximum ? value : maximum;
const formatXlm = (amount: bigint) => formatAmount(amount, { asset: "XLM" });
const formatPercent = (value: number) => `${value.toFixed(2)}%`;
const formatAddress = (address: string) =>
  `${address.slice(0, 8)}...${address.slice(-8)}`;

function deadlineToMs(deadline: bigint | number): number {
  return Number(deadline) * 1000;
}

function formatDateTime(deadline: bigint | number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(deadlineToMs(deadline)));
}

function getRelativeDeadline(deadline: bigint | number, nowMs: number): string {
  const deltaMs = deadlineToMs(deadline) - nowMs;
  const past = deltaMs <= 0;
  const minutes = Math.max(0, Math.floor(Math.abs(deltaMs) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;

  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    days === 0 && mins > 0 ? `${mins}m` : null,
  ].filter(Boolean);

  const readable = parts.length > 0 ? parts.join(" ") : "less than 1m";
  return past ? `${readable} ago` : `${readable} remaining`;
}

function nextDeadline(
  config: ProgrammeConfig,
  nowMs: number,
): TimelineStep | null {
  return (
    timelineSteps.find((step) => deadlineToMs(config[step.key]) > nowMs) ?? null
  );
}

function formatFeeBps(feeBps: number): string {
  return `${(feeBps / 100).toFixed(2)}%`;
}

export const ProgrammeDetail = () => {
  const { id: programmeId, client: programme, isDefault } = useProgramme();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const config = useContractResult(() => programme.get_config(), [programme]);
  const phase = useContractResult(() => programme.get_phase(), [programme]);
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
  const refetchPhase = phase.refetch;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
      refetchPhase();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [refetchPhase]);

  const figures: ProgrammeFigures | null =
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

  const moneyLoading =
    budget.loading ||
    fee.loading ||
    contributed.loading ||
    granted.loading ||
    released.loading;
  const moneyError =
    budget.error ||
    fee.error ||
    contributed.error ||
    granted.error ||
    released.error;
  const refetchMoney = () => {
    budget.refetch();
    fee.refetch();
    contributed.refetch();
    granted.refetch();
    released.refetch();
  };

  const phaseName = phase.data?.tag ?? "Loading";
  const activeDeadline = config.data ? nextDeadline(config.data, nowMs) : null;
  const contributedLessFee = figures
    ? maxBigint(figures.totalContributed - figures.fee, ZERO)
    : ZERO;
  const grantedRemaining = figures
    ? maxBigint(figures.budget - figures.totalGranted, ZERO)
    : ZERO;
  const releasedRemaining = figures
    ? maxBigint(figures.totalGranted - figures.totalReleased, ZERO)
    : ZERO;
  const releasedSegment = figures
    ? minBigint(maxBigint(figures.totalReleased, ZERO), figures.budget)
    : ZERO;
  const grantedSegment = figures
    ? minBigint(
        maxBigint(figures.totalGranted - figures.totalReleased, ZERO),
        maxBigint(figures.budget - releasedSegment, ZERO),
      )
    : ZERO;
  const availableSegment = figures
    ? maxBigint(figures.budget - releasedSegment - grantedSegment, ZERO)
    : ZERO;

  const timelineRows = useMemo(() => {
    const programmeConfig = config.data;

    return programmeConfig
      ? timelineSteps.map((step) => {
          const deadline = programmeConfig[step.key];
          const status =
            deadlineToMs(deadline) <= nowMs ? "Passed" : "Upcoming";
          return {
            ...step,
            deadline,
            status,
            relative: getRelativeDeadline(deadline, nowMs),
          };
        })
      : [];
  }, [config.data, nowMs]);

  return (
    <div className="programme-detail">
      <header className="programme-hero glass-panel animate-fade-up">
        <div className="programme-hero__copy">
          <Badge tone="accent">Live testnet programme</Badge>
          <h1>Programme detail</h1>
          <p className="typo-text text-muted">
            A live read of the programme contract: phase, deadlines, funding,
            awards, releases, and governance metadata.
          </p>
          <p
            className="programme-id numeric"
            aria-label={`Programme contract ${programmeId}`}
          >
            {programmeId}
          </p>
          {isDefault && (
            <p className="programme-hero__hint">
              Showing the seeded demo programme. Add a contract id after{" "}
              <span className="numeric">/programme/</span> to inspect another
              programme.
            </p>
          )}
        </div>

        <div className="programme-hero__status">
          <AsyncView {...phase} onRetry={phase.refetch} contract="program">
            {(value: Phase) => <PhaseBadge phase={value.tag} />}
          </AsyncView>
          <AsyncView {...config} onRetry={config.refetch} contract="program">
            {(value: ProgrammeConfig) => {
              const upcoming = nextDeadline(value, nowMs);

              return upcoming ? (
                <div className="next-deadline">
                  <CalendarClock aria-hidden="true" />
                  <span>{upcoming.label}</span>
                  <strong>
                    {getRelativeDeadline(value[upcoming.key], nowMs)}
                  </strong>
                </div>
              ) : (
                <div className="next-deadline">
                  <CalendarClock aria-hidden="true" />
                  <span>Timeline complete</span>
                  <strong>No upcoming deadline</strong>
                </div>
              );
            }}
          </AsyncView>
        </div>
      </header>

      <section
        className="programme-stats animate-fade-up"
        aria-label="Programme funding summary"
      >
        <Card>
          <Stat
            label="Contributed"
            value={
              <AsyncView {...contributed} onRetry={contributed.refetch}>
                {(value) => formatXlm(value)}
              </AsyncView>
            }
            hint="Total committed to the programme"
            numeric
          />
        </Card>
        <Card>
          <Stat
            label="Budget"
            value={
              <AsyncView {...budget} onRetry={budget.refetch}>
                {(value) => formatXlm(value)}
              </AsyncView>
            }
            hint="Contributed less protocol fee"
            numeric
          />
        </Card>
        <Card>
          <Stat
            label="Granted"
            value={
              <AsyncView {...granted} onRetry={granted.refetch}>
                {(value) => formatXlm(value)}
              </AsyncView>
            }
            hint="Awards approved by reviewers"
            numeric
          />
        </Card>
        <Card>
          <Stat
            label="Released"
            value={
              <AsyncView {...released} onRetry={released.refetch}>
                {(value) => formatXlm(value)}
              </AsyncView>
            }
            hint="Tranches already paid out"
            numeric
          />
        </Card>
      </section>

      <section className="programme-grid animate-fade-up">
        <Card
          title="Money flow"
          aside={
            figures ? (
              <Badge tone="neutral">
                {formatPercent(percentOf(figures.totalGranted, figures.budget))}{" "}
                granted
              </Badge>
            ) : null
          }
        >
          <AsyncView
            data={figures}
            loading={moneyLoading}
            error={moneyError}
            onRetry={refetchMoney}
            contract="program"
          >
            {(value) => (
              <div className="money-flow">
                <div
                  className="money-equation"
                  aria-label="Contributed minus fee equals budget"
                >
                  <div>
                    <span>Contributed</span>
                    <strong className="numeric">
                      {formatXlm(value.totalContributed)}
                    </strong>
                  </div>
                  <span aria-hidden="true">-</span>
                  <div>
                    <span>Fee</span>
                    <strong className="numeric">{formatXlm(value.fee)}</strong>
                  </div>
                  <span aria-hidden="true">=</span>
                  <div>
                    <span>Budget</span>
                    <strong className="numeric">
                      {formatXlm(value.budget)}
                    </strong>
                  </div>
                </div>

                <div className="money-meter" aria-label="Budget usage">
                  <span
                    className="money-meter__released"
                    style={{
                      width: `${percentOf(releasedSegment, value.budget)}%`,
                    }}
                  />
                  <span
                    className="money-meter__granted"
                    style={{
                      width: `${percentOf(grantedSegment, value.budget)}%`,
                    }}
                  />
                  <span
                    className="money-meter__available"
                    style={{
                      width: `${percentOf(availableSegment, value.budget)}%`,
                    }}
                  />
                </div>

                <dl className="money-details">
                  <div>
                    <dt>Fee amount</dt>
                    <dd className="numeric">{formatXlm(value.fee)}</dd>
                  </div>
                  <div>
                    <dt>Fee percentage</dt>
                    <dd>
                      <AsyncView
                        {...config}
                        onRetry={config.refetch}
                        contract="program"
                      >
                        {(programmeConfig) =>
                          formatFeeBps(programmeConfig.fee_bps)
                        }
                      </AsyncView>
                    </dd>
                  </div>
                  <div>
                    <dt>Contributed less fee</dt>
                    <dd className="numeric">{formatXlm(contributedLessFee)}</dd>
                  </div>
                  <div>
                    <dt>Granted vs budget</dt>
                    <dd>
                      {formatPercent(
                        percentOf(value.totalGranted, value.budget),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Released vs granted</dt>
                    <dd>
                      {formatPercent(
                        percentOf(value.totalReleased, value.totalGranted),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Budget still ungranted</dt>
                    <dd className="numeric">{formatXlm(grantedRemaining)}</dd>
                  </div>
                  <div>
                    <dt>Granted, unreleased</dt>
                    <dd className="numeric">{formatXlm(releasedRemaining)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </AsyncView>
        </Card>

        <Card
          title="Timeline and phase"
          aside={phase.data ? <PhaseBadge phase={phaseName} /> : null}
        >
          <AsyncView {...config} onRetry={config.refetch} contract="program">
            {() => (
              <div className="timeline-panel">
                {activeDeadline ? (
                  <p className="timeline-summary">
                    Next deadline: <strong>{activeDeadline.label}</strong>,{" "}
                    {
                      timelineRows.find((row) => row.key === activeDeadline.key)
                        ?.relative
                    }
                    .
                  </p>
                ) : (
                  <p className="timeline-summary">
                    All configured deadlines have passed.
                  </p>
                )}
                <Table
                  caption="Programme timeline"
                  rows={timelineRows}
                  keyOf={(row) => row.key}
                  columns={[
                    {
                      key: "milestone",
                      header: "Milestone",
                      render: (row) => row.label,
                    },
                    {
                      key: "date",
                      header: "Date",
                      render: (row) => (
                        <span className="numeric">
                          {formatDateTime(row.deadline)}
                        </span>
                      ),
                    },
                    {
                      key: "time",
                      header: "Time",
                      render: (row) => row.relative,
                    },
                    {
                      key: "status",
                      header: "Status",
                      render: (row) => (
                        <Badge
                          tone={row.status === "Passed" ? "neutral" : "accent"}
                        >
                          {row.status}
                        </Badge>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </AsyncView>
        </Card>

        <Card title="Contract configuration">
          <AsyncView {...config} onRetry={config.refetch} contract="program">
            {(value) => (
              <dl className="config-list">
                <div>
                  <dt>Creator</dt>
                  <dd className="numeric" title={value.creator}>
                    {formatAddress(value.creator)}
                  </dd>
                </div>
                <div>
                  <dt>Treasury</dt>
                  <dd className="numeric" title={value.treasury}>
                    {formatAddress(value.treasury)}
                  </dd>
                </div>
                <div>
                  <dt>Token contract</dt>
                  <dd className="numeric" title={value.token}>
                    {formatAddress(value.token)}
                  </dd>
                </div>
                <div>
                  <dt>Quorum</dt>
                  <dd className="numeric">{value.quorum} reviewer votes</dd>
                </div>
                <div>
                  <dt>Tranches</dt>
                  <dd className="numeric">{value.tranches}</dd>
                </div>
                <div>
                  <dt>Metadata hash</dt>
                  <dd className="numeric">
                    {value.metadata_hash.toString("hex")}
                  </dd>
                </div>
              </dl>
            )}
          </AsyncView>
        </Card>

        <Card title="Reviewer and verifier sets">
          <AsyncView {...config} onRetry={config.refetch} contract="program">
            {(value) => (
              <div className="membership-grid">
                <div className="membership-card">
                  <UsersRound aria-hidden="true" />
                  <div>
                    <h3>Reviewers</h3>
                    <p>
                      The contract enforces reviewer membership with{" "}
                      <span className="numeric">is_reviewer(addr)</span>. This
                      binding does not expose an enumerable reviewer list, so
                      the page shows the live quorum instead.
                    </p>
                    <Badge tone="accent">{value.quorum} votes required</Badge>
                  </div>
                </div>
                <div className="membership-card">
                  <ShieldCheck aria-hidden="true" />
                  <div>
                    <h3>Verifiers</h3>
                    <p>
                      The contract enforces verifier membership with{" "}
                      <span className="numeric">is_verifier(addr)</span>. The
                      current program API confirms membership by address but
                      does not list every verifier.
                    </p>
                    <Badge tone="neutral">
                      {value.tranches} tranche schedule
                    </Badge>
                  </div>
                </div>
                <div className="membership-card membership-card--wide">
                  <Landmark aria-hidden="true" />
                  <div>
                    <h3>Linked infrastructure</h3>
                    <p>
                      Attestations, standing, policy, and treasury addresses are
                      read from <span className="numeric">get_config</span>.
                    </p>
                    <Link to="/funders" className="programme-link">
                      Back to funder dashboard
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </AsyncView>
        </Card>

        <Card title="Trusted verifiers and schema">
          <AsyncView {...config} onRetry={config.refetch} contract="program">
            {(value) => (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      marginBottom: "0.5rem",
                    }}
                  >
                    Programme Schema
                  </h3>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--color-muted)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Attestations must satisfy this schema to unlock tranches.
                    The schema is fixed at programme creation.
                  </p>
                  <div
                    style={{
                      padding: "0.75rem",
                      backgroundColor: "var(--color-surface)",
                      borderRadius: "var(--radius-md)",
                      fontFamily: "monospace",
                      fontSize: "0.875rem",
                      wordBreak: "break-all",
                    }}
                  >
                    {value.schema.toString("hex")}
                  </div>
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      marginBottom: "0.5rem",
                    }}
                  >
                    Verifier Roster
                  </h3>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--color-muted)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Only attestations signed by these trusted verifiers can
                    release funds. Recipients should know whose signature they
                    need to obtain.
                  </p>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      fontStyle: "italic",
                      color: "var(--color-muted)",
                    }}
                  >
                    Note: The programme contract stores verifiers in a set
                    without enumeration. This roster would be populated from
                    deployment records or an indexer. For demonstration,
                    verifier checking is available via{" "}
                    <span className="numeric">is_verifier(addr)</span>.
                  </p>
                </div>
              </div>
            )}
          </AsyncView>
        </Card>
      </section>
    </div>
  );
};
