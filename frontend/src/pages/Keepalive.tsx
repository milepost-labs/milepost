import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { Badge, Button, Card, Select } from '../components/ui';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { FIXTURE_TTL } from '../fixtures/keepalive';
import { useProgramme } from '../hooks';
import './Keepalive.css';

type ExtensionStatus = 'pending' | 'done';

const LOW_TTL_DAYS = 30;
const EXTENDED_TTL_DAYS = 90;

function labelForProgramme(programmeId: string): string {
  return programmeId === DEMO_PROGRAMME_ID ? 'Seeded testnet programme' : programmeId;
}

export function Keepalive() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: programmeId, linkedProgramme } = useProgramme();
  const [extensions, setExtensions] = useState<Record<string, ExtensionStatus>>({});
  const [announce, setAnnounce] = useState('');
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const options = useMemo(() => {
    const entries = [{ value: programmeId, label: labelForProgramme(programmeId) }];
    if (programmeId !== DEMO_PROGRAMME_ID) {
      entries.push({ value: DEMO_PROGRAMME_ID, label: labelForProgramme(DEMO_PROGRAMME_ID) });
    }
    return entries;
  }, [programmeId]);

  const rows = useMemo(() => {
    return FIXTURE_TTL.map((entry) => {
      const stateKey = `${programmeId}:${entry.key}`;
      const status = extensions[stateKey];
      const days = status === 'done' ? EXTENDED_TTL_DAYS : entry.liveForDays;
      return {
        ...entry,
        stateKey,
        status,
        days,
        low: days < LOW_TTL_DAYS,
        width: `${Math.min(100, (Math.max(0, days) / EXTENDED_TTL_DAYS) * 100).toFixed(0)}%`,
      };
    });
  }, [extensions, programmeId]);

  const extend = (keys: string[]) => {
    setExtensions((current) => {
      const next = { ...current };
      keys.forEach((key) => {
        next[`${programmeId}:${key}`] = 'pending';
      });
      return next;
    });
    setAnnounce('');

    const timer = window.setTimeout(() => {
      setExtensions((current) => {
        const next = { ...current };
        keys.forEach((key) => {
          next[`${programmeId}:${key}`] = 'done';
        });
        return next;
      });
      setAnnounce(`Extended ${keys.length} ${keys.length === 1 ? 'entry' : 'entries'} for about 90 days.`);
    }, 800);
    timers.current.push(timer);
  };

  const updateProgramme = (nextProgrammeId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('programme', nextProgrammeId);
    setSearchParams(next);
  };

  if (linkedProgramme.blocksProgramme) {
    return (
      <div className="dashboard-container keepalive-page">
        <ProgrammeParamNotice state={linkedProgramme} />
      </div>
    );
  }

  const lowRows = rows.filter((row) => !row.status && row.low);

  return (
    <div className="dashboard-container keepalive-page">
      <header className="dashboard-header">
        <h1>Keepalive</h1>
        <p className="typo-text text-muted">
          The network archives stored entries that nobody extends. Anyone can keep programme entries alive before
          release, refund, or proof reads need them.
        </p>
      </header>

      <div className="keepalive-page__intro">
        <Clock size={20} aria-hidden="true" />
        <p>
          An archived award or contribution can still be restored, but restoration adds cost and delay at the moment
          someone is trying to act on it.
        </p>
      </div>

      <div className="keepalive-page__programme">
        <Select
          label="Programme"
          value={programmeId}
          options={options}
          onChange={(event) => updateProgramme(event.target.value)}
        />
      </div>

      <Card title="Entries" aside={<Badge tone="neutral">Sample lifetimes</Badge>}>
        <div className="keepalive-page__rows">
          {rows.map((row) => (
            <div key={row.key} className="keepalive-page__row">
              <div className="keepalive-page__row-main">
                <h2>{row.label}</h2>
                <p className="typo-text text-muted">
                  {row.note} - ~{row.days} days left
                </p>
              </div>
              <div className="keepalive-page__row-actions">
                <Badge tone={row.low ? 'warning' : 'neutral'}>{row.low ? 'Under 30 days' : 'Healthy'}</Badge>
                <Button
                  variant="secondary"
                  onClick={() => extend([row.key])}
                  disabled={row.status === 'pending' || row.status === 'done'}
                  loading={row.status === 'pending'}
                  loadingLabel="Extending..."
                >
                  {row.status === 'done' ? 'Extended' : 'Extend'}
                </Button>
              </div>
              <div className="keepalive-page__meter" aria-hidden="true">
                <span
                  className="keepalive-page__meter-fill"
                  style={{
                    width: row.width,
                    background: row.low ? 'var(--warning)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {lowRows.length > 0 && (
        <Button icon={<ShieldCheck size={18} />} onClick={() => extend(lowRows.map((row) => row.key))}>
          Extend the {lowRows.length} under 30 days
        </Button>
      )}
      <p className="typo-text text-muted" aria-live="polite">{announce}</p>
    </div>
  );
}
