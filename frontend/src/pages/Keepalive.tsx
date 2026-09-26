import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncer } from '../context/useAnnouncer';
import { Button, Select } from '../components/ui';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
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
 * The rows below are `FIXTURE_TTL` — per-entry TTL reads are unwired, so these
 * stand in for them. Extending a single attestation for real already works
 * from its lookup page (`/attestations`), which renders the existing
 * `keepalive/` component around the live entry.
 */
export const Keepalive = () => {
  const announce = useAnnouncer();
  const [programmeId, setProgrammeId] = useState<string>(FIXTURE_PROGRAMMES[0]?.id ?? '');
  const [state, setState] = useState<Record<string, EntryState>>({});

  const selected = FIXTURE_PROGRAMMES.find((p) => p.id === programmeId) ?? FIXTURE_PROGRAMMES[0];

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

      <p className="keepalive-page__note">
        The network archives stored entries that nobody extends. Anyone can extend them, and
        network fees are covered. An archived award or contribution can&rsquo;t be released or
        refunded until it&rsquo;s restored.
      </p>

      <Select
        label="Programme"
        value={selected?.id ?? ''}
        onChange={(event) => setProgrammeId(event.target.value)}
        options={FIXTURE_PROGRAMMES.map((p) => ({ value: p.id, label: p.name ?? p.id }))}
      />

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

      <p className="keepalive-page__sample">Sample lifetimes for the design phase.</p>

      <p className="typo-text text-muted">
        Extending a single attestation works from its <Link to="/attestations">lookup page</Link>.
      </p>
    </div>
  );
};
