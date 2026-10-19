import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Buffer } from 'buffer';
import { useAnnouncer } from '../context/useAnnouncer';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { useContractResult, useProgrammeParam, useTransaction } from '../hooks';
import { ProgrammeParamNotice } from '../components/programme/ProgrammeParamNotice';
import { ErrorPanel, PendingState, TransactionOutcome } from '../components/state/AsyncStates';
import { Badge, Button, Field, Select } from '../components/ui';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { fetchAwards, fetchProgrammes } from '../lib/indexer';
import { readProgrammeLifetimes, type EntryLifetimeRow } from '../lib/entryTtl';
import {
  FIXTURE_TTL,
  TTL_EXTENDED_DAYS,
  TTL_WARNING_DAYS,
  type FixtureTtlEntry,
} from '../fixtures/keepaliveFixtures';
import { explain, type Explained } from '../lib/errors';
import './Keepalive.css';

type EntryState = 'idle' | 'pending' | 'done' | 'error';

const PROGRAMME_ADDRESS = /^C[A-Z2-7]{55}$/;
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Keepalive (Screen 10, Keepalive).
 *
 * Soroban entries that are not bumped become unreadable when their TTL
 * expires, and an archived programme reads as absent rather than as an error.
 * This screen makes expiry visible before it bites: one row per entry group
 * with days left, a warning fill under 30 days, and a bulk extend for
 * everything close to expiry.
 *
 * The lifetimes are still `FIXTURE_TTL` — per-entry TTL reads are a separate
 * issue. The extensions are real: each row sends the matching permissionless
 * `keepalive` call (`program`, `attest` or `record`) through `useTransaction`,
 * and every failure is shown through `explain()`.
 */
