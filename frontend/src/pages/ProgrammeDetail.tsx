import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Phase, ProgrammeConfig } from "@milepost/program";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AsyncView } from "../components/state/AsyncStates";
import { PausedBanner } from "../components/programme/PausedBanner";
import { Badge, Button, Card, Field, PhaseBadge, Stat, Table } from "../components/ui";
import { useSoroban } from "../context/useSoroban";
import { useContractRead, useContractResult, useProgramme } from "../hooks";
import { formatAmount, percentOf } from "../lib/amount";
import { registryVerificationCopy } from "../lib/registryVerification";
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <p className="typo-text text-muted" style={{ margin: 0 }}>
        The programme commits to a metadata document by hash. Paste the URL
        where the document lives — IPFS gateway, Arweave, or the funder&rsquo;s
        own site. The document is hashed and compared against the on-chain
        commitment before anything is displayed; a mismatch is refused.
      </p>

      <div
        style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-3)" }}
      >
        <div style={{ flex: 1 }}>
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
            <p className="typo-text text-muted" style={{ margin: "0.25rem 0 0" }}>
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
            <p className="typo-text text-muted" style={{ margin: "0.25rem 0 0" }}>
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
            <p className="typo-text text-muted" style={{ margin: "0.25rem 0 0" }}>
              The fetched document does not hash to the value the programme
              committed to. It is not being displayed.
            </p>
            <dl
              style={{
                margin: "0.75rem 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div>
                <dt
                  style={{
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                  }}
                >
                  Fetched document hash
                </dt>
                <dd className="numeric" style={{ margin: 0, fontSize: "var(--text-sm)", overflowWrap: "anywhere" }}>
                  {state.fetchedHash}
                </dd>
              </div>
              <div>
                <dt
                  style={{
                    fontSize: "var(--text-xs)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                  }}
                >
                  On-chain commitment
                </dt>
                <dd className="numeric" style={{ margin: 0, fontSize: "var(--text-sm)", overflowWrap: "anywhere" }}>
                  {state.committedHash}
                </dd>
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
          <div style={{ flex: 1 }}>
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
      <PausedBanner client={programme} />

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
        <Card title="Registry verification">
          <AsyncView
            {...isRegistered}
            onRetry={isRegistered.refetch}
            contract="registry"
          >
            {(deployedByRegistry) => {
              const copy = registryVerificationCopy(deployedByRegistry);
              return (
                <div className="verification-panel">
                  {deployedByRegistry ? (
                    <ShieldCheck aria-hidden="true" />
                  ) : (
                    <ShieldAlert aria-hidden="true" />
                  )}
                  <div>
                    <Badge tone={copy.tone}>{copy.label}</Badge>
                    <p className="typo-text text-muted">{copy.description}</p>
                  </div>
                </div>
              );
            }}
          </AsyncView>
        </Card>

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

        <Card title="Programme metadata">
          <AsyncView {...config} onRetry={config.refetch} contract="program">
            {(value) => (
              <MetadataCard committedHash={value.metadata_hash.toString("hex")} />
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
