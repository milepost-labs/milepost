import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import type { ProgrammeConfig } from "@milepost/program";
import {
  FileText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AsyncView, ErrorState } from "../components/state/AsyncStates";
import { PausedBanner } from "../components/programme/PausedBanner";
import { ProgrammeHeader } from "../components/programme/ProgrammeHeader";
import { WhereTheMoneyIs } from "../components/programme/WhereTheMoneyIs";
import { ProgrammeTabs } from "../components/programme/ProgrammeTabs";
import { ProgrammeActivityPanel } from "../components/programme/ProgrammeActivity";
import { ProgrammeActions } from "../components/programme/ProgrammeActions";
import { DescriptionBand, MetadataPanel } from "../components/programme/ProgrammeDescription";
import { useProgrammeMetadata } from "../hooks/useProgrammeMetadata";
import { AddToCalendar, AddressChip, Badge, Card, Deadline, List, ListRow, Notice, PageHead, StatTile } from "../components/ui";
import { useSoroban } from "../context/useSoroban";
import { useContractRead, useContractResult, useIndexedList, useProgramme } from "../hooks";
import { useLedgerCloseTime } from "../hooks/useLedgerCloseTime";
import { fetchProgrammes } from "../lib/indexer";
import { directoryHref } from "../lib/programmeView";
import { formatAmount, percentOf } from "../lib/amount";
import { formatFigure, isSampleProgrammeId, programmeRouteState } from "../lib/programmeView";
import { registryVerificationCopy } from "../lib/registryVerification";
import { readFeeSwept } from "../lib/sweepActions";
import { FIXTURE_CHAIN } from "../fixtures/programmes";
import { fetchTokenName, parseTokenName } from "../lib/token";
import "./ProgrammeDetail.css";

const ZERO = 0n;
const REFRESH_INTERVAL_MS = 60_000;

