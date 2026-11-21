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
import { AddToCalendar, AddressChip, Badge, Card, Deadline, List, ListRow, Notice, PageHead, SampleTag, StatTile } from "../components/ui";
import { useSoroban } from "../context/useSoroban";
import { useContractRead, useContractResult, useIndexedList, useProgramme } from "../hooks";
import { useLedgerCloseTime } from "../hooks/useLedgerCloseTime";
import { fetchProgrammes } from "../lib/indexer";
import { directoryHref } from "../lib/programmeView";
import { formatAmount, percentOf } from "../lib/amount";
import { formatFigure, isSampleProgrammeId, programmeAsset, programmeRouteState } from "../lib/programmeView";
import { registryVerificationCopy } from "../lib/registryVerification";
import { FIXTURE_PROGRAMMES, chainFor } from "../fixtures/programmes";
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

  // A sample programme has no contract behind it: every read below is gated
  // off and the page is filled from the fixture set instead, tagged Sample
  // data. This is decided before the reads so their `enabled` flags can use it.
  const isSample = isSampleProgrammeId(programmeId);

  const isRegistered = useContractRead(
    () => registry.is_programme({ addr: programmeId }),
    [registry, programmeId],
    { enabled: !isSample },
  );

  const config = useContractResult(() => programme.get_config(), [programme], {
    enabled: !isSample,
  });
  // The creator's description, resolved once from the hash the programme committed to.
  const metadata = useProgrammeMetadata(
    !isSample && config.data ? config.data.metadata_hash.toString("hex") : null,
  );
  const phase = useContractResult(() => programme.get_phase(), [programme], {
    enabled: !isSample,
  });
  const budget = useContractResult(() => programme.budget(), [programme], {
    enabled: !isSample,
  });
  const fee = useContractResult(() => programme.fee(), [programme], {
    enabled: !isSample,
  });
  const contributed = useContractRead(
    () => programme.total_contributed(),
    [programme],
    { enabled: !isSample },
  );
  const granted = useContractRead(() => programme.total_granted(), [programme], {
    enabled: !isSample,
  });
  const released = useContractRead(
    () => programme.total_released(),
    [programme],
    { enabled: !isSample },
  );
  const refunded = useContractRead(
    () => programme.total_refunded(),
    [programme],
    { enabled: !isSample },
  );
  const swept = useContractRead(() => programme.total_swept(), [programme], {
    enabled: !isSample,
  });
  const refetchPhase = phase.refetch;

  useEffect(() => {
    if (isSample) return; // Nothing to re-read for a sample.
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
      refetchPhase();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [refetchPhase, isSample]);

  // ── The sample stand-in world ─────────────────────────────────────────────
  // FIXTURE_* values may appear only for sample programme ids, and every
  // figure rendered from them sits under the page's Sample data tag.
  const sampleEntry = useMemo(
    () => (isSample ? FIXTURE_PROGRAMMES.find((p) => p.id === programmeId) ?? null : null),
    [isSample, programmeId],
  );
  const sampleChain = useMemo(
    () => (isSample ? chainFor(programmeId) : null),
    [isSample, programmeId],
  );

  /** Deadline offsets per phase, in days relative to now: apply, review, release, sweep. */
  const SAMPLE_DEADLINE_OFFSETS: Record<string, [number, number, number, number]> = {
    Open: [9, 21, 45, 90],
    Review: [-3, 10, 40, 120],
    Settled: [-60, -40, -10, 20],
    Cancelled: [-60, -40, -10, -1],
  };
  const DAY = 86_400;

  const sampleConfig: ProgrammeConfig | null = useMemo(() => {
    if (!isSample || !sampleChain || !sampleEntry) return null;
    const [apply, review, release, sweep] =
      SAMPLE_DEADLINE_OFFSETS[sampleChain.phase] ?? SAMPLE_DEADLINE_OFFSETS.Settled;
    const nowS = BigInt(Math.floor(nowMs / 1000));
    const at = (days: number) => nowS + BigInt(days * DAY);
    return {
      apply_deadline: at(apply),
      review_deadline: at(review),
      release_deadline: at(release),
      sweep_deadline: at(sweep),
      attest: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMLo",
      creator: sampleEntry.creator ?? "",
      fee_bps: 100,
      metadata_hash: Buffer.alloc(32, 0xab),
      minimum_award: 0n,
      policy: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMLo",
      quorum: sampleChain.quorum,
      record: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMLo",
      schema: Buffer.alloc(32, 0xcd),
      token: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMLo",
      tranches: 3,
      treasury: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMLo",
    };
    // Deadlines are anchored to the page's clock; recomputing per tick keeps
    // the phase bar honest as time passes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSample, sampleChain, sampleEntry, nowMs]);

  const sampleFigures: ProgrammeFigures | null = useMemo(() => {
    if (!isSample || !sampleChain) return null;
    const contributedStroops = BigInt(sampleChain.contributed);
    const feeStroops = BigInt(sampleChain.fee);
    return {
      budget: contributedStroops - feeStroops,
      fee: feeStroops,
      totalContributed: contributedStroops,
      totalGranted: BigInt(sampleChain.awarded),
      totalReleased: BigInt(sampleChain.released),
      totalRefunded: 0n,
      totalSwept: 0n,
    };
  }, [isSample, sampleChain]);

  // ── Real-or-sample selectors ─────────────────────────────────────────────
  const configData = isSample ? sampleConfig : config.data;
  const phaseTag: string | null = isSample ? (sampleChain?.phase ?? null) : (phase.data?.tag ?? null);
  const figures: ProgrammeFigures | null = isSample ? sampleFigures : (
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
      : null
  );

  const moneyLoading = isSample ? false : (
    budget.loading ||
    fee.loading ||
    contributed.loading ||
    granted.loading ||
    released.loading ||
    refunded.loading ||
    swept.loading
  );
  const moneyError = isSample ? null : (
    budget.error ||
    fee.error ||
    contributed.error ||
    granted.error ||
    released.error ||
    refunded.error ||
    swept.error
  );
  const refetchMoney = () => {
    if (isSample) return;
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
  const coreFetching = isSample ? false : (phase.fetching || config.fetching);
  const coreReady = isSample ? false : (phase.data !== null && config.data !== null);

  useEffect(() => {
    if (isSample) return; // A sample never read anything; the chip stays hidden.
    if (!coreFetching && coreReady) {
      // This hook intentionally sets state inside an effect to record the
      // exact moment a fetch settles, which is only knowable in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastReadAt(Date.now());
    }
    // We deliberately depend only on coreFetching so this fires when a fetch
    // completes, not on every render. coreReady is stable once true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreFetching, isSample]);

  const handleRefetch = useCallback(() => {
    if (isSample) return;
    setLastReadAt(null);
    phase.refetch();
    config.refetch();
    refetchMoney();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.refetch, config.refetch, isSample]);

  const phaseName = phaseTag ?? "Loading";
  const activeDeadline = configData ? nextDeadline(configData, nowMs) : null;

  // Name and created ledger come from the published index for real
  // programmes; samples are named only by the fixture set. The phase is read
  // on-chain for real programmes and never taken from the index or a sample.
  const indexRead = useIndexedList(() => fetchProgrammes(), []);
  const indexEntry = useMemo(
    () => (indexRead.data ?? []).find((entry) => entry.id === programmeId) ?? null,
    [indexRead.data, programmeId],
  );
  const displayName = isSample
    ? (sampleEntry?.name ?? "Programme detail")
    : (indexEntry?.name ?? "Programme detail");
  const createdLedger = isSample
    ? (sampleEntry?.createdLedger ?? null)
    : (indexEntry?.createdLedger ?? null);
  const ledgerCloseTime = useLedgerCloseTime(isSample ? null : createdLedger);
  // Sample programmes live only in the fixtures: their planned mode is the
  // stand-in chain read, and the header tags it as sample data. A deployed
  // programme has no programme-level mode on-chain — the contracts pick one
  // per award at `finalize` — so it shows none rather than a guess.
  const plannedMode = isSample ? (sampleChain?.mode ?? null) : null;
  // The contract opens refunds on cancellation or once the release deadline
  // has passed; the money panel shows refundable funds only from then.
  const refundsOpen =
    phaseName === "Cancelled" ||
    (configData !== null &&
      nowMs / 1000 >= Number(configData.release_deadline));
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
    const programmeConfig = configData;

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
  }, [configData, nowMs]);

  // Sample programmes pay in the sample asset; real ones in XLM for now.
  const asset = isSample ? programmeAsset({ sample: true }) : ASSET_LABEL;
  const deadlines = configData
    ? {
        apply: Number(configData.apply_deadline),
        review: Number(configData.review_deadline),
        release: Number(configData.release_deadline),
        sweep: Number(configData.sweep_deadline),
      }
    : null;
  const registryCopy =
    isSample || isRegistered.data === null || isRegistered.data === undefined
      ? null
      : registryVerificationCopy(isRegistered.data);
  // A figure for a stat tile: the read, a dash when it failed, an ellipsis
  // while it is on its way. The money panel below carries the retry.
  const tileFigure = (value: bigint | null, error: unknown) =>
    value !== null ? formatFigure(value) : error ? '—' : '…';
  const tileUnit = (value: bigint | null) => (value !== null ? asset : undefined);

  // The stat tiles' per-read values, sample-aware in one place.
  const tile = {
    contributed: isSample ? (sampleFigures?.totalContributed ?? null) : contributed.data,
    budget: isSample ? (sampleFigures?.budget ?? null) : budget.data,
    granted: isSample ? (sampleFigures?.totalGranted ?? null) : granted.data,
    released: isSample ? (sampleFigures?.totalReleased ?? null) : released.data,
  };
  const tileErrors = {
    contributed: isSample ? null : contributed.error,
    budget: isSample ? null : budget.error,
    granted: isSample ? null : granted.error,
    released: isSample ? null : released.error,
  };

  // A stand-in read view for the "On the chain" / Timeline AsyncViews when the
  // page is a sample: the stand-in config is already in hand, nothing is
  // loading, nothing failed.
  const configView = isSample
    ? { data: configData, loading: false, error: null, fetching: false, archived: false, refetch: () => {} }
    : config;

  return (
    <div className="programme-detail">
      <ProgrammeHeader
        id={programmeId}
        name={displayName}
        creator={configData?.creator ?? null}
        createdLedger={createdLedger}
        createdAt={ledgerCloseTime.data?.closeTime ?? null}
        createdAtIsEstimate={ledgerCloseTime.data?.isEstimate ?? false}
        phase={phaseTag}
        phaseError={!isSample && Boolean(phase.error)}
        verified={!isSample ? (isRegistered.data ?? undefined) : undefined}
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
              programmeName={displayName}
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

      {!isSample && <PausedBanner client={programme} />}

      {!isSample && Boolean(isRegistered.error) && (
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
          value={tileFigure(tile.contributed, tileErrors.contributed)}
          unit={tileUnit(tile.contributed)}
          hint={
            configData
              ? `${configData.fee_bps / 100}% protocol fee`
              : "Put in by funders"
          }
        />
        <StatTile
          label="Budget"
          value={tileFigure(tile.budget, tileErrors.budget)}
          unit={tileUnit(tile.budget)}
          hint="Contributed, less the fee"
        />
        <StatTile
          label="Awarded"
          value={tileFigure(tile.granted, tileErrors.granted)}
          unit={tileUnit(tile.granted)}
          hint={
            tile.granted !== null && tile.budget !== null && tile.budget > ZERO
              ? `${Math.round(percentOf(tile.granted, tile.budget))}% of budget`
              : "Set by the reviewers’ votes"
          }
        />
        <StatTile
          label="Released"
          value={tileFigure(tile.released, tileErrors.released)}
          unit={tileUnit(tile.released)}
          hint={
            configData
              ? `${configData.tranches} ${configData.tranches === 1 ? "tranche" : "tranches"} per award`
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
                feeBps={configData?.fee_bps}
                quorum={configData?.quorum ?? 1}
                asset={asset}
              />
            )}
          </AsyncView>

          <ProgrammeTabs
            programmeId={programmeId}
            phase={phaseName}
            quorum={configData?.quorum ?? 1}
            minimumAward={configData?.minimum_award ?? 0n}
            isSample={isSample}
            asset={asset}
            labels={metadata?.status === "ok" ? metadata.doc.labels : undefined}
          />

          <ProgrammeActivityPanel programmeId={programmeId} isSample={isSample} />
        </div>

        <div className="programme-cols__side">
          <ProgrammeActions
            programmeId={programmeId}
            phase={phaseTag}
            refundsOpen={refundsOpen}
            refundable={refundable > ZERO ? formatAmount(refundable, { asset }) : null}
            verified={!isSample ? (isRegistered.error ? false : isRegistered.data) : true}
          />

          <section className="programme-timeline" aria-labelledby="programme-timeline-title">
            <h2 id="programme-timeline-title" className="programme-timeline__title">
              Timeline
            </h2>
            {isSample && (
              <p className="programme-timeline__sample-note">
                <SampleTag /> Deadlines are stand-in, shaped like the programme&apos;s phase.
              </p>
            )}
            <AsyncView {...configView} onRetry={configView.refetch} contract="program">
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
            {isSample ? "Programme setup" : "On the chain"}
          </h2>
          <p className="programme-chain__lead">
            {isSample
              ? "What this sample programme would be deployed with — stand-in data, nothing is read from the chain."
              : "What the programme was deployed with, read from its contract."}
          </p>
        </div>

        <div className="programme-chain__grid">
          <Card title="Programme rules">
            <AsyncView {...configView} onRetry={configView.refetch} contract="program">
              {(value) => (
                <List className="programme-rules" label="Programme rules">
                  <ListRow
                    title="Creator"
                    trailing={
                      isSample ? (
                        <span className="numeric">{value.creator}</span>
                      ) : (
                        <AddressChip
                          address={value.creator}
                          showExplorerLink
                          copyLabel="Copy creator address"
                        />
                      )
                    }
                  />
                  {!isSample && (
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
                  )}
                  {isSample ? (
                    <ListRow title="Asset" trailing={<span className="numeric">{asset}</span>} />
                  ) : (
                    <ProgrammeAssetRules tokenAddress={value.token} />
                  )}
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
            {isSample ? (
              <p className="programme-chain__sample-desc">
                <SampleTag /> A sample programme has no committed document; its
                description lives only in this fixture&apos;s name.
              </p>
            ) : (
              <AsyncView {...configView} onRetry={configView.refetch} contract="program">
                {(value) => (
                  <MetadataPanel committedHash={value.metadata_hash.toString("hex")} resolved={metadata} />
                )}
              </AsyncView>
            )}
          </Card>

          <Card className="programme-chain__wide" title="Reviewers, verifiers and schema">
            <AsyncView {...configView} onRetry={configView.refetch} contract="program">
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
