import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { ProgrammeConfig } from "@milepost/program";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AsyncView, ErrorState } from "../components/state/AsyncStates";
import { PausedBanner } from "../components/programme/PausedBanner";
import { ProgrammeHeader } from "../components/programme/ProgrammeHeader";
import { WhereTheMoneyIs } from "../components/programme/WhereTheMoneyIs";
import { ProgrammeTabs } from "../components/programme/ProgrammeTabs";
import { ProgrammeActions } from "../components/programme/ProgrammeActions";
import { AddToCalendar, AddressChip, Badge, Button, Card, Deadline, Field, List, ListRow, Notice, StatTile } from "../components/ui";
import { useSoroban } from "../context/useSoroban";
import { useContractRead, useContractResult, useIndexedList, useProgramme } from "../hooks";
import { fetchProgrammes } from "../lib/indexer";
import { directoryHref } from "../lib/programmeView";
import { formatAmount, percentOf } from "../lib/amount";
import { formatFigure, isSampleProgrammeId } from "../lib/programmeView";
import { registryVerificationCopy } from "../lib/registryVerification";
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


/**
 * Canonical JSON serialization matching docs/programme-metadata.md:
 * object keys sorted lexicographically, no insignificant whitespace.
 *
 * This must agree with the Rust snippet in programme-metadata.md — both
 * produce sorted compact JSON, so two clients that have the same document
 * will compute the same hash.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const obj = value as Record<string, unknown>;
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
  // Recursively canonicalize nested objects.
  return (
    "{" +
    Object.keys(sorted)
      .map((k) => JSON.stringify(k) + ":" + canonicalize(sorted[k]))
      .join(",") +
    "}"
  );
}

async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Required top-level fields per docs/programme-metadata.md. */
const REQUIRED_FIELDS = [
  "schema_version",
  "name",
  "description",
  "vertical",
  "contact",
] as const;

interface MetadataDoc {
  schema_version: string;
  name: string;
  description: string;
  vertical: string;
  language?: string;
  contact: { name: string; email: string; url?: string };
  links?: Array<{ label: string; url: string }>;
  [key: string]: unknown;
}

type MetadataState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "mismatch"; fetchedHash: string; committedHash: string }
  | { kind: "malformed"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "ok"; doc: MetadataDoc; hash: string };

/**
 * Fetch a metadata document, hash it canonically, and compare against the
 * on-chain commitment. The document is only displayed when hashes match —
 * showing an unverified document would let anyone put words in the creator's
 * mouth.
 */
