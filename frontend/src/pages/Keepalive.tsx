import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc } from '@stellar/stellar-sdk';
import { useAnnouncer } from '../context/useAnnouncer';
import { useSoroban } from '../context/useSoroban';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { useIndexedList, useProgrammeParam } from '../hooks';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { ErrorState, Loading } from '../components/state/AsyncStates';
import { Button, Select } from '../components/ui';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { fetchAwards, fetchProgrammes } from '../lib/indexer';
import { readProgrammeLifetimes, type EntryLifetimeRow } from '../lib/entryTtl';
import {
  FIXTURE_TTL,
  TTL_EXTENDED_DAYS,
  TTL_WARNING_DAYS,
} from '../fixtures/keepaliveFixtures';
import './Keepalive.css';

type EntryState = 'idle' | 'pending' | 'done';

/**
 * Keepalive (Screen 10, Keepalive).
 *
 * Soroban entries that are not bumped become unreadable when their TTL
 * expires, and an archived programme reads as absent rather than as an error.
 * This screen makes expiry visible before it bites: one row per entry group
 * with days left, a warning fill under 30 days, and a bulk extend for
 * everything close to expiry.
 *
 * Real programmes show lifetimes read from the RPC (`getLedgerEntries`, see
 * `lib/entryTtl.ts`): the contract instance and every award the published
 * index names. Contributions and applications are keyed by addresses nothing
 * publishes, so the page says they were not checked. The sample programmes
 * keep `FIXTURE_TTL` and the "Sample data" tag. Extending a single
 * attestation for real already works from its lookup page (`/attestations`).
 */