export const Keepalive = () => {
  const announce = useAnnouncer();
  const { programmeAt, attest, record } = useSoroban();
  const { address } = useWallet();
  const programmeParam = useProgrammeParam();

  const linkedProgrammeId =
    programmeParam.status === 'valid' ? programmeParam.programmeId : null;
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null);
  const programmeId = selectedProgrammeId ?? linkedProgrammeId ?? DEMO_PROGRAMME_ID;
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const subjectInput = subjectOverride ?? address ?? '';
  const [attestationInput, setAttestationInput] = useState('');
  const [rows, setRows] = useState<Record<string, { state: EntryState; error?: Explained }>>({});
  const [outcome, setOutcome] = useState<{
    key: string;
    contract: 'program' | 'record' | 'attest';
  } | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const programme = useMemo(
    () =>
      PROGRAMME_ADDRESS.test(programmeId) && !programmeParam.blocksProgramme
        ? programmeAt(programmeId)
        : null,
    [programmeAt, programmeId, programmeParam.blocksProgramme],
  );

  const phase = useContractResult(
    () => programme!.get_phase(),
    [programme],
    { contract: 'program', enabled: Boolean(programme) },
  );

  const subject = subjectInput.trim();
  const subjectValid = STELLAR_ADDRESS.test(subject);
  const attestationUid = attestationInput.trim().replace(/^0x/i, '');
  const attestationValid = HEX_32_BYTES.test(attestationUid);

  const currentKey = useRef<string | null>(null);
  const lastError = useRef<Explained | null>(null);

  const markError = (error: Explained) => {
    lastError.current = error;
    const key = currentKey.current;
    if (!key) return;
    setRows((previous) => ({ ...previous, [key]: { state: 'error', error } }));
  };

  const programTx = useTransaction<void>({ contract: 'program', onError: markError });
  const recordTx = useTransaction<void>({ contract: 'record', onError: markError });
  const attestTx = useTransaction<void>({ contract: 'attest', onError: markError });

  const sampleProgramme = !PROGRAMME_ADDRESS.test(programmeId);
  const phaseReason = phase.error
    ? explain(phase.error, 'program').message
    : phase.loading && !phase.data
      ? 'Reading the programme phase…'
      : null;
  const blockedReason =
    programmeParam.blocksProgramme
      ? programmeParam.message
      : sampleProgramme
        ? 'This is a sample programme. Open Keepalive from a real programme to extend its entries.'
        : !address
          ? 'Connect a wallet to pay the network fee.'
          : phaseReason;

  const targetReason = (entry: FixtureTtlEntry): string | null => {
    if (blockedReason) return blockedReason;
    if (entry.target.contract === 'attest') {
      return attestationValid
        ? null
        : 'Paste the 32-byte hex id of the attestation you want to extend.';
    }
    return subjectValid
      ? null
      : 'Enter the subject address whose entries you are extending.';
  };

  const daysFor = (entry: FixtureTtlEntry) =>
    rows[entry.key]?.state === 'done' ? TTL_EXTENDED_DAYS : entry.liveForDays;

  const lowEntries = FIXTURE_TTL.filter(
    (entry) =>
      daysFor(entry) < TTL_WARNING_DAYS &&
      rows[entry.key]?.state !== 'done' &&
      rows[entry.key]?.state !== 'pending',
  );
  const extendableLow = lowEntries.filter((entry) => !targetReason(entry));

  const sendableFor = async (entry: FixtureTtlEntry) => {
    if (entry.target.contract === 'attest') {
      const built = await attest.keepalive({
        uid: Buffer.from(attestationUid, 'hex'),
      });
      return {
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          sent.result.unwrap();
          return { result: undefined };
        },
      };
    }

    if (entry.target.contract === 'record') {
      const built = await record.keepalive({ subject });
      return {
        signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
          const sent = await built.signAndSend(options);
          sent.result.unwrap();
          return { result: undefined };
        },
      };
    }

    if (!programme) throw new Error('Choose a real programme first.');
    const built = await programme.keepalive({ subject });
    return {
      signAndSend: async (options: Parameters<typeof built.signAndSend>[0]) => {
        const sent = await built.signAndSend(options);
        sent.result.unwrap();
        return { result: undefined };
      },
    };
  };

  const runOne = async (entry: FixtureTtlEntry): Promise<boolean> => {
    const reason = targetReason(entry);
    if (reason) return false;

    currentKey.current = entry.key;
    lastError.current = null;
    setRows((previous) => ({ ...previous, [entry.key]: { state: 'pending' } }));
    setOutcome({ key: entry.key, contract: entry.target.contract });

    const tx =
      entry.target.contract === 'attest'
        ? attestTx
        : entry.target.contract === 'record'
          ? recordTx
          : programTx;

    const result = await tx.send(() => sendableFor(entry));
    if (result !== null) {
      setRows((previous) => ({ ...previous, [entry.key]: { state: 'done' } }));
      return true;
    }

    const explained = lastError.current;
    setRows((previous) => ({
      ...previous,
      [entry.key]: { state: 'error', error: explained ?? undefined },
    }));
    return false;
  };

  const extendOne = async (entry: FixtureTtlEntry) => {
    setBulkRunning(false);
    const ok = await runOne(entry);
    if (ok) {
      announce(`Extended ${entry.label} for about ${TTL_EXTENDED_DAYS} days.`);
      phase.refetch();
    }
  };

  const extendAll = async () => {
    setBulkRunning(true);
    setOutcome(null);
    let extended = 0;
    let failed = 0;
    for (const entry of extendableLow) {
      const ok = await runOne(entry);
      if (ok) extended++;
      else failed++;
    }
    setBulkRunning(false);
    phase.refetch();
    announce(
      `Extended ${extended} of ${extendableLow.length} entries.${failed > 0 ? ` ${failed} failed.` : ''}`,
      failed > 0 ? 'alert' : 'status',
    );
  };

  const programmeOptions = useMemo(() => {
    const options = [
      { value: DEMO_PROGRAMME_ID, label: 'Seeded demo programme' },
      ...FIXTURE_PROGRAMMES.filter((item) => item.id !== DEMO_PROGRAMME_ID).map((item) => ({
        value: item.id,
        label: `${item.name ?? item.id} (sample data)`,
      })),
    ];
    if (!options.some((option) => option.value === programmeId)) {
      options.unshift({ value: programmeId, label: 'Programme from the link' });
    }
    return options;
  }, [programmeId]);

  const activeTx =
    outcome?.contract === 'attest' ? attestTx : outcome?.contract === 'record' ? recordTx : programTx;

  return (
    <div className="keepalive-page">
      <header className="keepalive-page__header">
        <h2>Keepalive</h2>
        <p className="typo-text text-muted">
          Entry lifetimes for one programme. Anything close to expiry can be extended before the
          network archives it.
        </p>
      </header>

      <ProgrammeParamNotice state={programmeParam} />

      <p className="keepalive-page__note">
        The network archives stored entries that nobody extends. Anyone can extend them, and
        the network fee for the extension is paid from your own wallet. An archived award or
        contribution can&rsquo;t be released or refunded until it&rsquo;s restored.
      </p>

      <Select
        label="Programme"
        value={programmeId}
        onChange={(event) => {
          setSelectedProgrammeId(event.target.value);
          setRows({});
          setOutcome(null);
        }}
        options={programmeOptions}
      />

      <div className="keepalive-page__targets">
        <Field
          label="Subject address"
          hint="The recipient or donor whose entries you are extending."
          placeholder="G…"
          value={subjectInput}
          onChange={(event) => setSubjectOverride(event.target.value)}
        />
        <Field
          label="Attestation id"
          hint="Only needed for the single-attestation row: a 32-byte hex id."
          placeholder="0x…"
          value={attestationInput}
          onChange={(event) => setAttestationInput(event.target.value)}
        />
      </div>

      {blockedReason && (
        <p className="keepalive-page__blocked" role="note">
          {blockedReason}
        </p>
      )}

      <ul className="ttl-rows">
        {FIXTURE_TTL.map((entry) => {
          const row = rows[entry.key];
          const entryState = row?.state ?? 'idle';
          const days = daysFor(entry);
          const low = days < TTL_WARNING_DAYS;
          const reason = targetReason(entry);
          return (
            <li key={entry.key} className={`ttl-row${low ? ' ttl-row--low' : ''}`}>
              <span className="ttl-row__text">
                <span className="ttl-row__label">{entry.label}</span>
                <span className="ttl-row__note">
                  {entry.note} · ~{days} days left
                </span>
              </span>
              <Button
                variant="secondary"
                disabled={entryState !== 'idle' || Boolean(reason)}
                loading={entryState === 'pending'}
                loadingLabel="Extending…"
                onClick={() => void extendOne(entry)}
              >
                {entryState === 'done' ? 'Extended' : 'Extend'}
              </Button>
              <div className="ttl-row__bar" aria-hidden="true">
                <span
                  className={`ttl-row__fill${low ? ' ttl-row__fill--low' : ''}`}
                  style={{ width: `${Math.min(100, Math.round((days / TTL_EXTENDED_DAYS) * 100))}%` }}
                />
              </div>
              {reason && entryState === 'idle' && (
                <span className="ttl-row__warning" role="note">
                  {reason}
                </span>
              )}
              {low && entryState === 'idle' && !reason && (
                <span className="ttl-row__warning" role="status">
                  Under {TTL_WARNING_DAYS} days — extend soon.
                </span>
              )}
              {entryState === 'pending' && (
                <PendingState title="Extending…" note="Check your wallet to approve." live={false} />
              )}
              {entryState === 'done' && (
                <span className="ttl-row__warning ttl-row__warning--done" role="status">
                  Extended — about {TTL_EXTENDED_DAYS} days left.
                </span>
              )}
              {entryState === 'error' && row.error && (
                <div className="ttl-row__error">
                  <ErrorPanel explained={row.error} live={false} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {extendableLow.length > 0 && (
        <div className="keepalive-page__bulk">
          <Button onClick={() => void extendAll()} loading={bulkRunning} loadingLabel="Extending…">
            Extend the {extendableLow.length} under {TTL_WARNING_DAYS} days
          </Button>
          <p className="typo-text text-muted keepalive-page__bulk-list">
            {extendableLow.map((entry) => entry.label).join(' · ')}
          </p>
        </div>
      )}

      {outcome && !bulkRunning && (
        <TransactionOutcome
          phase={activeTx.phase}
          error={activeTx.error}
          successTitle={
            FIXTURE_TTL.find((entry) => entry.key === outcome.key)?.label
              ? `${FIXTURE_TTL.find((entry) => entry.key === outcome.key)?.label} extended`
              : 'Entry extended'
          }
        />
      )}

      <p className="keepalive-page__sample">
        <Badge tone="neutral">Sample data</Badge> Sample lifetimes for the design phase.
      </p>

      <p className="typo-text text-muted">
        Extending a single attestation also works from its <Link to="/attestations">lookup page</Link>.
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