interface ProgrammeFigures {
  budget: bigint;
  fee: bigint;
  totalContributed: bigint;
  totalGranted: bigint;
  totalReleased: bigint;
  totalRefunded?: bigint;
  totalSwept?: bigint;
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

/** The unit every amount on this page is labelled with. */
const ASSET_LABEL = "XLM";
const formatXlm = (amount: bigint) => formatAmount(amount, { asset: ASSET_LABEL });
const formatAddress = (address: string) =>
  `${address.slice(0, 8)}...${address.slice(-8)}`;

export function ProgrammeAssetRules({ tokenAddress }: { tokenAddress: string }) {
  const { rpcUrl } = useSoroban();
  const tokenRead = useContractRead(
    () => fetchTokenName(tokenAddress, rpcUrl),
    [tokenAddress, rpcUrl],
    { enabled: Boolean(tokenAddress) },
  );

  const assetInfo = useMemo(() => {
    if (!tokenRead.data) return null;
    return parseTokenName(tokenRead.data);
  }, [tokenRead.data]);

  return (
    <>
      <ListRow
        title="Asset"
        trailing={
          <>
            {tokenRead.loading && <span className="text-muted">Reading asset…</span>}
            {Boolean(tokenRead.error) && (
              <span className="text-muted">{formatAddress(tokenAddress)}</span>
            )}
            {assetInfo && (
              <span className="programme-asset-display">
                <span className="programme-asset-code">{assetInfo.code}</span>
                {assetInfo.issuer && (
                  <span className="programme-asset-issuer">
                    <span className="programme-asset-issuer-label text-muted">Issuer:</span>
                    <AddressChip
                      address={assetInfo.issuer}
                      showExplorerLink
                      copyLabel="Copy issuer address"
                    />
                  </span>
                )}
              </span>
            )}
          </>
        }
      />
      <ListRow
        title="Asset contract"
        trailing={
          <AddressChip
            address={tokenAddress}
            showExplorerLink
            copyLabel="Copy asset contract address"
          />
        }
      />
    </>
  );
}

function deadlineToMs(deadline: bigint | number): number {
  return Number(deadline) * 1000;
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


interface ProgrammeDetailBodyProps {
  programmeId: string;
  programme: ReturnType<typeof useProgramme>["client"];
  isDefault: boolean;
}

const ProgrammeDetailBody = ({ programmeId, programme, isDefault }: ProgrammeDetailBodyProps) => {
  const { registry } = useSoroban();
  const location = useLocation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isRegistered = useContractRead(
    () => registry.is_programme({ addr: programmeId }),
    [registry, programmeId],
  );

  const config = useContractResult(() => programme.get_config(), [programme]);
  // The creator's description, resolved once from the hash the programme committed to.
  const metadata = useProgrammeMetadata(config.data ? config.data.metadata_hash.toString("hex") : null);
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
  const refunded = useContractRead(
    () => programme.total_refunded(),
    [programme],
  );
  const swept = useContractRead(() => programme.total_swept(), [programme]);
  const refetchPhase = phase.refetch;

  // The contract has no getter for "fee already sent", so ask it what a
  // sweep would do now. Only once applications have closed: before that the
  // answer is always "not yet", for a different reason.
  const feeSweepOpen = phase.data !== null && phase.data.tag !== "Open";
  const feeSwept = useContractRead(
    async () => ({ result: await readFeeSwept(programme) }),
    [programme],
    { enabled: feeSweepOpen },
  );
  const refetchFeeSwept = feeSwept.refetch;

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

  const moneyLoading =
    budget.loading ||
    fee.loading ||
    contributed.loading ||
    granted.loading ||
    released.loading ||
    refunded.loading ||
    swept.loading;
  const moneyError =
    budget.error ||
    fee.error ||
    contributed.error ||
    granted.error ||
    released.error ||
    refunded.error ||
    swept.error;
  const refetchMoney = () => {
    budget.refetch();
    fee.refetch();
    contributed.refetch();
    granted.refetch();
    released.refetch();
    refunded.refetch();
    swept.refetch();
  };

  // Track when both core reads last settled together. Using state rather than
  // a ref so it drives a re-render when the chip's age label needs updating,
  // and updated via useEffect so the write happens outside of render.
  const [lastReadAt, setLastReadAt] = useState<number | null>(null);
  const coreFetching = phase.fetching || config.fetching;
  const coreReady = phase.data !== null && config.data !== null;

  useEffect(() => {
    if (!coreFetching && coreReady) {
      // This hook intentionally sets state inside an effect to record the
      // exact moment a fetch settles, which is only knowable in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastReadAt(Date.now());
    }
    // We deliberately depend only on coreFetching so this fires when a fetch
    // completes, not on every render. coreReady is stable once true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreFetching]);

  const handleRefetch = useCallback(() => {
    setLastReadAt(null);
    phase.refetch();
    config.refetch();
    refetchMoney();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.refetch, config.refetch]);

  const phaseName = phase.data?.tag ?? "Loading";
  const activeDeadline = config.data ? nextDeadline(config.data, nowMs) : null;

  // Name and created ledger come from the published index; the phase is read
  // on-chain and is never taken from the index or a sample.
  const indexRead = useIndexedList(() => fetchProgrammes(), []);
  const indexEntry = useMemo(
    () => (indexRead.data ?? []).find((entry) => entry.id === programmeId) ?? null,
    [indexRead.data, programmeId],
  );
  const createdLedger = indexEntry?.createdLedger ?? null;
  const ledgerCloseTime = useLedgerCloseTime(createdLedger);
  // Sample programmes live only in the fixtures: their planned mode is the
  // stand-in chain read, and the header tags it as sample data. A deployed
  // programme has no programme-level mode on-chain — the contracts pick one
  // per award at `finalize` — so it shows none rather than a guess.
  const isSample = isSampleProgrammeId(programmeId);
  const plannedMode = isSample ? (FIXTURE_CHAIN[programmeId]?.mode ?? null) : null;
  // The contract opens refunds on cancellation or once the release deadline
  // has passed; the money panel shows refundable funds only from then.
  const refundsOpen =
    phaseName === "Cancelled" ||
    (config.data !== null &&
      nowMs / 1000 >= Number(config.data.release_deadline));
  // Same rule as the money panel: once refunds open, whatever has not been
  // released, refunded or swept is refundable.
  const refundable =
    refundsOpen && figures
      ? figures.budget -
        figures.totalReleased -
        (figures.totalRefunded ?? ZERO) -
        (figures.totalSwept ?? ZERO)
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

  const asset = ASSET_LABEL;
  const deadlines = config.data
    ? {
        apply: Number(config.data.apply_deadline),
        review: Number(config.data.review_deadline),
        release: Number(config.data.release_deadline),
        sweep: Number(config.data.sweep_deadline),
      }
    : null;
  const registryCopy =
    isRegistered.data === null || isRegistered.data === undefined
      ? null
      : registryVerificationCopy(isRegistered.data);
  // A figure for a stat tile: the read, a dash when it failed, an ellipsis
  // while it is on its way. The money panel below carries the retry.
  const tileFigure = (read: { data: bigint | null; error: unknown }) =>
    read.data !== null ? formatFigure(read.data) : read.error ? '—' : '…';
  const tileUnit = (read: { data: bigint | null }) => (read.data !== null ? asset : undefined);

  return (
    <div className="programme-detail">
      <ProgrammeHeader
        id={programmeId}
        name={indexEntry?.name ?? "Programme detail"}
        creator={config.data?.creator ?? null}
        createdLedger={indexEntry?.createdLedger ?? null}
        createdAt={ledgerCloseTime.data?.closeTime ?? null}
        createdAtIsEstimate={ledgerCloseTime.data?.isEstimate ?? false}
        phase={phase.data?.tag ?? null}
        phaseError={Boolean(phase.error)}
        verified={isRegistered.data ?? undefined}
        backTo={directoryHref(location.search)}
        mode={plannedMode}
        sample={isSample}
        deadlines={deadlines}
        nowMs={nowMs}
        lastReadAt={lastReadAt}
        onRefetch={handleRefetch}
        action={
          /* A sample programme's dates are made up; they do not belong in
             anyone's calendar. */
          !isSample && timelineRows.length > 0 ? (
            <AddToCalendar
              programmeName={indexEntry?.name ?? programmeId}
              programmeUrl={`${window.location.origin}/programme/${encodeURIComponent(programmeId)}`}
              deadlines={timelineRows.map((row) => ({
                key: row.key,
                label: row.label,
                unixSeconds: row.deadline,
              }))}
              nowMs={nowMs}
            />
          ) : null
        }
      />

      {metadata?.status === "ok" && <DescriptionBand doc={metadata.doc} />}

      <PausedBanner client={programme} />

      {Boolean(isRegistered.error) && (
        <ErrorState error={isRegistered.error} contract="registry" onRetry={isRegistered.refetch} />
      )}

      {isDefault && (
        <Notice tone="info" className="programme-detail__hint">
          Showing the seeded demo programme. Add a contract id after{" "}
          <span className="numeric">/programme/</span> to inspect another
          programme.
        </Notice>
      )}

      <section
        className="ui-stat-tiles programme-stats"
        aria-label="Programme funding summary"
      >
        <StatTile
          label="Contributed"
          value={tileFigure(contributed)}
          unit={tileUnit(contributed)}
          hint={
            config.data
              ? `${config.data.fee_bps / 100}% protocol fee`
              : "Put in by funders"
          }
        />
        <StatTile
          label="Budget"
          value={tileFigure(budget)}
          unit={tileUnit(budget)}
          hint="Contributed, less the fee"
        />
        <StatTile
          label="Awarded"
          value={tileFigure(granted)}
          unit={tileUnit(granted)}
          hint={
            granted.data !== null && budget.data !== null && budget.data > ZERO
              ? `${Math.round(percentOf(granted.data, budget.data))}% of budget`
              : "Set by the reviewers’ votes"
          }
        />
        <StatTile
          label="Released"
          value={tileFigure(released)}
          unit={tileUnit(released)}
          hint={
            config.data
              ? `${config.data.tranches} ${config.data.tranches === 1 ? "tranche" : "tranches"} per award`
              : "Paid out at mileposts"
          }
          highlight
        />
      </section>

      <div className="programme-cols">
        <div className="programme-cols__main">
          <AsyncView
            data={figures}
            loading={moneyLoading}
            error={moneyError}
            onRetry={refetchMoney}
            contract="program"
          >
            {(value) => (
              <WhereTheMoneyIs
                contributed={value.totalContributed}
                fee={value.fee}
                granted={value.totalGranted}
                released={value.totalReleased}
                refunded={value.totalRefunded ?? ZERO}
                swept={value.totalSwept ?? ZERO}
                refundsOpen={refundsOpen}
                feeBps={config.data?.fee_bps}
                quorum={config.data?.quorum ?? 1}
                asset={asset}
              />
            )}
          </AsyncView>

          <ProgrammeTabs
            programmeId={programmeId}
            phase={phaseName}
            quorum={config.data?.quorum ?? 1}
            minimumAward={config.data?.minimum_award ?? 0n}
            isSample={isSample}
            asset={asset}
            labels={metadata?.status === "ok" ? metadata.doc.labels : undefined}
          />

          <ProgrammeActivityPanel programmeId={programmeId} isSample={isSample} />
        </div>

        <div className="programme-cols__side">
          <ProgrammeActions
            programmeId={programmeId}
            phase={phase.data?.tag ?? null}
            refundsOpen={refundsOpen}
            refundable={refundable > ZERO ? formatXlm(refundable) : null}
            verified={isRegistered.error ? false : isRegistered.data}
            sweep={{
              fee: fee.data,
              treasury: config.data?.treasury ?? null,
              // Pending until the check has answered; a failed check counts as
              // "not sent", because the sheet simulates before anything is
              // signed and explains the contract's own refusal.
              feeSwept: !feeSweepOpen
                ? false
                : feeSwept.data !== null
                  ? feeSwept.data
                  : feeSwept.error
                    ? false
                    : null,
              asset,
              sample: isSample,
              onChanged: () => {
                refetchFeeSwept();
                refetchMoney();
              },
            }}
          />

          <section className="programme-timeline" aria-labelledby="programme-timeline-title">
            <h2 id="programme-timeline-title" className="programme-timeline__title">
              Timeline
            </h2>
            <AsyncView {...config} onRetry={config.refetch} contract="program">
              {() => (
                <>
                  <p className="programme-timeline__summary">
                    {activeDeadline ? (
                      <>
                        Next deadline: <strong>{activeDeadline.label}</strong>,{" "}
                        {
                          timelineRows.find((row) => row.key === activeDeadline.key)
                            ?.relative
                        }
                        .
                      </>
                    ) : (
                      "All configured deadlines have passed."
                    )}
                  </p>
                  <ol className="programme-timeline__list" aria-label="Programme timeline">
                    {timelineRows.map((row) => (
                      <li
                        key={row.key}
                        className={`programme-timeline__item${
                          row.status === "Passed" ? " programme-timeline__item--passed" : ""
                        }`}
                      >
                        <span className="programme-timeline__label">
                          {row.label}
                          <span className="programme-timeline__status">{row.status}</span>
                        </span>
                        <Deadline unixSeconds={row.deadline} />
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </AsyncView>
          </section>
        </div>
      </div>

      <section className="programme-chain" aria-labelledby="programme-chain-title">
        <div className="programme-chain__head">
          <h2 id="programme-chain-title" className="programme-chain__title">
            On the chain
          </h2>
          <p className="programme-chain__lead">
            What the programme was deployed with, read from its contract.
          </p>
        </div>

        <div className="programme-chain__grid">
          <Card title="Programme rules">
            <AsyncView {...config} onRetry={config.refetch} contract="program">
              {(value) => (
                <List className="programme-rules" label="Programme rules">
                  <ListRow
                    title="Creator"
                    trailing={
                      <AddressChip
                        address={value.creator}
                        showExplorerLink
                        copyLabel="Copy creator address"
                      />
                    }
                  />
                  <ListRow
                    title="Treasury"
                    trailing={
                      <AddressChip
                        address={value.treasury}
                        showExplorerLink
                        copyLabel="Copy treasury address"
                      />
                    }
                  />
                  <ProgrammeAssetRules tokenAddress={value.token} />
                  <ListRow
                    title="Reviewer votes needed"
                    trailing={
                      <span className="numeric">{value.quorum} reviewer votes</span>
                    }
                  />
                  <ListRow
                    title="Tranches"
                    trailing={<span className="numeric">{value.tranches}</span>}
                  />
                  <ListRow
                    title="Metadata hash"
                    meta={
                      <span className="numeric programme-wrap">
                        {value.metadata_hash.toString("hex")}
                      </span>
                    }
                  />
                  {registryCopy && (
                    <ListRow title="Deployment" meta={registryCopy.description} />
                  )}
                </List>
              )}
            </AsyncView>
          </Card>

          <Card title="Description">
            <AsyncView {...config} onRetry={config.refetch} contract="program">
              {(value) => (
                <MetadataPanel committedHash={value.metadata_hash.toString("hex")} resolved={metadata} />
              )}
            </AsyncView>
          </Card>

          <Card className="programme-chain__wide" title="Reviewers, verifiers and schema">
            <AsyncView {...config} onRetry={config.refetch} contract="program">
              {(value) => (
                <List className="programme-access" label="Reviewers, verifiers and schema">
                  <ListRow
                    leading={<UsersRound aria-hidden="true" />}
                    title="Reviewers"
                    meta="Reviewers set the amounts. The programme knows each reviewer by address and keeps no list of them, so this page shows how many votes an award needs. Check an address under the Verifiers tab."
                    trailing={<Badge tone="accent">{value.quorum} votes required</Badge>}
                  />
                  <ListRow
                    leading={<ShieldCheck aria-hidden="true" />}
                    title="Verifiers"
                    meta="Verifiers unlock payments; they do not set amounts. Only a confirmation signed by one of this programme’s verifiers can release a tranche, so a recipient should know whose signature they need. The programme keeps no list of them either; the roster will come from the public index."
                    trailing={<Badge tone="neutral">{value.tranches} tranches</Badge>}
                  />
                  <ListRow
                    leading={<FileText aria-hidden="true" />}
                    title="Schema"
                    meta={
                      <>
                        A schema defines what verifiers are allowed to confirm. An attestation must match it before a tranche can release.
                        <span className="numeric programme-wrap">
                          {value.schema.toString("hex")}
                        </span>
                      </>
                    }
                  />
                </List>
              )}
            </AsyncView>
          </Card>
        </div>
      </section>
    </div>
  );
};

/**
 * A sample programme has no contract and no mainnet presence. Without samples,
 * its address is not a programme on this network, so say that rather than
 * reading a made-up contract and showing a wall of failed reads.
 */
export const ProgrammeDetail = () => {
  const { id, client, isDefault } = useProgramme();
  const routeState = programmeRouteState(id);

  if (routeState === 'directory' || id === null) return <Navigate to="/directory" replace />;

  if (routeState === 'not-a-programme') {
    return (
      <div className="programme-detail">
        <PageHead eyebrow="Programmes" title="Not a programme on this network">
          <p>This address belongs to a sample programme, and samples exist only on testnet.</p>
        </PageHead>
        <Notice tone="info">
          <Link to="/directory">Back to the programme directory</Link>
        </Notice>
      </div>
    );
  }

  return <ProgrammeDetailBody programmeId={id} programme={client} isDefault={isDefault} />;
};