export const Keepalive = () => {
  const announce = useAnnouncer();
  const programmeParam = useProgrammeParam();
  const { rpcUrl } = useSoroban();
  const [programmeId, setProgrammeId] = useState<string>(() =>
    programmeParam.status === 'valid' && programmeParam.programmeId
      ? programmeParam.programmeId
      : DEMO_PROGRAMME_ID,
  );
  const [state, setState] = useState<Record<string, EntryState>>({});

  const isSample = FIXTURE_PROGRAMMES.some((p) => p.id === programmeId);
  const indexed = useIndexedList(fetchProgrammes, []);
  const programmeOptions = useMemo(() => {
    const real = new Map<string, string>();
    if (programmeParam.status === 'valid' && programmeParam.programmeId) {
      real.set(programmeParam.programmeId, programmeParam.programmeId);
    }
    real.set(DEMO_PROGRAMME_ID, 'Seeded testnet programme');
    for (const p of indexed.data ?? []) real.set(p.id, p.name ?? p.id);
    return [
      ...[...real].map(([value, label]) => ({ value, label })),
      ...FIXTURE_PROGRAMMES.map((p) => ({ value: p.id, label: `${p.name ?? p.id} (sample)` })),
    ];
  }, [indexed.data, programmeParam.programmeId, programmeParam.status]);

  const server = useMemo(
    () => new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') }),
    [rpcUrl],
  );
  const awards = useIndexedList(() => fetchAwards(programmeId), [programmeId], {
    enabled: !isSample,
  });
  // A programme with no published awards has no awards.json; that is not a failure here.
  const recipients = useMemo(
    () => (awards.data ?? []).map((a) => a.recipient),
    [awards.data],
  );
  const lifetimes = useIndexedList(
    () => readProgrammeLifetimes(server, programmeId, recipients),
    [server, programmeId, recipients],
    { enabled: !isSample && !awards.fetching },
  );

  const extend = (keys: string[]) => {
    if (keys.length === 0) return;
    setState((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        if (next[`${programmeId}:${key}`] !== 'done') next[`${programmeId}:${key}`] = 'pending';
      }
      return next;
    });
    window.setTimeout(() => {
      setState((prev) => {
        const next = { ...prev };
        for (const key of keys) next[`${programmeId}:${key}`] = 'done';
        return next;
      });
      announce(
        `Extended ${keys.length} ${keys.length === 1 ? 'entry' : 'entries'} for about ${TTL_EXTENDED_DAYS} days.`,
      );
    }, 1300);
  };

  const daysFor = (liveForDays: number, key: string) =>
    state[`${programmeId}:${key}`] === 'done' ? TTL_EXTENDED_DAYS : liveForDays;

  const lowKeys = FIXTURE_TTL.filter(
    (entry) =>
      daysFor(entry.liveForDays, entry.key) < TTL_WARNING_DAYS &&
      state[`${programmeId}:${entry.key}`] !== 'done' &&
      state[`${programmeId}:${entry.key}`] !== 'pending',
  ).map((entry) => entry.key);

  return (
    <div className="keepalive-page">
      <header className="keepalive-page__header">
        <h1>Keepalive</h1>
        <p className="typo-text text-muted">
          Entry lifetimes for one programme. Anything close to expiry can be extended before the
          network archives it.
        </p>
      </header>

      <ProgrammeParamNotice state={programmeParam} />

      <p className="keepalive-page__note">
        The network archives stored entries that nobody extends. Anyone can extend them, and
        network fees are covered. An archived award or contribution can&rsquo;t be released or
        refunded until it&rsquo;s restored.
      </p>

      <Select
        label="Programme"
        value={programmeId}
        onChange={(event) => setProgrammeId(event.target.value)}
        options={programmeOptions}
      />

      {!isSample && (
        <RealLifetimes
          loading={awards.fetching || lifetimes.loading}
          error={lifetimes.error}
          rows={lifetimes.data?.rows ?? null}
          unchecked={lifetimes.data?.unchecked ?? []}
          onRetry={lifetimes.refetch}
        />
      )}

      {isSample && (
        <>
      <ul className="ttl-rows">
        {FIXTURE_TTL.map((entry) => {
          const entryState = state[`${programmeId}:${entry.key}`] ?? 'idle';
          const days = daysFor(entry.liveForDays, entry.key);
          const low = days < TTL_WARNING_DAYS;
          return (
            <li
              key={entry.key}
              className={`ttl-row${low ? ' ttl-row--low' : ''}`}
            >
              <span className="ttl-row__text">
                <span className="ttl-row__label">{entry.label}</span>
                <span className="ttl-row__note">
                  {entry.note} · ~{days} days left
                </span>
              </span>
              <Button
                variant="secondary"
                disabled={entryState !== 'idle'}
                loading={entryState === 'pending'}
                loadingLabel="Extending…"
                onClick={() => extend([entry.key])}
              >
                {entryState === 'done' ? 'Extended' : 'Extend'}
              </Button>
              <div className="ttl-row__bar" aria-hidden="true">
                <span
                  className={`ttl-row__fill${low ? ' ttl-row__fill--low' : ''}`}
                  style={{ width: `${Math.min(100, Math.round((days / TTL_EXTENDED_DAYS) * 100))}%` }}
                />
              </div>
              {low && entryState === 'idle' && (
                <span className="ttl-row__warning" role="status">
                  Under {TTL_WARNING_DAYS} days — extend soon.
                </span>
              )}
              {entryState === 'done' && (
                <span className="ttl-row__warning ttl-row__warning--done" role="status">
                  Extended — about {TTL_EXTENDED_DAYS} days left.
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {lowKeys.length > 0 && (
        <div className="keepalive-page__bulk">
          <Button onClick={() => extend(lowKeys)}>
            Extend the {lowKeys.length} under {TTL_WARNING_DAYS} days
          </Button>
          <p className="typo-text text-muted keepalive-page__bulk-list">
            {FIXTURE_TTL.filter((entry) => lowKeys.includes(entry.key))
              .map((entry) => entry.label)
              .join(' · ')}
          </p>
        </div>
      )}

      <p className="keepalive-page__sample">Sample data: these lifetimes are not read from the chain.</p>
        </>
      )}

      <p className="typo-text text-muted">
        Extending a single attestation works from its <Link to="/attestations">lookup page</Link>.
      </p>
    </div>
  );
};

function RealLifetimes({
  loading,
  error,
  rows,
  unchecked,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  rows: EntryLifetimeRow[] | null;
  unchecked: string[];
  onRetry: () => void;
}) {
  if (loading && !rows) return <Loading label="Reading entry lifetimes" rows={2} />;
  if (error && !rows) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows) return null;

  return (
    <>
      <ul className="ttl-rows">
        {rows.map((row) => {
          const days = row.liveForDays;
          const low = days !== null && days < TTL_WARNING_DAYS;
          return (
            <li key={row.key} className={`ttl-row${low ? ' ttl-row--low' : ''}`}>
              <span className="ttl-row__text">
                <span className="ttl-row__label">{row.label}</span>
                <span className="ttl-row__note">
                  {row.note} · {days === null ? 'not found on chain' : `~${days} days left`}
                </span>
              </span>
              <div className="ttl-row__bar" aria-hidden="true">
                <span
                  className={`ttl-row__fill${low ? ' ttl-row__fill--low' : ''}`}
                  style={{
                    width: `${days === null ? 0 : Math.min(100, Math.round((days / TTL_EXTENDED_DAYS) * 100))}%`,
                  }}
                />
              </div>
              {low && (
                <span className="ttl-row__warning" role="status">
                  Under {TTL_WARNING_DAYS} days — extend soon.
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {unchecked.length > 0 && (
        <p className="keepalive-page__unchecked">
          Not checked: {unchecked.join(' and ')}. Their entries are keyed by contributor and
          applicant addresses that are not published, so they can&rsquo;t be looked up from here.
        </p>
      )}
    </>
  );
}