function MetadataCard({ committedHash }: { committedHash: string }) {
  const [urlInput, setUrlInput] = useState("");
  const [state, setState] = useState<MetadataState>({ kind: "idle" });

  const handleFetch = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setState({ kind: "fetching" });

    let text: string;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setState({
          kind: "unavailable",
          reason: `Server returned ${res.status} ${res.statusText}.`,
        });
        return;
      }
      text = await res.text();
    } catch (err) {
      setState({
        kind: "unavailable",
        reason:
          err instanceof Error
            ? err.message
            : "Could not fetch the document. Check the URL and your connection.",
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setState({
        kind: "malformed",
        reason: "The document is not valid JSON.",
      });
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setState({ kind: "malformed", reason: "The document must be a JSON object." });
      return;
    }

    // Validate required fields.
    for (const field of REQUIRED_FIELDS) {
      const val = (parsed as Record<string, unknown>)[field];
      if (val === undefined || val === null || val === "") {
        setState({
          kind: "malformed",
          reason: `Required field "${field}" is missing or empty.`,
        });
        return;
      }
    }

    // Canonicalize and hash — must match the committed value exactly.
    const canonical = canonicalize(parsed);
    const fetchedHash = await sha256Hex(canonical);

    if (fetchedHash !== committedHash) {
      setState({ kind: "mismatch", fetchedHash, committedHash });
      return;
    }

    setState({ kind: "ok", doc: parsed as MetadataDoc, hash: fetchedHash });
  };

  return (
    <div className="metadata-card">
      <p className="typo-text text-muted metadata-card__intro">
        The programme commits to a metadata document by hash. Paste the URL
        where the document lives — IPFS gateway, Arweave, or the funder&rsquo;s
        own site. The document is hashed and compared against the on-chain
        commitment before anything is displayed; a mismatch is refused.
      </p>

      <div className="metadata-card__fetch">
        <div className="metadata-card__field">
          <Field
            label="Metadata document URL"
            placeholder="https://…"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (state.kind !== "idle") setState({ kind: "idle" });
            }}
          />
        </div>
        <Button
          icon={<FileText size={16} />}
          onClick={() => void handleFetch()}
          disabled={!urlInput.trim() || state.kind === "fetching"}
          loading={state.kind === "fetching"}
          loadingLabel="Fetching…"
        >
          Fetch &amp; verify
        </Button>
      </div>

      {state.kind === "unavailable" && (
        <div
          className="metadata-state metadata-state--warn"
          role="alert"
          aria-live="polite"
        >
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Metadata unavailable.</strong>
            <p className="typo-text text-muted metadata-state__text">
              {state.reason} The on-chain commitment is{" "}
              <code className="numeric">{committedHash}</code>. The programme is
              fully functional — only the human-readable description is missing.
            </p>
          </div>
        </div>
      )}

      {state.kind === "malformed" && (
        <div
          className="metadata-state metadata-state--error"
          role="alert"
          aria-live="polite"
        >
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Document is malformed.</strong>
            <p className="typo-text text-muted metadata-state__text">
              {state.reason} A malformed document cannot be displayed as the
              programme&rsquo;s description.
            </p>
          </div>
        </div>
      )}

      {state.kind === "mismatch" && (
        <div
          className="metadata-state metadata-state--error"
          role="alert"
          aria-live="polite"
        >
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Hash mismatch — document refused.</strong>
            <p className="typo-text text-muted metadata-state__text">
              The fetched document does not hash to the value the programme
              committed to. It is not being displayed.
            </p>
            <dl className="metadata-doc metadata-doc--spaced">
              <div className="metadata-doc__field">
                <dt>Fetched document hash</dt>
                <dd className="numeric">{state.fetchedHash}</dd>
              </div>
              <div className="metadata-doc__field">
                <dt>On-chain commitment</dt>
                <dd className="numeric">{state.committedHash}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {state.kind === "ok" && (
        <div
          className="metadata-state metadata-state--ok"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          <div className="metadata-state__body">
            <strong>Verified against on-chain commitment.</strong>

            <dl className="metadata-doc">
              <div className="metadata-doc__field">
                <dt>Name</dt>
                <dd>{state.doc.name}</dd>
              </div>
              <div className="metadata-doc__field">
                <dt>Description</dt>
                <dd>{state.doc.description}</dd>
              </div>
              <div className="metadata-doc__field">
                <dt>Vertical</dt>
                <dd>{state.doc.vertical}</dd>
              </div>
              {state.doc.language && (
                <div className="metadata-doc__field">
                  <dt>Language</dt>
                  <dd>{state.doc.language}</dd>
                </div>
              )}
              <div className="metadata-doc__field">
                <dt>Contact</dt>
                <dd>
                  {state.doc.contact.name}
                  {" — "}
                  <a href={`mailto:${state.doc.contact.email}`}>
                    {state.doc.contact.email}
                  </a>
                  {state.doc.contact.url && (
                    <>
                      {" "}
                      &mdash;{" "}
                      <a
                        href={state.doc.contact.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {state.doc.contact.url}
                      </a>
                    </>
                  )}
                </dd>
              </div>
              {state.doc.links && state.doc.links.length > 0 && (
                <div className="metadata-doc__field">
                  <dt>Links</dt>
                  <dd>
                    <ul className="metadata-doc__links">
                      {state.doc.links.map((link, i) => (
                        <li key={i}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {link.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              <div className="metadata-doc__field">
                <dt>Schema version</dt>
                <dd className="numeric">{state.doc.schema_version}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

export const ProgrammeDetail = () => {
  const { id: programmeId, client: programme, isDefault } = useProgramme();
  const { registry } = useSoroban();
  const location = useLocation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isRegistered = useContractRead(
    () => registry.is_programme({ addr: programmeId }),
    [registry, programmeId],
  );

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
  const refunded = useContractRead(
    () => programme.total_refunded(),
    [programme],
  );
  const swept = useContractRead(() => programme.total_swept(), [programme]);
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

  const phaseName = phase.data?.tag ?? "Loading";
  const activeDeadline = config.data ? nextDeadline(config.data, nowMs) : null;
  // Name and created ledger come from the published index; the phase is read
  // on-chain and is never taken from the index or a sample.
  const indexRead = useIndexedList(() => fetchProgrammes(), []);
  const indexEntry = useMemo(
    () => (indexRead.data ?? []).find((entry) => entry.id === programmeId) ?? null,
    [indexRead.data, programmeId],
  );
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
        phase={phase.data?.tag ?? null}
        phaseError={Boolean(phase.error)}
        verified={isRegistered.data ?? undefined}
        backTo={directoryHref(location.search)}
        mode={plannedMode}
        sample={isSample}
        deadlines={deadlines}
        nowMs={nowMs}
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
            isSample={isSample}
            asset={asset}
          />
        </div>

        <div className="programme-cols__side">
          <ProgrammeActions
            programmeId={programmeId}
            phase={phase.data?.tag ?? null}
            refundsOpen={refundsOpen}
            refundable={refundable > ZERO ? formatXlm(refundable) : null}
            verified={isRegistered.error ? false : isRegistered.data}
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

          <Card title="Programme metadata">
            <AsyncView {...config} onRetry={config.refetch} contract="program">
              {(value) => (
                <MetadataCard committedHash={value.metadata_hash.toString("hex")} />
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
